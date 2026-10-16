import { SOLID } from '../core/lang/schema.js';
import { mix, onColor } from '../core/util/color.js';
import { labelFontSize } from '../core/util/label.js';
import { FONT, wrapText } from './util.js';

const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 渲染中间表示（Render IR）：把求值结果合成为"一帧的语义化描述"。
 * IR 是纯数据（不含 DOM / ctx），后端（Canvas2D / SVG / WebGL）据此绘制。
 * measure(text, font) 是注入的文本度量器，让布局逻辑不依赖具体画布。
 */

function buildShadow(scene, e, L) {
  if (!scene.shadow || !SOLID.has(e.type) || e.flat) return null;
  if (L.fill[3] < 0.9) return null;
  const boxed = e.type === 'rect' || e.type === 'ellipse';
  const half = (boxed ? L.h : L.size) / 2;
  // 投影只锚定"设定位置 + 原始尺寸"，抬升只影响衰减
  const lift = Math.max(0, -L.oy);
  const k = Math.min(1, lift / (L.size * 1.6 + 1));
  const rx = (boxed ? L.w : L.size) * 0.5 * (1 - k * 0.4);
  return { x: L.x, y: L.y + half, rx, k };
}

/**
 * 逐字显现：按全部行的字符数从左到右切出可见部分（reveal 0~1）。
 * 返回与 lines 等长的新数组；这是"内容决定画什么"的逻辑，所以放在 IR 里，后端拿到的就是已经切好的行。
 */
function revealLines(lines, reveal) {
  if (!(reveal < 1)) return lines;
  const total = lines.reduce((n, l) => n + [...l].length, 0);
  let left = Math.round(total * Math.max(0, reveal));
  return lines.map((l) => {
    const cs = [...l];
    const take = Math.max(0, Math.min(cs.length, left));
    left -= cs.length;
    return cs.slice(0, take).join('');
  });
}

function buildText(scene, e, L, alpha, measure) {
  const size = L.size;
  const font = `700 ${size}px ${FONT}`;
  const m = (t) => measure(t, font);
  const full = L.w > 0 ? wrapText(m, String(L.text ?? ''), L.w) : [String(L.text ?? '')];
  const lh = size * 1.25;
  // 渐变要铺满"完整文字"的外接范围，不能随逐字显现忽大忽小，否则颜色会在打字过程中漂移
  const span = Math.max(1, ...full.map(m), full.length * lh);
  return {
    kind: 'text',
    x: L.x, y: L.y, ox: L.ox, oy: L.oy, rot: L.rot, orot: L.orot, sx: L.sx, sy: L.sy,
    alpha, size, fill: L.fill, stroke: L.stroke, strokeWidth: L.width,
    glow: scene.glow,
    grad: gradOf(e, L, span),
    lines: revealLines(full, L.reveal ?? 1), lineHeight: lh, top: -(full.length - 1) * lh / 2,
  };
}

/**
 * 渐变描述：写了 fill2 的对象返回 { c0, c1, radial, span, dir }，否则 null。
 *   span：渐变覆盖的外接尺寸；dir：线性渐变的单位方向向量 [dx, dy]（画布坐标，y 向下）。
 * 角度约定：0 = 向上、90 = 向右。把"角度 → 方向向量"放在这里，后端不用再懂角度的含义。
 */
function gradOf(e, L, span) {
  if (!e.grad || !L.fill2 || L.fill2[3] <= 0) return null;
  const a = ((e.grad.angle - 90) * Math.PI) / 180;
  return { c0: L.fill, c1: L.fill2, radial: e.grad.radial, span, dir: [Math.cos(a), Math.sin(a)] };
}

/** 实心图形的渐变范围：取外接尺寸（矩形/椭圆取长边，其余取 size） */
const solidSpan = (e, L) => (e.type === 'rect' || e.type === 'ellipse' ? Math.max(L.w, L.h, 1) : Math.max(L.size, 1));

