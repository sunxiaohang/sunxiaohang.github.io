import { toCss } from '../core/util/color.js';
import { tracePoints } from '../core/util/path.js';
import { FONT, roundRectPath } from './util.js';

export function drawLine(ctx, item, pr) {
  const { x1, y1, x2, y2 } = item;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 0.5 || item.draw <= 0) return;
  const ux = dx / len, uy = dy / len;
  const tipX = x1 + dx * item.draw, tipY = y1 + dy * item.draw;
  const isArrow = item.kind === 'arrow';
  const head = isArrow ? Math.min(item.head, len * item.draw) : 0;
  const bx = tipX - ux * head * 0.8, by = tipY - uy * head * 0.8;

  ctx.translate(item.ox, item.oy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = toCss(item.stroke);
  ctx.fillStyle = toCss(item.stroke);
  ctx.lineWidth = item.width;
  ctx.shadowColor = toCss(item.stroke, 0.5);
  ctx.shadowBlur = 6 * pr;
  if (item.dash) ctx.setLineDash([item.width * 2, item.width * 2]);
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

/** 尾迹：按 draw 进度画出折线的前一段；笔尖与所属对象的圆心是同一个点（见 util/path.js） */
export function drawTrace(ctx, item, pr) {
  const part = tracePoints(item.pts, item.draw);
  if (part.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = toCss(item.stroke);
  ctx.lineWidth = item.width;
  ctx.shadowColor = toCss(item.stroke, 0.5);
  ctx.shadowBlur = 4 * pr;
  ctx.beginPath();
  ctx.moveTo(part[0][0], part[0][1]);
  for (let i = 1; i < part.length; i++) ctx.lineTo(part[i][0], part[i][1]);
  ctx.stroke();
}

/** 带尾巴的文字气泡；气泡位置与尾巴已在 compose 阶段算好 */
export function drawNote(ctx, item) {
  const { fs, padX, padY, lh } = item.layout;
  const { x: bx, y: by, w, h, r } = item.box;

  ctx.shadowColor = 'rgba(0,0,0,.4)';
  ctx.shadowBlur = fs * 0.8;
  ctx.shadowOffsetY = fs * 0.2;
  ctx.fillStyle = toCss(item.fill);
  roundRectPath(ctx, bx, by, w, h, r);
  ctx.fill();

  ctx.beginPath();
  const [p0, p1, p2] = item.tail;
  ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = toCss(item.color);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  item.lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, by + padY + lh / 2 + i * lh - (lh - fs) * 0.2));
}

/** 棋盘 / 参考网格：线穿过格子中心（棋类）或画格子边框（表格类） */
export function drawGridEntity(ctx, item) {
  const { ax, ay, cols, rows, cw, ch, unit } = item;
  const x1 = ax + cw / 2, y1 = ay + ch / 2, x2 = ax + (cols - 0.5) * cw, y2 = ay + (rows - 0.5) * ch;

  if (item.fill[3] > 0) {
    const m = item.style === 'cell' ? 0 : unit * 0.6;
    const left = item.style === 'cell' ? ax : x1, top = item.style === 'cell' ? ay : y1;
    const right = item.style === 'cell' ? ax + cols * cw : x2, bottom = item.style === 'cell' ? ay + rows * ch : y2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = unit * 0.5;
    ctx.shadowOffsetY = unit * 0.12;
    ctx.fillStyle = toCss(item.fill);
    roundRectPath(ctx, left - m, top - m, right - left + m * 2, bottom - top + m * 2, item.radius);
    ctx.fill();
    ctx.restore();
  }
  if (item.stroke[3] > 0 && item.width > 0) {
    ctx.strokeStyle = toCss(item.stroke);
    ctx.lineWidth = item.width;
    ctx.beginPath();
    if (item.style === 'cell') {
      for (let i = 0; i <= cols; i++) { ctx.moveTo(ax + i * cw, ay); ctx.lineTo(ax + i * cw, ay + rows * ch); }
      for (let j = 0; j <= rows; j++) { ctx.moveTo(ax, ay + j * ch); ctx.lineTo(ax + cols * cw, ay + j * ch); }
    } else {
      for (let i = 0; i < cols; i++) { const x = ax + (i + 0.5) * cw; ctx.moveTo(x, y1); ctx.lineTo(x, y2); }
      for (let j = 0; j < rows; j++) { const y = ay + (j + 0.5) * ch; ctx.moveTo(x1, y); ctx.lineTo(x2, y); }
    }
    ctx.stroke();
  }
  if (item.dots.length) {
    ctx.fillStyle = toCss(item.stroke, 1);
    for (const [x, y] of item.dots) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.5, unit * 0.09), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (item.labels && cols <= 26) {
    ctx.fillStyle = toCss(item.color);
    ctx.font = `600 ${Math.max(9, unit * 0.34)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (item.style === 'cell') {
      for (let i = 0; i < cols; i++) ctx.fillText(String.fromCharCode(65 + i), ax + (i + 0.5) * cw, ay - unit * 0.3);
      for (let j = 0; j < rows; j++) ctx.fillText(String(j + 1), ax - unit * 0.3, ay + (j + 0.5) * ch);
    } else {
      const off = unit * 0.95;
      for (let i = 0; i < cols; i++) ctx.fillText(String.fromCharCode(65 + i), ax + (i + 0.5) * cw, y1 - off);
      for (let j = 0; j < rows; j++) ctx.fillText(String(j + 1), x1 - off, ay + (j + 0.5) * ch);
    }
  }
}
