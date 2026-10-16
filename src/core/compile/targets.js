import { Reader, checkAttrs } from '../lang/reader.js';
import { POSITIONAL, SEGMENTED, BOXED, TIMING, EFFECTS, modAttrs } from '../lang/schema.js';
import { lerp, clamp, EASINGS } from '../util/ease.js';
import { mix } from '../util/color.js';
import { buildPath, trailSamples, headingAt, shortestAngle, bulgePoints } from '../util/path.js';
import * as FX from './effects.js';
import { EPS, cellToXY, warnOutside, seg, placeToXY } from './scene.js';
import { looksLikePlace } from '../geo/place.js';

const rad = (d) => (d * Math.PI) / 180;

// ---------------- 路径 ----------------
// 路径与尾迹统一用 util/path.js 的“按弧长参数化”实现：圆心与尾迹笔尖用同一个参数，永远重合。

const halfOf = (ent, st) => (BOXED.has(ent.type) ? st.h : st.size) / 2;

/**
 * 尾迹：沿移动路径采样出一条折线，随进度"长出来"，走完保留在画面上。
 * 它是一个由编译器创建的内部对象（type='trace'），不能被脚本引用，也不参与重叠检查。
 */
function makeTrail(ctx, ent, node, path, dur, start, ease, r) {
  const { scene } = ctx;
  const st = ctx.state.get(ent.id);
  const color = r.has('trail') && r.raw('trail').trim() ? r.color('trail', st.fill) : st.fill;
  // 采样点按弧长均匀分布、间距约 2px：折线本身已是光滑曲线，draw 进度 = 弧长比例 = 圆心位置
  const pts = path.sample(trailSamples(path.length));
  const id = `${ent.id}~trail${++ctx.auto}`;
  const trace = {
    index: scene.entities.length, id, type: 'trace', line: node.line, col: node.col,
    layer: ent.layer, groups: [], birth: start, death: Infinity, pts, internal: true, owner: ent.index,
    init: {
      x: 0, y: 0, size: 0, w: 0, h: 0, rot: 0, fill: [0, 0, 0, 0], stroke: color,
      width: Math.max(3, Math.min(ent.init.size * 0.1, 8)), color: [255, 255, 255, 1],
      draw: 0, x1: 0, y1: 0, x2: 0, y2: 0, text: '', label: '', alpha: 0.6, z: (ent.init.z ?? 0) - 1,
    },
  };
  scene.entities.push(trace);
  scene.byId.set(id, trace);
  ctx.state.set(id, { ...trace.init });
  seg(ctx, trace, {
    t0: start, dur, kind: 'move', props: ['draw'], tag: node.tag, line: node.line, col: node.col, internal: true,
    fn: (L, p) => { L.draw = ease(p); },
  });
}

// ---------------- 登场 ----------------
const INTROS = ['pop', 'fade', 'drop', 'draw', 'type', 'none'];
const DEFAULT_IN = { line: 'draw', arrow: 'draw', grid: 'fade' };

export function compileIntro(ent, node, r, start, ctx) {
  const def = DEFAULT_IN[ent.type] || 'pop';
  let mode = r.has('in') ? r.raw('in') || def : def;
  if (!INTROS.includes(mode)) {
    ctx.diag.warn('W_BAD_VALUE', `in 只能是 ${INTROS.join(' / ')}，实际是 "${mode}"，已改用 ${def}`, r.at('in'));
    mode = def;
  }
  if (mode === 'draw' && !SEGMENTED.has(ent.type)) {
    ctx.diag.warn('W_NOT_APPLICABLE', 'in="draw" 只适用于 line / arrow，已改用 fade', r.at('in'));
    mode = 'fade';
  }
  if (mode === 'type' && !(ent.type === 'text' || ent.type === 'icon')) {
    ctx.diag.warn('W_NOT_APPLICABLE', 'in="type"（打字机）只适用于 text / icon，已改用 fade', r.at('in'));
    mode = 'fade';
  }
  if (mode === 'none') return start;
  const dur = r.has('dur') ? r.num('dur', 0.45, { min: 0 }) : mode === 'draw' ? 0.8 : mode === 'type' ? 0.9 : 0.45;
  const base = { t0: start, dur, kind: 'intro', tag: node.tag, line: node.line, col: node.col, internal: true };
  if (mode === 'draw') seg(ctx, ent, { ...base, props: ['draw'], fn: (L, p) => { L.draw = EASINGS.out(p); } });
  else if (mode === 'type') seg(ctx, ent, { ...base, props: ['reveal'], fn: (L, p) => { L.reveal = clamp(p); } }); // 逐字匀速显现
  else seg(ctx, ent, { ...base, mode: 'add', fn: FX.introFn(mode, ctx.scene.unit * 1.1) });
  return start + dur;
}