function buildNote(scene, e, L, alpha, measure) {
  const fs = Math.max(8, L.size);
  const font = `600 ${fs}px ${FONT}`;
  const lines = String(L.text).split(/\\n|\|/);
  const padX = fs * 0.7, padY = fs * 0.45, lh = fs * 1.35, r = fs * 0.55, tail = fs * 0.5;
  const tw = Math.max(1, ...lines.map((l) => measure(l, font)));
  const w = tw + padX * 2, h = lines.length * lh + padY * 2 - (lh - fs) * 0.4;
  const gap = e.gap, ax = L.x, ay = L.y;
  let bx, by;
  switch (e.side) {
    case 'bottom': bx = ax - w / 2; by = ay + gap; break;
    case 'left': bx = ax - gap - w; by = ay - h / 2; break;
    case 'right': bx = ax + gap; by = ay - h / 2; break;
    default: bx = ax - w / 2; by = ay - gap - h;
  }
  const m = 6;
  bx = clampTo(bx, m, scene.width - m - w);
  by = clampTo(by, m, scene.height - m - h);

  let tailPts;
  if (e.side === 'top' || e.side === 'bottom') {
    const tx = clampTo(ax, bx + r + tail, bx + w - r - tail), top = e.side === 'top';
    const yb = top ? by + h - 1 : by + 1;
    tailPts = [[tx - tail, yb], [tx + tail, yb], [ax, top ? yb + tail * 1.4 : yb - tail * 1.4]];
  } else {
    const ty = clampTo(ay, by + r + tail, by + h - r - tail), left = e.side === 'left';
    const xb = left ? bx + w - 1 : bx + 1;
    tailPts = [[xb, ty - tail], [xb, ty + tail], [left ? xb + tail * 1.4 : xb - tail * 1.4, ay]];
  }

  return {
    kind: 'note',
    x: L.x, y: L.y, ox: L.ox, oy: L.oy, sx: L.sx, sy: L.sy,
    alpha, fill: L.fill, color: L.color, size: fs,
    lines, box: { x: bx, y: by, w, h, r }, tail: tailPts,
    layout: { padX, padY, lh, fs },
  };
}

function buildGrid(scene, e, L, alpha) {
  return {
    kind: 'grid', alpha,
    ax: scene.ax, ay: scene.ay, cols: scene.cols, rows: scene.rows, cw: scene.cw, ch: scene.ch, unit: scene.unit,
    fill: L.fill, stroke: L.stroke, width: L.width, color: L.color,
    style: e.style, radius: e.radius, dots: e.dots, labels: e.labels,
    inner: e.inner, frame: e.frame, river: e.river, ticks: e.ticks,
  };
}

