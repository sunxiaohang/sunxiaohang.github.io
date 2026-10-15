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
  const { ax, ay, cols, rows, cw, ch, unit, dark } = ir.guide;
  const ink = dark === false ? '20,22,40' : '255,255,255'; // 浅色背景上改用深色参考线
  ctx.save();
  if (cols * rows <= 400) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${ink},${dark === false ? 0.09 : 0.07})`;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) { const x = Math.round(ax + i * cw) + 0.5; ctx.moveTo(x, ay); ctx.lineTo(x, ay + rows * ch); }
    for (let j = 0; j <= rows; j++) { const y = Math.round(ay + j * ch) + 0.5; ctx.moveTo(ax, y); ctx.lineTo(ax + cols * cw, y); }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = `rgba(${ink},.28)`;
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
  const st = cap.style;
  const c = st.colors;
  ctx.save();
  ctx.font = `${st.weight} ${fs}px ${FONT}`;
  ctx.globalAlpha = cap.k;
  ctx.lineJoin = 'round';

  if (st.panel) {
    if (c.shadow && c.shadow[3] > 0) {
      ctx.shadowColor = toCss(c.shadow);
      ctx.shadowBlur = fs * 0.9;
      ctx.shadowOffsetY = fs * 0.12;
    }
    ctx.fillStyle = toCss(c.fill);
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    if (c.border) {
      ctx.strokeStyle = toCss(c.border);
      ctx.lineWidth = 1;
      if (st.full) {
        const ly = st.top ? y + h - 0.5 : y + 0.5;
        ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w, ly); ctx.stroke();
      } else {
        roundRectPath(ctx, x, y, w, h, r);
        ctx.stroke();
      }
    }
  }

  if (st.bar) {
    ctx.fillStyle = toCss(c.bar);
    roundRectPath(ctx, x, y + fs * 0.1, Math.max(2, fs * 0.14), h - fs * 0.2, fs * 0.07);
    ctx.fill();
  }

  ctx.textBaseline = 'middle';
  ctx.textAlign = st.left ? 'left' : 'center';
  const tx = st.left ? x + padX : x + w / 2;
  const ty = (i) => y + padY + lh / 2 + i * lh - (lh - fs) / 2;
  if (st.halo && c.shadow) {
    ctx.shadowColor = toCss(c.shadow);
    ctx.shadowBlur = fs * 0.5;
  }
  if (st.halo) {
    ctx.strokeStyle = toCss(c.halo);
    ctx.lineWidth = fs * 0.3;
    cap.lines.forEach((l, i) => ctx.strokeText(l, tx, ty(i)));
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = toCss(c.text);
  cap.lines.forEach((l, i) => ctx.fillText(l, tx, ty(i)));
  ctx.restore();
}