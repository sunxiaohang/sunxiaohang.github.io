import { toCss, shade } from '../core/util/color.js';
import { FONT, roundRectPath } from './util.js';

/** 实心图形的轮廓路径；返回需要额外描边的"倒角"宽度（让尖角更圆润） */
function outline(ctx, e, L) {
  const s = L.size;
  switch (e.type) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      return 0;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(0.5, L.w / 2), Math.max(0.5, L.h / 2), 0, 0, Math.PI * 2);
      return 0;
    case 'rect':
      roundRectPath(ctx, -L.w / 2, -L.h / 2, L.w, L.h, e.radius >= 0 ? e.radius : Math.min(L.w, L.h) * 0.2);
      return 0;
    case 'triangle': {
      const hh = s * 0.4, hw = s * 0.46;
      ctx.beginPath();
      ctx.moveTo(0, -hh); ctx.lineTo(hw, hh); ctx.lineTo(-hw, hh);
      ctx.closePath();
      return s * 0.12;
    }
    case 'star': {
      const R = s * 0.46, r = R * 0.46;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      return s * 0.07;
    }
  }
  return 0;
}

export function drawSolid(ctx, scene, e, L, pr) {
  const boxed = e.type === 'rect' || e.type === 'ellipse';
  const s = Math.max(L.size, 1);
  const span = boxed ? Math.max(L.w, L.h, 1) : s;

  if (scene.glow && !e.flat && L.fill[3] > 0.5 && !e.matte) {
    ctx.shadowColor = toCss(L.fill, 0.45);
    ctx.shadowBlur = span * 0.16 * pr;
  }
  if (L.fill[3] > 0) {
    if (e.flat) {
      ctx.fillStyle = toCss(L.fill);
      ctx.strokeStyle = toCss(L.fill);
    } else {
      const g = ctx.createLinearGradient(-span / 2, -span / 2, span / 2, span / 2);
      g.addColorStop(0, toCss(shade(L.fill, 0.22)));
      g.addColorStop(1, toCss(shade(L.fill, -0.18)));
      ctx.fillStyle = g;
      ctx.strokeStyle = g;
    }
    const bevel = outline(ctx, e, L);
    if (bevel) { ctx.lineWidth = bevel; ctx.stroke(); }
    ctx.fill();
  } else outline(ctx, e, L);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  if ((e.type === 'circle' || e.type === 'ellipse') && L.fill[3] > 0.5 && !e.flat) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.lineWidth = Math.min(L.w || s, L.h || s) * 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(0, 0, (L.w || s) * 0.33, (L.h || s) * 0.33, 0, -2.55, -1.55);
    ctx.stroke();
    ctx.restore();
  }
  if (L.stroke[3] > 0 && L.width > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = L.width;
    ctx.strokeStyle = toCss(L.stroke);
    outline(ctx, e, L);
    ctx.stroke();
  }
  if (L.label) {
    ctx.fillStyle = toCss(L.color);
    const m = boxed ? Math.min(L.w, L.h) : s;
    const n = [...String(L.label)].length;
    const fit = n > 1 ? Math.min(0.52, 1.1 / n + 0.06) : 0.52;
    ctx.font = `700 ${Math.max(10, m * fit)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(L.label, 0, m * 0.02);
  }
}

export function drawRing(ctx, L, pr) {
  const w = Math.max(0, L.width);
  ctx.shadowColor = toCss(L.stroke, 0.5);
  ctx.shadowBlur = 8 * pr;
  ctx.strokeStyle = toCss(L.stroke);
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0, (L.size - w) / 2), 0, Math.PI * 2);
  ctx.stroke();
}

export function drawText(ctx, scene, L, pr) {
  if (scene.glow) {
    ctx.shadowColor = toCss(L.fill, 0.5);
    ctx.shadowBlur = L.size * 0.2 * pr;
  }
  ctx.font = `700 ${L.size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = toCss(L.fill);
  ctx.fillText(L.text, 0, 0);
}