function buildItem(scene, e, L, alpha, measure, t = 0) {
  switch (e.type) {
    case 'circle': case 'ellipse': case 'rect': case 'triangle': case 'star':
      return {
        kind: 'solid', shape: e.type,
        x: L.x, y: L.y, ox: L.ox, oy: L.oy, rot: L.rot, orot: L.orot, sx: L.sx, sy: L.sy,
        alpha, size: L.size, w: L.w, h: L.h,
        radius: e.radius, points: e.points, flat: e.flat,
        fill: L.fill, stroke: L.stroke, strokeWidth: L.width,
        color: L.color, label: L.label, glow: scene.glow, grad: gradOf(e, L, solidSpan(e, L)),
        labelFs: L.label ? labelFontSize(e.type, L.w, L.h, L.label, (txt, px) => measure(txt, `700 ${px}px ${FONT}`)) : 0,
        shadow: buildShadow(scene, e, L),
      };
    case 'icon':
      if (e.glyph) {
        return {
          kind: 'glyph', glyph: e.glyph,
          x: L.x, y: L.y, ox: L.ox, oy: L.oy, rot: L.rot, orot: L.orot, sx: L.sx, sy: L.sy,
          alpha, size: L.size, fill: L.fill, stroke: L.stroke, strokeWidth: L.width, glow: scene.glow,
        };
      }
      return buildText(scene, e, L, alpha, measure);
    case 'text':
      return buildText(scene, e, L, alpha, measure);
    case 'ring':
      return {
        kind: 'ring',
        x: L.x, y: L.y, ox: L.ox, oy: L.oy, rot: L.rot, orot: L.orot, sx: L.sx, sy: L.sy,
        alpha, size: L.size, width: L.width, stroke: L.stroke, draw: L.draw,
      };
    case 'line': case 'arrow':
      return {
        kind: e.type, ox: L.ox, oy: L.oy, alpha,
        x1: L.x1, y1: L.y1, x2: L.x2, y2: L.y2, draw: L.draw,
        width: L.width, stroke: L.stroke, dash: e.dash, head: e.head,
      };
    case 'trace':
      return { kind: 'trace', alpha, pts: e.pts, draw: L.draw, width: L.width, stroke: L.stroke, glow: scene.glow };
    case 'note':
      return buildNote(scene, e, L, alpha, measure);
    case 'grid':
      return buildGrid(scene, e, L, alpha);
    case 'map':
      return {
        kind: 'map', alpha, fill: L.fill, color: L.color,
        provinces: e.provinces, islands: e.islands, style: e.style, inset: e.inset, insetBox: e.insetBox, box: e.mapBox,
        unit: scene.unit,
      };
    case 'emitter':
      return buildEmitter(e, L, alpha, t);
  }
  return null;
}

/**
 * 发射器 → 粒子帧：按绝对时间算出每颗粒子此刻的位置、半径、透明度。
 * 单颗粒子的"年龄" age = (t - birth) 减去出生相位，再对寿命取模（循环模式）。alpha 用一条升起-保持-淡出的包络。
 */
function buildEmitter(e, L, alpha, t) {
  const em = e.emit;
  if (!em) return null;
  const age0 = t - e.birth;
  if (age0 < 0) return { kind: 'particles', alpha: 0, size: L.size, fill: L.fill, fill2: L.fill2, points: [] };
  const ox = L.x + L.ox, oy = L.y + L.oy;
  const points = [];
  for (const p of em.particles) {
    let age = age0 - p.phase * em.life;
    if (em.loop) { age = ((age % em.life) + em.life) % em.life; }
    else if (age < 0 || age > em.life) continue;
    if (age < 0) continue;
    const u = age / em.life;                       // 0~1 寿命进度
    // 位置：初速匀速 + 重力/风加速 + snow 模式的横向摇摆
    let x = ox + p.ox + p.vx * age + 0.5 * em.wind * age * age;
    let y = oy + p.oy + p.vy * age + 0.5 * em.gravity * age * age;
    if (em.mode === 'snow') x += Math.sin(p.sway + age * 2.2) * L.size * 1.5;
    // 透明度包络：快速出现（前 12%）→ 后 45% 线性淡出
    const fade = u < 0.12 ? u / 0.12 : u > 0.55 ? Math.max(0, 1 - (u - 0.55) / 0.45) : 1;
    points.push({ x, y, r: Math.max(0.5, L.size * 0.5 * p.s), a: fade });
  }
  return { kind: 'particles', alpha, size: L.size, fill: L.fill, fill2: L.fill2, points };
}

/**
 * 字幕样式表。尺寸全部是“字号的倍数”，所以改 caption-size 时整体等比缩放。
 *  panel：有无底板；pill：单行时是否做成胶囊；full：通栏；left：左对齐；bar：左侧竖线；halo：文字外描边（无底板时保证可读）
 */
const CAP = {
  soft:    { weight: 500, lh: 1.45, padX: 1.0, padY: 0.55, panel: true, pill: true },
  plain:   { weight: 600, lh: 1.45, padX: 0.2, padY: 0.1, halo: true },
  bar:     { weight: 500, lh: 1.45, padX: 1.0, padY: 0.8, panel: true, full: true },
  minimal: { weight: 500, lh: 1.5, padX: 0.95, padY: 0.1, left: true, bar: true },
  accent:  { weight: 600, lh: 1.45, padX: 1.05, padY: 0.55, panel: true, pill: true },
  classic: { weight: 600, lh: 1.5, padX: 1.1, padY: 0.7, panel: true, r: 0.8 },
};

