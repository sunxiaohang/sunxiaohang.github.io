import { SOLID } from '../core/lang/schema.js';
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

function buildText(scene, e, L, alpha, measure) {
  const size = L.size;
  const font = `700 ${size}px ${FONT}`;
  const m = (t) => measure(t, font);
  const lines = L.w > 0 ? wrapText(m, String(L.text ?? ''), L.w) : [String(L.text ?? '')];
  const lh = size * 1.25;
  return {
    kind: 'text',
    x: L.x, y: L.y, ox: L.ox, oy: L.oy, rot: L.rot, orot: L.orot, sx: L.sx, sy: L.sy,
    alpha, size, fill: L.fill, stroke: L.stroke, strokeWidth: L.width,
    glow: scene.glow,
    lines, lineHeight: lh, top: -(lines.length - 1) * lh / 2,
  };
}

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
  };
}

function buildItem(scene, e, L, alpha, measure) {
  switch (e.type) {
    case 'circle': case 'ellipse': case 'rect': case 'triangle': case 'star':
      return {
        kind: 'solid', shape: e.type,
        x: L.x, y: L.y, ox: L.ox, oy: L.oy, rot: L.rot, orot: L.orot, sx: L.sx, sy: L.sy,
        alpha, size: L.size, w: L.w, h: L.h,
        radius: e.radius, points: e.points, flat: e.flat,
        fill: L.fill, stroke: L.stroke, strokeWidth: L.width,
        color: L.color, label: L.label, glow: scene.glow,
        shadow: buildShadow(scene, e, L),
      };
    case 'text':
    case 'icon':
      return buildText(scene, e, L, alpha, measure);
    case 'ring':
      return {
        kind: 'ring',
        x: L.x, y: L.y, ox: L.ox, oy: L.oy, rot: L.rot, orot: L.orot, sx: L.sx, sy: L.sy,
        alpha, size: L.size, width: L.width, stroke: L.stroke,
      };
    case 'line': case 'arrow':
      return {
        kind: e.type, ox: L.ox, oy: L.oy, alpha,
        x1: L.x1, y1: L.y1, x2: L.x2, y2: L.y2, draw: L.draw,
        width: L.width, stroke: L.stroke, dash: e.dash, head: e.head,
      };
    case 'trace':
      return { kind: 'trace', alpha, pts: e.pts, draw: L.draw, width: L.width, stroke: L.stroke };
    case 'note':
      return buildNote(scene, e, L, alpha, measure);
    case 'grid':
      return buildGrid(scene, e, L, alpha);
  }
  return null;
}

function buildCaption(scene, c, measure) {
  const W = scene.width, H = scene.height;
  const fs = Math.max(14, Math.min(26, W * 0.03));
  const font = `600 ${fs}px ${FONT}`;
  const m = (t) => measure(t, font);
  const lines = wrapText(m, c.text, W - 80);
  const lh = fs * 1.5, padX = fs * 1.1, padY = fs * 0.7;
  const w = Math.min(W - 24, Math.max(...lines.map(m)) + padX * 2);
  const h = lines.length * lh + padY * 2 - (lh - fs);
  const x = (W - w) / 2, y = H - 18 - h + (1 - c.k) * 10;
  return { k: c.k, lines, box: { x, y, w, h, r: fs * 0.8 }, layout: { fs, padX, padY, lh } };
}

/**
 * 合成一帧 IR。frame 为 evaluate() 的返回值；measure(text, font) => 宽度。
 */
export function composeFrame(scene, frame, measure) {
  // ---- 可见性 + alpha 合成 + 排序（原 collect）----
  const items = [];
  scene.entities.forEach((e, i) => {
    if (e.type === 'layer') return;
    const L = frame.entities[i];
    if (L.hidden) return;
    const layer = e.layer >= 0 ? frame.entities[e.layer] : null;
    const alpha = L.alpha * L.ma * (layer ? layer.alpha : 1);
    if (alpha <= 0.002) return;
    items.push({ e, L, alpha, lz: layer ? layer.z : 0, i });
  });
  items.sort((p, q) => p.lz - q.lz || p.L.z - q.L.z || p.i - q.i);

  return {
    width: scene.width, height: scene.height,
    background: { inner: scene.bg2, outer: scene.bg },
    guide: { ax: scene.ax, ay: scene.ay, cols: scene.cols, rows: scene.rows, cw: scene.cw, ch: scene.ch, unit: scene.unit },
    items: items.map(({ e, L, alpha }) => buildItem(scene, e, L, alpha, measure)).filter(Boolean),
    captions: frame.captions.map((c) => buildCaption(scene, c, measure)),
  };
}
