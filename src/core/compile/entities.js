import { Reader, checkAttrs, suggest, parsePos } from '../lang/reader.js';
import { RESERVED_TAGS } from '../lang/expand.js';
import {
  ENTITY_ATTRS, LAYER_ATTRS, GROUP_ATTRS, POSITIONAL, SEGMENTED, BOXED, TIMING, EFFECTS, SOUND_NAMES,
  BLEND_MODES, GRADABLE, EMIT_MODES,
} from '../lang/schema.js';
import { clamp } from '../util/ease.js';
import { linkEndpoints } from '../runtime/links.js';
import { onColor } from '../util/color.js';
import { col, NONE, cellToXY, warnOutside, register, placeToXY } from './scene.js';
import { looksLikePlace } from '../geo/place.js';
import { compileMap } from '../geo/map-entity.js';
import { GLYPH_NAMES } from '../../render/glyphs.js';

const NAME_RE = /^[\p{L}_][\p{L}\p{N}_.-]*$/u;
const PALETTE = ['#ff6b9d', '#4cc9f0', '#ffd166', '#9b8cff', '#06d6a0', '#ff9f68'].map(col);
const withAlpha = (c, a) => [c[0], c[1], c[2], c[3] * a];
const SIDES = ['top', 'bottom', 'left', 'right'];
const rad = (d) => (d * Math.PI) / 180;
const raw0 = (r, name) => r.raw(name).trim();

function readPlace(r, ctx) {
  // 地理定位：city="成都" / lonlat="104,30" / at="成都"
  const geoKey = ['city', 'lonlat'].find((k) => r.has(k)) || (r.has('at') && looksLikePlace(r.raw('at')) ? 'at' : null);
  if (geoKey) {
    const xy = placeToXY(ctx, r.raw(geoKey), r.at(geoKey));
    if (xy) return xy;
    return [ctx.scene.width / 2, ctx.scene.height / 2];
  }
  const p = r.pos('at');
  if (p) { warnOutside(ctx, p, r.at('at')); return cellToXY(ctx.scene, p); }
  const q = r.pair('px');
  if (q) return q;
  return [ctx.scene.width / 2, ctx.scene.height / 2];
}

/** 渐变方式：gradient="linear" / "linear 135"（角度）/ "radial"。返回 { kind, angle } 或 null */
function readGradient(r) {
  if (!r.has('gradient')) return { kind: 'linear', angle: 135 };
  const toks = r.raw('gradient').trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
  const kind = toks[0] === 'radial' ? 'radial' : 'linear';
  const angle = toks.length > 1 && Number.isFinite(Number(toks[1])) ? Number(toks[1]) : 135;
  return { kind, angle };
}

/** 读取渐变填充：写了 fill2 才生效，挂到 ent.grad = { angle, radial } 并把第二色放进 init.fill2 */
function readGradFill(r, ent, init) {
  if (!GRADABLE.has(ent.type) || !r.has('fill2')) return;
  const c2 = r.color('fill2', null);
  if (!c2) return;
  init.fill2 = c2;
  const g = readGradient(r);
  ent.grad = { radial: g.kind === 'radial', angle: g.angle };
}

/** 通用视觉修饰：blur（可动画，入 init）/ blend（静态，入 ent）/ clip（容器 id，入 ent，稍后解析） */
function readLook(r, ent, ctx, init) {
  const { diag } = ctx;
  if (r.has('blur')) init.blur = r.len('blur', 0, { min: 0 });
  if (r.has('blend')) {
    const v = r.raw('blend').trim().toLowerCase();
    if (BLEND_MODES.includes(v)) { if (v !== 'normal') ent.blend = v; }
    else { const s = suggest(v, BLEND_MODES); diag.error('E_BAD_VALUE', `未知混合模式 "${v}"`, r.at('blend'), s ? `是不是想写 "${s}"？` : `可用：${BLEND_MODES.join(' / ')}`); }
  }
  if (r.has('clip')) ent.clipRef = r.raw('clip').trim(); // 延迟到全部对象建好后解析成 index
}

/** 文字显现进度：reveal 0~1，或 in="type" 一步到位（从 0 显现）。存进 init.reveal */
function readReveal(r, init) {
  if (r.has('reveal')) init.reveal = r.num('reveal', 1, { min: 0, max: 1 });
}