/** 字幕的配色：全部来自场景背景 / 配色模板，所以换配色字幕也跟着换，并保证与背景有足够对比 */
function captionColors(scene, name) {
  const dark = scene.dark !== false;
  const bg = scene.bg;
  const ink = scene.theme?.text || (dark ? [244, 246, 255, 1] : [27, 29, 46, 1]);
  const accent = scene.theme?.accent || [124, 108, 255, 1];
  const a = (c, k) => [c[0], c[1], c[2], k];
  switch (name) {
    case 'soft': {
      const fill = mix(bg, ink, dark ? 0.12 : 0.07);
      return { fill: a(fill, 0.78), border: a(ink, 0.1), text: a(ink, 0.92), shadow: [0, 0, 0, dark ? 0.35 : 0.1] };
    }
    case 'plain':
      return { halo: a(bg, 0.92), text: a(ink, 1), shadow: [0, 0, 0, dark ? 0.5 : 0.18] };
    case 'bar':
      return { fill: a(mix(bg, ink, dark ? 0.06 : 0.04), 0.86), border: a(ink, 0.1), text: a(ink, 0.92) };
    case 'minimal':
      return { bar: a(accent, 1), text: a(ink, 0.88), halo: a(bg, 0.7) };
    case 'accent': {
      const on = onColor(accent);
      return { fill: a(accent, 1), text: [on[0], on[1], on[2], 1], shadow: a(accent, 0.35) };
    }
    default: // classic：与旧版一致的深色胶囊
      return { fill: [8, 10, 24, 0.84], border: [255, 255, 255, 0.12], text: [244, 246, 255, 1], shadow: [0, 0, 0, 0.45] };
  }
}

function buildCaption(scene, c, measure) {
  const W = scene.width, H = scene.height;
  const name = CAP[scene.captionStyle] ? scene.captionStyle : 'soft';
  const S = CAP[name];
  const fs = scene.captionFs || Math.max(11, W * 0.024);
  const font = `${S.weight} ${fs}px ${FONT}`;
  const m = (t) => measure(t, font);
  const maxW = S.full ? W - fs * 4 : W - Math.max(80, fs * 4);
  const lines = wrapText(m, c.text, maxW);
  const lh = fs * S.lh, padX = fs * S.padX, padY = fs * S.padY;
  const tw = Math.max(1, ...lines.map(m));
  const w = S.full ? W : Math.min(W - 24, tw + padX * 2);
  const h = lines.length * lh + padY * 2 - (lh - fs);
  const margin = S.full ? 0 : Math.max(14, fs * 0.9);
  const slide = (1 - c.k) * 10;
  const top = scene.captionPos === 'top';
  const x = S.full ? 0 : S.left ? Math.max(20, W * 0.05) : (W - w) / 2;
  const y = top ? margin - slide : H - margin - h + slide;
  const r = S.pill ? (lines.length === 1 ? h / 2 : fs * 0.9) : S.full ? 0 : fs * (S.r ?? 0.6);
  return {
    k: c.k, lines, box: { x, y, w, h, r },
    layout: { fs, padX, padY, lh },
    style: { name, weight: S.weight, panel: !!S.panel, full: !!S.full, left: !!S.left, bar: !!S.bar, halo: !!S.halo, top, colors: captionColors(scene, name) },
  };
}
/**
 * 合成一帧 IR。frame 为 evaluate() 的返回值；measure(text, font) => 宽度。
 */
