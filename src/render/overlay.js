import { toCss } from '../core/util/color.js';
import { FONT, roundRectPath, wrapText } from './util.js';

export function drawBackground(ctx, scene) {
  const { width: W, height: H } = scene;
  const g = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, toCss(scene.bg2));
  g.addColorStop(1, toCss(scene.bg));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** 编辑器用的坐标参考（不属于场景内容，导出时不画） */
export function drawGuide(ctx, scene) {
  const { ax, ay, cols, rows, cw, ch, unit } = scene;
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

export function drawCaption(ctx, scene, text, k) {
  if (k <= 0.01) return;
  const W = scene.width, H = scene.height;
  const fs = Math.max(14, Math.min(26, W * 0.03));
  ctx.save();
  ctx.font = `600 ${fs}px ${FONT}`;
  const lines = wrapText(ctx, text, W - 80);
  const lh = fs * 1.5, padX = fs * 1.1, padY = fs * 0.7;
  const w = Math.min(W - 24, Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2);
  const h = lines.length * lh + padY * 2 - (lh - fs);
  const x = (W - w) / 2, y = H - 18 - h + (1 - k) * 10;
  ctx.globalAlpha = k;
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = 'rgba(8,10,24,.84)';
  roundRectPath(ctx, x, y, w, h, fs * 0.8);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#f4f6ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + padY + lh / 2 + i * lh - (lh - fs) / 2));
  ctx.restore();
}