/**
 * 数字格式：fmt 用 # 代表数值（避开 {} 插值）。整数部分自动加千分位；
 * #.0 / #.00 控制小数位。如 fmt="# 人" → "1,280 人"，fmt="¥#.00" → "¥1,280.00"，fmt="#%" → "87%"。
 * 返回 (val) => 字符串。没写 # 时按整数显示。
 */
export function makeFormatter(fmt) {
  const f = fmt && fmt.includes('#') ? fmt : '#';
  return (val) => f.replace(/#(\.0+)?/g, (_, dot) => {
    const digits = dot ? dot.length - 1 : 0;
    const [int, dec] = Number(val).toFixed(digits).split('.');
    const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return dec ? `${g}.${dec}` : g;
  });
}

/** 数字滚动：count 目标值 + fmt 格式。记在 ent 上。创建时直接显示目标值，滚动发生在步骤里改 count 时 */
function readCount(r, ent, init) {
  const fmt = makeFormatter(r.str('fmt', ''));
  ent.count = { fmt };
  if (r.has('count')) {
    const to = r.num('count', 0);
    if (Number.isFinite(to)) { init.cv = to; init.text = fmt(to); return; }
  }
  // 只写了 fmt、没写 count：把已有的数字 text 套上格式
  if (r.has('fmt') && Number.isFinite(Number(init.text))) { init.cv = Number(init.text); init.text = fmt(init.cv); }
}

