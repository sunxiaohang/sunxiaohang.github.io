import { toCss } from '../core/util/color.js';
import { FONT, roundRectPath } from './util.js';

export function drawLine(ctx, e, L, pr) {
  const { x1, y1, x2, y2 } = L;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 0.5 || L.draw <= 0) return;
  const ux = dx / len, uy = dy / len;
  const tipX = x1 + dx * L.draw, tipY = y1 + dy * L.draw;
  const isArrow = e.type === 'arrow';
  const head = isArrow ? Math.min(e.head, len * L.draw) : 0;
  const bx = tipX - ux * head * 0.8, by = tipY - uy * head * 0.8;

  ctx.translate(L.ox, L.oy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = toCss(L.stroke);
  ctx.fillStyle = toCss(L.stroke);
  ctx.lineWidth = L.width;
  ctx.shadowColor = toCss(L.stroke, 0.5);
  ctx.shadowBlur = 6 * pr;
  if (e.dash) ctx.setLineDash([L.width * 2, L.width * 2]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(isArrow ? bx : tipX, isArrow ? by : tipY);
  ctx.stroke();
  ctx.setLineDash([]);
  if (isArrow && head > 1) {
    const nx = -uy, ny = ux, hw = head * 0.42;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ux * head + nx * hw, tipY - uy * head + ny * hw);
    ctx.lineTo(tipX - ux * head - nx * hw, tipY - uy * head - ny * hw);
    ctx.closePath();
    ctx.fill();
  }
}

/** 尾迹：按 draw 进度画出折线的前一段（按弧长计） */
export function drawTrace(ctx, e, L, pr) {
  const pts = e.pts;
  if (!pts || pts.length < 2 || L.draw <= 0) return;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const target = lens[lens.length - 1] * Math.min(1, L.draw);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = toCss(L.stroke);
  ctx.lineWidth = L.width;
  ctx.shadowColor = toCss(L.stroke, 0.5);
  ctx.shadowBlur = 4 * pr;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    if (lens[i] <= target) { ctx.lineTo(pts[i][0], pts[i][1]); continue; }
    const u = (target - lens[i - 1]) / Math.max(1e-9, lens[i] - lens[i - 1]);
    ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u);
    break;
  }
  ctx.stroke();
}

const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 带尾巴的文字气泡；尾巴指向 (L.x, L.y)，气泡会被夹在画布内 */
export function drawNote(ctx, scene, e, L) {
  const fs = Math.max(8, L.size);
  const lines = String(L.text).split(/\\n|\|/);
  ctx.font = `600 ${fs}px ${FONT}`;
  const padX = fs * 0.7, padY = fs * 0.45, lh = fs * 1.35, r = fs * 0.55, tail = fs * 0.5;
  const tw = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
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

  ctx.shadowColor = 'rgba(0,0,0,.4)';
  ctx.shadowBlur = fs * 0.8;
  ctx.shadowOffsetY = fs * 0.2;
  ctx.fillStyle = toCss(L.fill);
  roundRectPath(ctx, bx, by, w, h, r);
  ctx.fill();

  ctx.beginPath();
  if (e.side === 'top' || e.side === 'bottom') {
    const tx = clampTo(ax, bx + r + tail, bx + w - r - tail), top = e.side === 'top';
    const yb = top ? by + h - 1 : by + 1;
    ctx.moveTo(tx - tail, yb); ctx.lineTo(tx + tail, yb); ctx.lineTo(ax, top ? yb + tail * 1.4 : yb - tail * 1.4);
  } else {
    const ty = clampTo(ay, by + r + tail, by + h - r - tail), left = e.side === 'left';
    const xb = left ? bx + w - 1 : bx + 1;
    ctx.moveTo(xb, ty - tail); ctx.lineTo(xb, ty + tail); ctx.lineTo(left ? xb + tail * 1.4 : xb - tail * 1.4, ay);
  }
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = toCss(L.color);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, by + padY + lh / 2 + i * lh - (lh - fs) * 0.2));
}

/** 棋盘 / 参考网格：线穿过格子中心（棋类）或画格子边框（表格类） */
export function drawGridEntity(ctx, scene, e, L) {
  const { ax, ay, cols, rows, cw, ch, unit } = scene;
  const x1 = ax + cw / 2, y1 = ay + ch / 2, x2 = ax + (cols - 0.5) * cw, y2 = ay + (rows - 0.5) * ch;

  if (L.fill[3] > 0) {
    const m = e.style === 'cell' ? 0 : unit * 0.6;
    const left = e.style === 'cell' ? ax : x1, top = e.style === 'cell' ? ay : y1;
    const right = e.style === 'cell' ? ax + cols * cw : x2, bottom = e.style === 'cell' ? ay + rows * ch : y2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = unit * 0.5;
    ctx.shadowOffsetY = unit * 0.12;
    ctx.fillStyle = toCss(L.fill);
    roundRectPath(ctx, left - m, top - m, right - left + m * 2, bottom - top + m * 2, e.radius);
    ctx.fill();
    ctx.restore();
  }
  if (L.stroke[3] > 0 && L.width > 0) {
    ctx.strokeStyle = toCss(L.stroke);
    ctx.lineWidth = L.width;
    ctx.beginPath();
    if (e.style === 'cell') {
      for (let i = 0; i <= cols; i++) { ctx.moveTo(ax + i * cw, ay); ctx.lineTo(ax + i * cw, ay + rows * ch); }
      for (let j = 0; j <= rows; j++) { ctx.moveTo(ax, ay + j * ch); ctx.lineTo(ax + cols * cw, ay + j * ch); }
    } else {
      for (let i = 0; i < cols; i++) { const x = ax + (i + 0.5) * cw; ctx.moveTo(x, y1); ctx.lineTo(x, y2); }
      for (let j = 0; j < rows; j++) { const y = ay + (j + 0.5) * ch; ctx.moveTo(x1, y); ctx.lineTo(x2, y); }
    }
    ctx.stroke();
  }
  if (e.dots.length) {
    ctx.fillStyle = toCss(L.stroke, 1);
    for (const [x, y] of e.dots) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.5, unit * 0.09), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (e.labels && cols <= 26) {
    ctx.fillStyle = toCss(L.color);
    ctx.font = `600 ${Math.max(9, unit * 0.34)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (e.style === 'cell') {
      for (let i = 0; i < cols; i++) ctx.fillText(String.fromCharCode(65 + i), ax + (i + 0.5) * cw, ay - unit * 0.3);
      for (let j = 0; j < rows; j++) ctx.fillText(String(j + 1), ax - unit * 0.3, ay + (j + 0.5) * ch);
    } else {
      const off = unit * 0.95;
      for (let i = 0; i < cols; i++) ctx.fillText(String.fromCharCode(65 + i), ax + (i + 0.5) * cw, y1 - off);
      for (let j = 0; j < rows; j++) ctx.fillText(String(j + 1), x1 - off, ay + (j + 0.5) * ch);
    }
  }
}
