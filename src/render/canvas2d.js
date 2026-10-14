import { composeFrame } from './ir.js';
import { drawSolid, drawRing, drawText } from './shapes.js';
import { drawLine, drawNote, drawGridEntity, drawTrace } from './annotations.js';
import { drawBackground, drawGuide, drawCaption } from './overlay.js';

/** 每种图元的绘制入口：由 IR 的 kind 分发 */
const DRAWERS = {
  solid: (ctx, { item, pr }) => { applyXform(ctx, item); drawSolid(ctx, item, pr); },
  text: (ctx, { item, pr }) => { applyXform(ctx, item); drawText(ctx, item, pr); },
  ring: (ctx, { item, pr }) => { applyXform(ctx, item); drawRing(ctx, item, pr); },
  line: (ctx, { item, pr }) => drawLine(ctx, item, pr),
  arrow: (ctx, { item, pr }) => drawLine(ctx, item, pr),
  trace: (ctx, { item, pr }) => drawTrace(ctx, item, pr),
  note: (ctx, { item }) => {
    ctx.translate(item.ox, item.oy);
    ctx.translate(item.x, item.y);
    ctx.scale(item.sx, item.sy);
    ctx.translate(-item.x, -item.y);
    drawNote(ctx, item);
  },
  grid: (ctx, { item }) => drawGridEntity(ctx, item),
};

function applyXform(ctx, item) {
  ctx.translate(item.x + item.ox, item.y + item.oy);
  ctx.rotate(item.rot + item.orot);
  ctx.scale(item.sx, item.sy);
}

function drawShadow(ctx, item) {
  const s = item.shadow;
  if (!s) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(1, 0.2);
  ctx.fillStyle = `rgba(0,0,0,${0.3 * item.alpha * (1 - s.k * 0.6)})`;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0, s.rx), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Canvas2D 后端：把 frame 画到 ctx 上。逻辑坐标 = 场景像素，pixelRatio = 画布像素 / 场景像素。
 * 先合成 IR（纯数据），再由本后端消费；SVG / WebGL 后端可复用同一份 IR。
 */
export function draw(ctx, scene, frame, opts = {}) {
  const pr = opts.pixelRatio ?? 1;
  const measure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
  const ir = composeFrame(scene, frame, measure);

  ctx.setTransform(pr, 0, 0, pr, 0, 0);
  ctx.clearRect(0, 0, ir.width, ir.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ir.width, ir.height);
  ctx.clip();
  drawBackground(ctx, ir);
  if (opts.grid) drawGuide(ctx, ir);

  for (const item of ir.items) {
    ctx.save();
    drawShadow(ctx, item);
    ctx.globalAlpha = Math.min(1, item.alpha);
    ctx.lineJoin = 'round';
    DRAWERS[item.kind]?.(ctx, { item, pr });
    ctx.restore();
  }

  if (opts.captions !== false) for (const cap of ir.captions) drawCaption(ctx, cap);
  ctx.restore();
}