/** 确定性小随机：mulberry32，种子来自 scene.seed + emitter 序号，保证每次结果一致 */
function makeRng(seed) {
  let a = Math.floor(seed) | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 粒子发射器：编译期用 seeded RNG 预生成每颗粒子的"出生参数"（相位、角度、初速、尺寸、寿命抖动），
 * 运行时（渲染合成）按绝对时间算出每颗粒子此刻的位置与透明度。整组粒子是一个 IR 节点，不是 N 个实体。
 */
function compileEmitter(r, ctx, init, ent, scene) {
  const { diag } = ctx;
  const U = scene.unit;
  const mode = r.str('mode', 'burst');
  if (!EMIT_MODES.includes(mode)) {
    diag.error('E_BAD_VALUE', `mode 只能是 ${EMIT_MODES.join(' / ')}，实际是 "${mode}"`, r.at('mode'));
    ent.emit = null;
    return;
  }
  const count = Math.round(r.num('count', 40, { min: 1, max: 2000 }));
  const spread = r.len('spread', 0, { min: 0 });
  const life = r.num('life', 1.4, { min: 0.1, max: 60 });
  const speed = r.len('speed', U * 1.2, { min: 0 });     // 初速度（像素/秒）
  const gravity = r.num('gravity', 0) * U;               // 格/秒² → 像素/秒²
  const wind = r.num('wind', 0) * U;
  init.size = r.len('size', Math.max(4, U * 0.12), { min: 0.5 });
  init.fill = r.color('fill', scene.theme.accent || scene.series[0] || col('#7c6cff'));
  if (r.has('fill2')) { const c2 = r.color('fill2', null); if (c2) init.fill2 = c2; }
  // burst 是一次性（粒子一轮后消失）；其余模式连续循环
  const loop = mode !== 'burst';

  const rng = makeRng(scene.seed * 2654435761 + ent.index * 40503 + 7);
  const rand = (a, b) => a + (b - a) * rng();
  const particles = [];
  for (let i = 0; i < count; i++) {
    // phase：循环模式下错开出生时间，让粒子流连续；burst 时都从 0 出生（略微抖动避免整齐划一）
    const phase = loop ? rng() : rand(0, 0.06);
    const a = rng() * Math.PI * 2;      // 发射角 / 位置角
    const rr = Math.sqrt(rng());         // 源半径均匀分布
    let vx = 0, vy = 0, ox = Math.cos(a) * spread * rr, oy = Math.sin(a) * spread * rr;
    switch (mode) {
      case 'burst': vx = Math.cos(a) * speed * rand(0.4, 1); vy = Math.sin(a) * speed * rand(0.4, 1); break;
      case 'fountain': { const dir = -Math.PI / 2 + rand(-0.5, 0.5); const s = speed * rand(0.7, 1); vx = Math.cos(dir) * s; vy = Math.sin(dir) * s; break; }
      case 'rise': vy = -speed * rand(0.6, 1); vx = rand(-0.2, 0.2) * speed; ox = rand(-spread, spread); oy = rand(-0.3, 0.3) * spread; break;
      case 'fall': vy = speed * rand(0.6, 1); vx = rand(-0.1, 0.1) * speed; ox = rand(-spread, spread); oy = rand(-spread, spread); break;
      case 'snow': vy = speed * rand(0.3, 0.7); vx = rand(-0.3, 0.3) * speed; ox = rand(-spread, spread); oy = rand(-spread, spread); break;
    }
    particles.push({ phase, ox, oy, vx, vy, s: rand(0.6, 1.3), sway: rand(0, Math.PI * 2) });
  }
  ent.emit = { mode, loop, life, gravity, wind, particles };
  // 发射器自身不参与越界/重叠检查
  ent.internal = false;
}

/** 图层：控制绘制先后与整体透明度 */
export function createLayer(node, ctx) {
  const { scene, diag } = ctx;
  checkAttrs(node, LAYER_ATTRS, diag);
  const r = new Reader(node, diag, scene.unit, scene.theme);
  const name = (r.str('name', '') || r.str('id', '')).trim();
  if (!name) { diag.error('E_MISSING_ATTR', '<layer> 需要 name="图层名"', node); return null; }
  if (RESERVED_TAGS.has(name) || scene.byId.has(name) || scene.groups.has(name)) {
    diag.error('E_DUP_ID', `名字 "${name}" 已被占用`, node);
    return null;
  }
  const ent = {
    index: scene.entities.length, id: name, type: 'layer', line: node.line, col: node.col,
    layer: -1, groups: [], birth: 0, death: Infinity,
    init: { alpha: clamp(r.num('alpha', 1)), z: r.num('z', 0), blur: r.has('blur') ? r.len('blur', 0, { min: 0 }) : 0 },
  };
  if (r.has('blend')) {
    const v = r.raw('blend').trim().toLowerCase();
    if (BLEND_MODES.includes(v)) { if (v !== 'normal') ent.blend = v; }
    else diag.error('E_BAD_VALUE', `未知混合模式 "${v}"`, r.at('blend'), `可用：${BLEND_MODES.join(' / ')}`);
  }
  register(ctx, ent);
  return ent;
}

/** 分组：只记录成员关系，步骤里写组名 = 对全部成员做同一个修改 */
export function createGroup(node, ctx, parentGroups) {
  const { scene, diag } = ctx;
  checkAttrs(node, GROUP_ATTRS, diag);
  const r = new Reader(node, diag, scene.unit, scene.theme);
  const name = r.str('name', '').trim();
  if (!name) { diag.error('E_MISSING_ATTR', '<group> 需要 name="组名"', node); return null; }
  if (RESERVED_TAGS.has(name) || scene.byId.has(name) || scene.groups.has(name)) {
    diag.error('E_DUP_ID', `名字 "${name}" 已被占用`, node);
    return null;
  }
  const g = { name, members: [], parents: parentGroups };
  scene.groups.set(name, g);
  return g;
}

export function createEntity(node, ctx, opts = {}) {
  const { scene, diag } = ctx;
  const type = node.tag, U = scene.unit;
  checkAttrs(node, [...ENTITY_ATTRS[type], ...TIMING, ...EFFECTS], diag);
  const r = new Reader(node, diag, U, scene.theme);

  let id = r.str('id', '').trim();
  if (id && RESERVED_TAGS.has(id)) { diag.error('E_BAD_ID', `id "${id}" 是内置标签名，请换一个`, r.at('id')); id = ''; }
  if (id && (scene.byId.has(id) || scene.groups.has(id))) {
    diag.error('E_DUP_ID', `对象 id "${id}" 已存在`, r.at('id'), `要修改已有对象，把 id 当标签写：<${id} …/>，或 <change id="${id}" …/>`);
    return null;
  }
  if (!id) { do { id = `${type}${++ctx.auto}`; } while (scene.byId.has(id)); }
  else if (!NAME_RE.test(id)) diag.warn('W_ID_NAME', `id "${id}" 含特殊字符，不能直接当标签写`, r.at('id'), '可改用 <change id="…">');

  let layer = -1;
  const lname = r.str('layer', opts.defaultLayer ?? '').trim();
  if (lname) {
    const L = scene.byId.get(lname);
    if (L && L.type === 'layer') layer = L.index;
    else {
      const layers = scene.entities.filter((e) => e.type === 'layer').map((e) => e.id);
      diag.error('E_UNKNOWN_LAYER', `找不到图层 "${lname}"`, r.at('layer'), layers.length ? `已有图层：${layers.join(', ')}` : '先在最外层用 <layer name="…"/> 声明');
    }
  }

  // 所在 <group> 嵌套链 + 显式 group 属性（写了就是声明：组不存在则自动创建），去重
  const groups = [...(opts.groups ?? [])];
  for (const gn of r.str('group', '').split(/\s+/).filter(Boolean)) {
    if (scene.byId.has(gn) && !scene.groups.has(gn)) {
      diag.error('E_DUP_ID', `分组名 "${gn}" 与已有对象 id 冲突`, r.at('group'), '换一个组名');
      continue;
    }
    if (!scene.groups.has(gn)) scene.groups.set(gn, { name: gn, members: [], parents: [] });
    if (!groups.includes(gn)) groups.push(gn);
  }

  const zero = {
    x: 0, y: 0, size: 0, w: 0, h: 0, rot: 0, fill: NONE, stroke: NONE, width: 0,
    color: [255, 255, 255, 1], draw: 1, x1: 0, y1: 0, x2: 0, y2: 0, text: '', label: '',
    fill2: NONE, blur: 0, reveal: 1, zoom: 1, fi: -1, cv: 0,
  };
  const init = { ...zero, alpha: clamp(r.num('alpha', 1)), z: r.num('z', 0) };
  const ent = {
    index: scene.entities.length, id, type, line: node.line, col: node.col,
    layer, groups, birth: opts.birth ?? 0, death: Infinity, radius: -1,
  };
  const defSize = Math.min(U * 0.8, 84);

  if (POSITIONAL.has(type)) {
    [init.x, init.y] = readPlace(r, ctx);
    // off：在 at 之外再偏移 dx,dy，单位与 size 一致（像素或 .3c）。
    // at 的小数是“格子”单位（随行高列宽变化），而 size 是 c 单位；在卡片里摆文字时请用 off，两者才不会错位。
    const off = r.lenPair('off');
    if (off) { init.x += off[0]; init.y += off[1]; }
    init.rot = rad(r.num('rot', 0));
  }

  // 通用视觉修饰：模糊（可动画）、混合模式、裁剪容器（都挂在 ent 上，静态）
  readLook(r, ent, ctx, init);

  switch (type) {
    case 'circle': case 'ellipse': case 'rect': case 'triangle': case 'star':
      init.size = r.len('size', defSize, { min: 1 });
      init.w = BOXED.has(type) ? r.len('w', init.size, { min: 1 }) : init.size;
      init.h = BOXED.has(type) ? r.len('h', init.size, { min: 1 }) : init.size;
      {
        const pal = scene.series.length ? scene.series : PALETTE;
        init.fill = r.color('fill', pal[ctx.colorIdx++ % pal.length]);
      }
      init.stroke = r.color('stroke', NONE);
      init.width = r.len('width', 3, { min: 0 });
      init.label = r.str('label', '');
      // 套用了配色时，标签文字按填充色自动选深/浅，保证看得清
      init.color = r.color('color', scene.themed && init.fill[3] > 0.5 ? onColor(init.fill) : col('rgba(255,255,255,0.96)'));
      readGradFill(r, ent, init);
      ent.flat = r.flag('flat');
      if (type === 'rect') ent.radius = r.len('radius', -1);
      if (type === 'star') ent.points = r.num('points', 5, { min: 3, max: 24 });
      break;
    case 'text':
      init.size = r.len('size', 36, { min: 1 });
      init.w = r.len('w', 0, { min: 0 });
      init.fill = r.color('fill', scene.theme.text || col('#ffffff'));
      init.stroke = r.color('stroke', NONE);
      init.width = r.len('width', 0, { min: 0 });
      init.text = r.str('text', '');
      readGradFill(r, ent, init);
      readReveal(r, init);
      readCount(r, ent, init);
      break;
    case 'icon':
      init.size = r.len('size', 48, { min: 1 });
      init.w = 0;
      init.fill = r.color('fill', scene.theme.text || col('#ffffff'));
      init.stroke = r.color('stroke', NONE);
      init.width = r.len('width', 0, { min: 0 });
      init.text = r.str('text', '');
      readReveal(r, init);
      // name：内置矢量图标（交通工具），写了就不再用 text 当 emoji
      if (r.has('name')) {
        const nm = r.raw('name').trim();
        if (GLYPH_NAMES.includes(nm)) ent.glyph = nm;
        else {
          const s = suggest(nm, GLYPH_NAMES);
          diag.error('E_BAD_VALUE', `未知图标 "${nm}"`, r.at('name'), s ? `是不是想写 "${s}"？` : `可用：${GLYPH_NAMES.join(' / ')}`);
        }
      }
      break;
    case 'ring':
      init.size = r.len('size', Math.min(U, 96), { min: 1 });
      init.stroke = r.color('stroke', scene.theme.accent2 || col('#ff5c7a'));
      init.width = r.len('width', 4, { min: 0 });
      break;
    case 'note': {
      init.size = r.len('size', 18, { min: 1 });
      init.fill = r.color('fill', col('#fff7d6'));
      init.color = r.color('color', col('#1b1d2e'));
      init.text = r.str('text', '');
      ent.side = r.str('side', 'top');
      if (!SIDES.includes(ent.side)) {
        diag.error('E_BAD_VALUE', `side 只能是 ${SIDES.join(' / ')}，实际是 "${ent.side}"`, r.at('side'));
        ent.side = 'top';
      }
      ent.gap = r.len('gap', U * 0.5, { min: 0 });
      break;
    }
    case 'line': case 'arrow': {
      // 端点：对象 id（绑定连线，自动贴到对象边缘并随对象移动）或格子坐标
      const endOf = (name) => {
        if (!r.has(name)) return undefined;
        const raw = r.raw(name).trim();
        const target = scene.byId.get(raw);
        if (target && POSITIONAL.has(target.type)) return { ref: target.index, xy: [target.init.x, target.init.y] };
        const p = parsePos(raw);
        if (!p) {
          const hint = suggest(raw, [...scene.byId.keys()].filter((k) => POSITIONAL.has(scene.byId.get(k).type)));
          diag.error('E_BAD_VALUE', `${name} 需要格子坐标 "列,行"，或已定义的对象 id，实际是 "${raw}"`, r.at(name), hint ? `是不是想写 "${hint}"？（连线引用的对象要先于连线定义）` : '连线引用的对象要先于连线定义');
          return null;
        }
        warnOutside(ctx, p, r.at(name));
        return { ref: -1, xy: cellToXY(scene, p) };
      };
      const f = endOf('from'), t = endOf('to');
      if (!f || !t) {
        if (f === undefined || t === undefined) diag.error('E_MISSING_ATTR', `<${type}> 需要 from 和 to（格子坐标 "列,行"，或对象 id）`, node);
        return null;
      }
      if (f.ref >= 0 && f.ref === t.ref) { diag.error('E_BAD_VALUE', `<${type}> 的起点和终点是同一个对象 "${raw0(r, 'from')}"`, r.at('to')); return null; }
      init.stroke = r.color('stroke', scene.theme.text || col('#e8eaf6'));
      init.width = r.len('width', 4, { min: 0 });
      ent.dash = r.flag('dash');
      ent.head = r.len('head', Math.max(12, init.width * 3.2), { min: 1 });
      [init.x1, init.y1] = f.xy;
      [init.x2, init.y2] = t.xy;
      if (f.ref >= 0 || t.ref >= 0) {
        // 默认与目标留一点间距：箭头尖不贴死在边缘上
        const gap = r.len('gap', type === 'arrow' ? Math.max(3, U * 0.05) : 0, { min: 0 });
        const live = (s) => (s.ref >= 0 ? { e: scene.entities[s.ref], L: { ...scene.entities[s.ref].init, ox: 0, oy: 0, sx: 1, sy: 1 } } : s.xy);
        Object.assign(init, (({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 }))(linkEndpoints(live(f), live(t), gap)));
        ent.link = { from: { ref: f.ref }, to: { ref: t.ref }, gap };
      }
      break;
    }
    case 'map': {
      // 地图建立投影并把省界换算成像素；失败（region 写错等）时不创建，避免后面一串地名全报错
      if (!compileMap(r, ctx, init, ent, scene)) return null;
      break;
    }
    case 'grid': {
      ent.style = r.str('style', 'line');
      if (ent.style !== 'line' && ent.style !== 'cell') {
        diag.error('E_BAD_VALUE', `style 只能是 line 或 cell，实际是 "${ent.style}"`, r.at('style'));
        ent.style = 'line';
      }
      ent.dots = (r.posList('dots') || []).map((p) => cellToXY(scene, p));
      ent.labels = r.flag('labels');
      ent.inner = r.flag('inner');
      ent.frame = r.len('frame', 0, { min: 0 });
      ent.river = Math.round(r.num('river', 0, { min: 0, max: Math.max(0, scene.rows - 1) }));
      ent.ticks = (r.posList('ticks') || []).filter((p) => p[0] >= 1 && p[0] <= scene.cols && p[1] >= 1 && p[1] <= scene.rows);
      if (ent.river && ent.style !== 'line') diag.warn('W_NOT_APPLICABLE', 'river 只适用于 style="line" 的棋盘', r.at('river'));
      ent.radius = r.len('radius', U * 0.4, { min: 0 });
      init.fill = r.color('fill', NONE);
      init.stroke = r.color('stroke', scene.theme.text ? withAlpha(scene.theme.text, 0.28) : col('rgba(255,255,255,0.28)'));
      init.color = r.color('color', scene.theme.text ? withAlpha(scene.theme.text, 0.55) : col('rgba(255,255,255,0.55)'));
      init.width = r.len('width', 1.5, { min: 0 });
      break;
    }
    case 'camera': {
      // 镜头：位置已由 POSITIONAL 块按 at/px/city 设好；这里读缩放与跟随目标
      init.zoom = r.num('zoom', 1, { min: 0.05, max: 50 });
      if (r.has('follow')) {
        const fid = r.raw('follow').trim();
        if (fid && fid.toLowerCase() !== 'none') {
          const t = scene.byId.get(fid);
          if (t && POSITIONAL.has(t.type) && t.type !== 'camera') init.fi = t.index;
          else {
            const cands = [...scene.byId.keys()].filter((k) => { const e = scene.byId.get(k); return POSITIONAL.has(e.type) && e.type !== 'camera'; });
            const s = suggest(fid, cands);
            diag.error('E_BAD_VALUE', `镜头找不到要跟随的对象 "${fid}"`, r.at('follow'), s ? `是不是 "${s}"？（跟随目标要先于 <camera> 定义）` : '跟随目标要先于 <camera> 定义');
          }
        }
      }
      // 场景里有多个 camera 只有第一个生效，提醒一下
      if (scene.entities.some((e) => e.type === 'camera')) diag.warn('W_DUP_CAMERA', '一个场景只会使用第一个 <camera>，多余的会被忽略', node);
      break;
    }
    case 'emitter': {
      compileEmitter(r, ctx, init, ent, scene);
      break;
    }
  }
  ent.init = init;
  register(ctx, ent);
  if (ent.link) scene.links.push({ ent: ent.index, ...ent.link });
  for (const gn of groups) scene.groups.get(gn).members.push(ent.index);

  const sound = r.str('sound', '').trim();
  if (sound) {
    if (!SOUND_NAMES.includes(sound)) diag.warn('W_BAD_VALUE', `sound 只能是 ${SOUND_NAMES.join(' / ')}，实际是 "${sound}"`, r.at('sound'));
    else scene.sounds.push({ at: opts.birth ?? 0, name: sound });
  }
  return ent;
}

export { suggest };