// ---------------- 叠加型效果 ----------------
export function compileEffects(ctx, node, r, ent, st, start, opts = {}) {
  const { scene, diag } = ctx;
  const U = scene.unit;
  const present = EFFECTS.filter((k) => k !== 'loop' && k !== 'yoyo' && r.has(k));
  if (!present.length) return start;
  if (!POSITIONAL.has(ent.type)) {
    diag.warn('W_NOT_APPLICABLE', `<${ent.type}> 不支持 ${present.join(' / ')}`, r.at(present[0]));
    return start;
  }
  let end = start;
  const explicit = r.has('dur') ? r.num('dur', 0, { min: 0 }) : null;
  const half = halfOf(ent, st);
  const base = { t0: start, tag: node.tag, line: node.line, col: node.col };
  const add = (dur, fn) => {
    seg(ctx, ent, { ...base, dur, mode: 'add', kind: 'effect', fn });
    end = Math.max(end, start + dur);
  };

  if (r.has('pulse')) add(explicit ?? 0.5, FX.pulseFn(r.numOr('pulse', 0.25)));
  if (r.has('shake')) add(explicit ?? 0.5, FX.shakeFn(r.lenOr('shake', U * 0.12), 8));
  if (r.has('flash')) add(explicit ?? 0.5, FX.flashFn(r.numOr('flash', 3)));
  if (r.has('wobble')) add(explicit ?? 0.6, FX.wobbleFn(r.numOr('wobble', 12), 3));
  if (r.has('jump') && !opts.skipJump) add(explicit ?? 0.8, FX.jumpFn(r.lenOr('jump', U * 0.7, { min: 0 }), half));
  if (r.has('spin')) {
    const dur = explicit ?? 1, from = st.rot, to = from + rad(r.numOr('spin', 360)), ease = r.ease('ease', 'soft');
    seg(ctx, ent, { ...base, dur, kind: 'transform', props: ['rot'], fn: (L, p) => { L.rot = lerp(from, to, ease(p)); } });
    st.rot = to;
    end = Math.max(end, start + dur);
  }
  if (r.has('do')) {
    const name = r.raw('do').trim();
    const anim = scene.anims.get(name);
    if (!anim) {
      const names = [...scene.anims.keys()];
      diag.error('E_UNKNOWN_ANIM', `找不到关键帧动画 "${name}"`, r.at('do'), names.length ? `已定义：${names.join(', ')}` : '先用 <anim name="…"> 定义');
    } else {
      const loops = Math.floor(r.num('loop', 1, { min: 1, max: 100 }));
      add((explicit ?? anim.dur) * loops, FX.animFn(anim, loops, r.flag('yoyo'), scene.cw, scene.ch));
    }
  }
  return end;
}

// ---------------- 修改对象 ----------------
/**
 * 把节点上写的"目标状态"编译成补间片段。
 * 返回结束时间；对每个对象独立调用（组/通配展开在 steps.js 里完成）。
 */
