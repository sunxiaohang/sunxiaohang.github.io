import { toCss, shade } from '../core/util/color.js';
import { FONT, roundRectPath } from './util.js';

/** 实心图形的轮廓路径；返回需要额外描边的"倒角"宽度（让尖角更圆润） */
function outline(ctx, item) {
  const s = item.size;
  switch (item.shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      return 0;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(0.5, item.w / 2), Math.max(0.5, item.h / 2), 0, 0, Math.PI * 2);
      return 0;
    case 'rect':
      roundRectPath(ctx, -item.w / 2, -item.h / 2, item.w, item.h, item.radius >= 0 ? item.radius : Math.min(item.w, item.h) * 0.2);
      return 0;
    case 'triangle': {
      const hh = s * 0.4, hw = s * 0.46;
      ctx.beginPath();
      ctx.moveTo(0, -hh); ctx.lineTo(hw, hh); ctx.lineTo(-hw, hh);
      ctx.closePath();
      return s * 0.12;
    }
    case 'star': {
      const n = Math.max(3, item.points || 5);
      const R = s * 0.46, r = R * 0.46;
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r : R;
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      return s * 0.07;
    }
  }
  return 0;
}

export function drawSolid(ctx, item, pr) {
  const boxed = item.shape === 'rect' || item.shape === 'ellipse';
  const s = Math.max(item.size, 1);
  const span = boxed ? Math.max(item.w, item.h, 1) : s;

  if (item.glow && !item.flat && item.fill[3] > 0.5) {
    ctx.shadowColor = toCss(item.fill, 0.45);
    ctx.shadowBlur = span * 0.16 * pr;
  }
  if (item.fill[3] > 0) {
    if (item.flat) {
      ctx.fillStyle = toCss(item.fill);
      ctx.strokeStyle = toCss(item.fill);
    } else {
      const g = ctx.createLinearGradient(-span / 2, -span / 2, span / 2, span / 2);
      g.addColorStop(0, toCss(shade(item.fill, 0.22)));
      g.addColorStop(1, toCss(shade(item.fill, -0.18)));
      ctx.fillStyle = g;
      ctx.strokeStyle = g;
    }
    const bevel = outline(ctx, item);
    if (bevel) { ctx.lineWidth = bevel; ctx.stroke(); }
    ctx.fill();
  } else outline(ctx, item);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  if ((item.shape === 'circle' || item.shape === 'ellipse') && item.fill[3] > 0.5 && !item.flat) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.lineWidth = Math.min(item.w || s, item.h || s) * 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(0, 0, (item.w || s) * 0.33, (item.h || s) * 0.33, 0, -2.55, -1.55);
    ctx.stroke();
    ctx.restore();
  }
  if (item.stroke[3] > 0 && item.strokeWidth > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = item.strokeWidth;
    ctx.strokeStyle = toCss(item.stroke);
    outline(ctx, item);
    ctx.stroke();
  }
  if (item.label) {
    ctx.fillStyle = toCss(item.color);
    const m = boxed ? Math.min(item.w, item.h) : s;
    const fs = item.labelFs || m * 0.4;
    ctx.font = `700 ${fs}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, 0, fs * 0.04);
  }
}

export function drawRing(ctx, item, pr) {
  const w = Math.max(0, item.width);
  ctx.shadowColor = toCss(item.stroke, 0.5);
  ctx.shadowBlur = 8 * pr;
  ctx.strokeStyle = toCss(item.stroke);
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0, (item.size - w) / 2), 0, Math.PI * 2);
  ctx.stroke();
}

export function drawText(ctx, item, pr) {
  if (item.glow) {
    ctx.shadowColor = toCss(item.fill, 0.5);
    ctx.shadowBlur = item.size * 0.2 * pr;
  }
  ctx.font = `700 ${item.size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = toCss(item.fill);
  const hasStroke = item.stroke[3] > 0 && item.strokeWidth > 0;
  if (hasStroke) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.lineJoin = 'round'; ctx.lineWidth = item.strokeWidth; ctx.strokeStyle = toCss(item.stroke); }
  item.lines.forEach((ln, i) => {
    const y = item.top + i * item.lineHeight;
    if (hasStroke) ctx.strokeText(ln, 0, y);
    ctx.fillText(ln, 0, y);
  });
}
