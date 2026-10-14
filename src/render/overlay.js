import { toCss } from '../core/util/color.js';
import { FONT, roundRectPath } from './util.js';

export function drawBackground(ctx, ir) {
  const { width: W, height: H } = ir;
  const g = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, toCss(ir.background.inner));
  g.addColorStop(1, toCss(ir.background.outer));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** 编辑器用的坐标参考（不属于场景内容，导出时不画） */
export function drawGuide(ctx, ir) {
  const { ax, ay, cols, rows, cw, ch, unit } = ir.guide;
  ctx.save();
  if (cols * rows <= 400) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) { const x = Math.round(ax + i * cw) + 0.5; ctx.moveTo(x, ay); ctx.lineTo(x, ay + rows * ch); }
    for (let j = 0; j <= rows; j++) { const y = Math.round(ay + j * ch) + 0.5; ctx.moveTo(ax, y); ctx.lineTo(ax + cols * cw, y); }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.font = `500 12px ${FONT}`;
  ctx.textBaseline = 'top';
  const labels = unit >= 56;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (labels) ctx.fillText(`${i + 1},${j + 1}`, ax + i * cw + 9, ay + j * ch + 8);
      ctx.beginPath();
      ctx.arc(ax + (i + 0.5) * cw, ay + (j + 0.5) * ch, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawCaption(ctx, cap) {
  if (cap.k <= 0.01) return;
  const { fs, padX, padY, lh } = cap.layout;
  const { x, y, w, h, r } = cap.box;
  ctx.save();
  ctx.font = `600 ${fs}px ${FONT}`;
  ctx.globalAlpha = cap.k;
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = 'rgba(8,10,24,.84)';
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#f4f6ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = x + w / 2;
  cap.lines.forEach((l, i) => ctx.fillText(l, cx, y + padY + lh / 2 + i * lh - (lh - fs) / 2));
  ctx.restore();
}