export function compileTarget(node, ent, ctx, stepDur, base, viaChange) {
  const { scene, diag } = ctx;
  const names = modAttrs(ent.type);
  const r = new Reader(node, diag, scene.unit, scene.theme);
  const start = base + r.num('delay', 0, { min: 0 });
  if (ent.death !== Infinity && start >= ent.death - EPS) {
    // 通过组名/通配批量修改时，已退场的成员静默跳过；直接点名才算错误
    if (!ctx.batch) diag.error('E_GONE', `对象 "${ent.id}" 已在前面的步骤退场，不能再修改`, node);
    return base;
  }
  const st = ctx.state.get(ent.id);
  const dur = r.num('dur', stepDur, { min: 0 });
  const has = (n) => names.has(n) && r.has(n);
  const easeOf = (prop) => (r.has(`${prop}.ease`) ? r.ease(`${prop}.ease`, 'soft') : r.ease('ease', 'soft'));
  let end = start, did = false;

  const mk = (kind, props, fn, o = {}) => {
    const d = o.dur ?? dur;
    seg(ctx, ent, { t0: start, dur: d, props, mode: o.mode ?? 'set', kind, fn, tag: node.tag, line: node.line, col: node.col });
    end = Math.max(end, start + d);
    did = true;
  };
  const scalar = (prop, to, kind) => {
    if (!Number.isFinite(to)) return;
    const from = st[prop], ease = easeOf(prop);
    mk(kind, [prop], (L, p) => { L[prop] = lerp(from, to, ease(p)); });
    st[prop] = to;
  };
  const color = (prop, to) => {
    const from = st[prop], ease = easeOf(prop);
    mk('style', [prop], (L, p) => { L[prop] = mix(from, to, ease(p)); });
    st[prop] = to;
  };

  // ---- 位置 ----
  let jumpDone = false;
  if (POSITIONAL.has(ent.type)) {
    const keys = ['at', 'px', 'by', 'path', 'orbit', 'city', 'lonlat'].filter((k) => r.has(k));
    if (keys.length > 1) diag.warn('W_MULTI_POS', `同时写了 ${keys.join(' / ')}，只使用 ${keys[0]}`, r.at(keys[1]));
    let pts = null;
    const here = [st.x, st.y];
    if (keys[0] === 'orbit') {
      // 绕圆心匀速转圈：真正的圆，不走折线逼近（解决"绕轨道跑偏"）
      const rad = r.lenOr('orbit', scene.unit * 0.5, { min: 0 });
      const around = r.pos('around');
      if (around) {
        const [acx, acy] = cellToXY(scene, around);
        const turns = r.num('turns', 1);
        const fromAngle = Math.atan2(st.y - acy, st.x - acx);
        const ease = easeOf('orbit');
        // heading：车头沿圆周切线转。切线方向 = 位置角 ± 90°（顺时针 turns>0 时 +90°）；用累计角度，不会在 ±180° 处跳变
        const headingOn = r.has('heading');
        const base = headingOn ? (r.numOr('heading', 0) * Math.PI) / 180 : 0;
        const rot0 = st.rot;
        const side = turns >= 0 ? Math.PI / 2 : -Math.PI / 2;
        const rotAt = (a) => a + side - base;
        const props = headingOn ? ['x', 'y', 'rot'] : ['x', 'y'];
        mk('move', props, (L, p) => {
          const a = fromAngle + turns * Math.PI * 2 * ease(p);
          L.x = acx + rad * Math.cos(a);
          L.y = acy + rad * Math.sin(a);
          if (headingOn) L.rot = shortestAngle(rot0, rotAt(fromAngle)) + (a - fromAngle);
        }, { dur });
        if (headingOn) st.rot = shortestAngle(rot0, rotAt(fromAngle)) + turns * Math.PI * 2;
        if (r.has('trail')) {
          const arc = {
            length: Math.abs(turns) * Math.PI * 2 * rad,
            at: (q) => { const a = fromAngle + turns * Math.PI * 2 * q; return [acx + rad * Math.cos(a), acy + rad * Math.sin(a)]; },
          };
          arc.sample = (n) => Array.from({ length: n + 1 }, (_, i) => arc.at(i / n));
          makeTrail(ctx, ent, node, arc, dur, start, ease, r);
        }
      } else {
        diag.error('E_MISSING_ATTR', 'orbit 需要 around="圆心坐标"', r.at('orbit'));
      }
    } else if (keys[0] === 'at' && looksLikePlace(r.raw('at'))) {
      const xy = placeToXY(ctx, r.raw('at'), r.at('at'));
      if (xy) pts = [here, xy];
    } else if (keys[0] === 'at') {
      const p = r.pos('at');
      if (p) { warnOutside(ctx, p, r.at('at')); pts = [here, cellToXY(scene, p)]; }
    } else if (keys[0] === 'city' || keys[0] === 'lonlat') {
      const xy = placeToXY(ctx, r.raw(keys[0]), r.at(keys[0]));
      if (xy) pts = [here, xy];
    } else if (keys[0] === 'px') {
      const p = r.pair('px');
      if (p) pts = [here, p];
    } else if (keys[0] === 'by') {
      const p = r.pair('by');
      if (p) pts = [here, [st.x + p[0] * scene.cw, st.y + p[1] * scene.ch]];
    } else if (keys[0] === 'path') {
      const toks = r.raw('path').trim().split(/\s+/).filter(Boolean);
      if (toks.some(looksLikePlace)) {
        // 路线按站点：path="北京 武汉 广州"，每个 token 是城市名；也可混写 "104.06,30.66"
        const xs = toks.map((tk) => placeToXY(ctx, tk, r.at('path')));
        if (xs.every(Boolean)) pts = [here, ...xs];
      } else {
        const list = r.posList('path');
        if (list && list.length) {
          list.forEach((p) => warnOutside(ctx, p, r.at('path')));
          pts = [here, ...list.map((p) => cellToXY(scene, p))];
        }
      }
    }
    if (pts) {
      // arc：每一段向左凸出一点（负数向右），自动按曲线走；不必再写 smooth
      const arc = r.has('arc') ? r.numOr('arc', 0.18, { min: -1, max: 1 }) : 0;
      const path = arc ? buildPath(bulgePoints(pts, arc), true) : buildPath(pts, r.flag('smooth'));
      const fn = path.at;
      const total = path.length;
      const jumpOn = r.has('jump'), walkOn = r.has('walk');
      let mdur = dur, ease = easeOf(keys[0]);
      if (jumpOn) { mdur = r.has('dur') ? dur : 0.8; ease = FX.jumpWarp; }
      // heading：图形的“车头”朝向，随路径切线转。heading="0" 表示图形默认朝右，"-90" 表示默认朝上
      const headingOn = r.has('heading') && POSITIONAL.has(ent.type);
      if (headingOn) {
        const base = rad(r.numOr('heading', 0)); // 图形默认“车头”的角度；要朝向运动方向 h，图形需旋转 h - base
        const rot0 = st.rot;
        let prev = rot0;
        // 先沿路径预采样出每个位置的朝向（并让相邻角度走最短弧），运行时只查表，求值保持纯函数
        const N = Math.max(24, Math.min(400, Math.ceil(path.length / 4)));
        const table = [];
        for (let i = 0; i <= N; i++) {
          const h = headingAt(path, i / N);
          prev = h === null ? prev : shortestAngle(prev, h - base);
          table.push(prev);
        }
        mk('move', ['x', 'y', 'rot'], (L, p) => {
          const e = ease(p), q = fn(e);
          L.x = q[0]; L.y = q[1];
          const u = Math.max(0, Math.min(1, e)) * N, i = Math.min(N - 1, Math.floor(u));
          L.rot = table[i] + (table[i + 1] - table[i]) * (u - i);
        }, { dur: mdur });
        st.rot = table[N];
      } else {
        mk('move', ['x', 'y'], (L, p) => { const q = fn(ease(p)); L.x = q[0]; L.y = q[1]; }, { dur: mdur });
      }
      if (r.has('trail')) makeTrail(ctx, ent, node, path, mdur, start, ease, r);
      const last = pts[pts.length - 1];
      if (jumpOn) {
        mk('effect', [], FX.jumpFn(r.lenOr('jump', scene.unit * 0.7, { min: 0 }), halfOf(ent, st)), { mode: 'add', dur: mdur });
        jumpDone = true;
      } else if (walkOn && total > 1) {
        if (ent.type === 'circle') {
          const dx = last[0] - here[0], dy = last[1] - here[1];
          const travel = Math.abs(dx) >= 1 ? dx : dy, rot0 = st.rot, radius = Math.max(1, st.size / 2);
          mk('move', ['rot'], (L, p) => { L.rot = rot0 + (travel * ease(p)) / radius; }, { dur: mdur });
          st.rot = rot0 + travel / radius;
        } else {
          const steps = Math.max(1, Math.round(total / (Math.max(st.size, 1) * 0.9)));
          mk('effect', [], FX.hopFn(steps, Math.max(st.size, 1) * 0.2, halfOf(ent, st), ease), { mode: 'add', dur: mdur });
        }
      }
      st.x = last[0];
      st.y = last[1];
    }
  }
  for (const [attr, px, py] of [['from', 'x1', 'y1'], ['to', 'x2', 'y2']]) {
    if (!has(attr) || !SEGMENTED.has(ent.type)) continue;
    if (scene.byId.has(r.raw(attr).trim())) {
      diag.error('E_BAD_VALUE', `步骤里不能把线条端点改成对象 id "${r.raw(attr).trim()}"`, r.at(attr), '对象 id 只能在创建连线时写；步骤里请写格子坐标，或新建一条连线');
      continue;
    }
    const p = r.pos(attr);
    if (!p) continue;
    warnOutside(ctx, p, r.at(attr));
    const [x, y] = cellToXY(scene, p), fx = st[px], fy = st[py], ease = easeOf(attr);
    mk('move', [px, py], (L, q) => { const e = ease(q); L[px] = lerp(fx, x, e); L[py] = lerp(fy, y, e); });
    st[px] = x;
    st[py] = y;
  }

  // ---- 尺寸 / 旋转 / 样式 ----
  if (has('size')) {
    const v = r.len('size', null, { min: 1 });
    if (v !== null) {
      if (BOXED.has(ent.type)) {
        if (!r.has('w')) scalar('w', v, 'transform');
        if (!r.has('h')) scalar('h', v, 'transform');
      } else scalar('size', v, 'transform');
    }
  }
  if (has('w')) {
    if (BOXED.has(ent.type)) scalar('w', r.len('w', null, { min: 1 }) ?? NaN, 'transform');
    else if (ent.type === 'text') scalar('w', r.len('w', null, { min: 0 }) ?? NaN, 'transform');
  }
  if (has('h') && BOXED.has(ent.type)) scalar('h', r.len('h', null, { min: 1 }) ?? NaN, 'transform');
  if (has('rot')) scalar('rot', rad(r.num('rot', 0)), 'transform');
  if (has('alpha')) scalar('alpha', r.num('alpha', 1, { min: 0, max: 1 }), 'style');
  if (has('width')) scalar('width', r.len('width', NaN, { min: 0 }), 'style');
  if (has('draw')) scalar('draw', r.num('draw', 1, { min: 0, max: 1 }), 'style');
  if (has('blur')) scalar('blur', r.len('blur', NaN, { min: 0 }), 'style');
  if (has('reveal')) scalar('reveal', r.num('reveal', 1, { min: 0, max: 1 }), 'style');
  if (has('zoom') && ent.type === 'camera') scalar('zoom', r.num('zoom', 1, { min: 0.05, max: 50 }), 'transform');
  for (const prop of ['fill', 'stroke', 'color', 'fill2']) {
    if (!has(prop)) continue;
    const to = r.color(prop, null);
    if (to) color(prop, to);
  }
  // 数字滚动：把 cv 从当前值补间到 count，并用创建时记下的 fmt 实时格式化成 text
  if (has('count')) {
    const to = r.num('count', 0);
    if (Number.isFinite(to)) {
      const from = st.cv ?? 0, ease = easeOf('count');
      const fmt = ent.count?.fmt || ((v) => String(Math.round(v)));
      mk('transform', ['cv', 'text'], (L, p) => { const v = lerp(from, to, ease(p)); L.cv = v; L.text = fmt(v); });
      st.cv = to;
      st.text = fmt(to);
    }
  }
  // 镜头跟随：follow="id" 开始跟随，follow="none" 停止；离散切换（不补间目标）
  if (has('follow') && ent.type === 'camera') {
    const fid = r.raw('follow').trim();
    let idx = -1;
    if (fid && fid.toLowerCase() !== 'none') {
      const t = scene.byId.get(fid);
      if (t && POSITIONAL.has(t.type) && t.type !== 'camera') idx = t.index;
      else diag.error('E_BAD_VALUE', `镜头找不到要跟随的对象 "${fid}"`, r.at('follow'));
    }
    if (idx !== -1 || fid.toLowerCase() === 'none' || !fid) {
      mk('discrete', ['fi'], (L) => { L.fi = idx; }, { dur: 0 });
      st.fi = idx;
    }
  }
  for (const prop of ['text', 'label']) {
    if (!has(prop)) continue;
    const v = r.str(prop, '');
    mk('discrete', [prop], (L) => { L[prop] = v; }, { dur: 0 });
    st[prop] = v;
  }
  if (has('z')) {
    // z 作为排序键可直接补间：数值连续变化让遮挡序平滑过渡，而非瞬间跳变
    const v = r.num('z', 0);
    scalar('z', v, 'transform');
    st.z = v;
  }

  // ---- 效果 ----
  const fxEnd = compileEffects(ctx, node, r, ent, st, start, { skipJump: jumpDone });
  if (fxEnd > start) { end = Math.max(end, fxEnd); did = true; }

  // ---- 退场 ----
  if (r.has('out')) {
    let mode = r.raw('out') || 'fade';
    if (!['fade', 'pop', 'none'].includes(mode)) {
      diag.warn('W_BAD_VALUE', `out 只能是 fade / pop / none，实际是 "${mode}"，已改用 fade`, r.at('out'));
      mode = 'fade';
    }
    const d = r.has('dur') ? dur : 0.35;
    if (mode !== 'none') {
      seg(ctx, ent, { t0: start, dur: d, mode: 'add', kind: 'intro', tag: node.tag, line: node.line, col: node.col, internal: true, fn: FX.outFn(mode) });
    }
    ent.death = start + (mode === 'none' ? 0 : d);
    end = Math.max(end, ent.death);
    did = true;
  }

  if (!did && !ctx.noopSilenced) {
    diag.warn('W_NOOP', `<${node.tag}> 没有写任何变化，什么也不会发生`, node, '写上要变成的样子，如 at="3,3" 或 fill="red" 或 pulse');
  }
  return end;
}

export { checkAttrs };