export function composeFrame(scene, frame, measure) {
  // ---- 镜头：找到唯一的 camera，算出整画面的变换（缩放中心 = 镜头看向的点）----
  const camera = buildCamera(scene, frame);

  // ---- 可见性 + alpha 合成 + 排序（原 collect）----
  const items = [];
  scene.entities.forEach((e, i) => {
    if (e.type === 'layer' || e.type === 'camera') return;
    const L = frame.entities[i];
    if (L.hidden) return;
    const layer = e.layer >= 0 ? frame.entities[e.layer] : null;
    const layerE = e.layer >= 0 ? scene.entities[e.layer] : null;
    const alpha = L.alpha * L.ma * (layer ? layer.alpha : 1);
    if (alpha <= 0.002) return;
    items.push({ e, L, alpha, lz: layer ? layer.z : 0, i, layerE, layerL: layer });
  });
  items.sort((p, q) => p.lz - q.lz || p.L.z - q.L.z || p.i - q.i);

  return {
    width: scene.width, height: scene.height,
    background: { inner: scene.bg2, outer: scene.bg },
    guide: { ax: scene.ax, ay: scene.ay, cols: scene.cols, rows: scene.rows, cw: scene.cw, ch: scene.ch, unit: scene.unit, dark: scene.dark !== false },
    camera,
    items: items.map(({ e, L, alpha, layerE, layerL }) => {
      const item = buildItem(scene, e, L, alpha, measure, frame.t);
      if (!item) return null;
      decorate(item, e, L, scene, frame, layerE, layerL);
      return item;
    }).filter(Boolean),
    captions: frame.captions.map((c) => buildCaption(scene, c, measure)),
  };
}

/**
 * 屏幕点 → 世界点：撤销镜头变换。画面被放大 / 平移后，用户点到的位置要先还原才能和对象的世界坐标比对。
 * camera 为 buildCamera 的结果（null 表示无变换）。
 */
export function screenToWorld(camera, scene, sx, sy) {
  if (!camera) return [sx, sy];
  return [(sx - scene.width / 2) / camera.z + camera.cx, (sy - scene.height / 2) / camera.z + camera.cy];
}

/** 镜头变换：返回 { z, cx, cy } 把世界点 (cx,cy) 以 z 倍缩放后映射到画布中心；无镜头或恒等时返回 null */
export function buildCamera(scene, frame) {
  const idx = scene.entities.findIndex((e) => e.type === 'camera');
  if (idx < 0) return null;
  const L = frame.entities[idx];
  if (L.hidden) return null;
  let cx = L.x + L.ox, cy = L.y + L.oy;
  // 跟随：中心取被跟随对象此刻的位置
  if (L.fi >= 0 && scene.entities[L.fi]) {
    const t = frame.entities[L.fi];
    cx = t.x + t.ox;
    cy = t.y + t.oy;
  }
  const z = L.zoom || 1;
  if (Math.abs(z - 1) < 1e-4 && Math.abs(cx - scene.width / 2) < 1e-4 && Math.abs(cy - scene.height / 2) < 1e-4) return null;
  return { z, cx, cy };
}

/** 实心图形在当前帧的裁剪几何（供 clip 用） */
function clipGeom(scene, frame, idx) {
  const e = scene.entities[idx];
  if (!e) return null;
  const L = frame.entities[idx];
  return {
    shape: e.type, x: L.x + L.ox, y: L.y + L.oy, rot: L.rot + L.orot, sx: L.sx, sy: L.sy,
    size: L.size, w: L.w, h: L.h, radius: e.radius, points: e.points,
  };
}

/** 给 item 附加通用修饰：模糊 / 混合 / 裁剪，图层级的模糊与混合也并进来 */
function decorate(item, e, L, scene, frame, layerE, layerL) {
  const blur = (L.blur || 0) + (layerL?.blur || 0);
  if (blur > 0.01) item.blur = blur;
  if (e.blend) item.blend = e.blend;
  else if (layerE?.blend) item.blend = layerE.blend;
  if (e.clip >= 0) item.clip = clipGeom(scene, frame, e.clip);
}
