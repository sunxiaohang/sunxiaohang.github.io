import { composeFrame } from './ir.js';
import { drawSolid, drawRing, drawText, outline } from './shapes.js';
import { drawLine, drawNote, drawGridEntity, drawTrace } from './annotations.js';
import { drawMap } from './map.js';
import { drawGlyph } from './glyphs.js';
import { toCss, shade, mix } from '../core/util/color.js';
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
  map: (ctx, { item, pr }) => drawMap(ctx, item, pr),
  particles: (ctx, { item }) => {
    const two = item.fill2 && item.fill2[3] > 0;
    for (const p of item.points) {
      ctx.globalAlpha = Math.min(1, item.alpha * p.a);
      // 有 fill2 时按寿命在两色间插值，粒子一边飞一边变色
      ctx.fillStyle = toCss(two ? mix(item.fill, item.fill2, 1 - p.a) : item.fill);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  glyph: (ctx, { item, pr }) => {
    applyXform(ctx, item);
    // 图标有投影和描边：先画一圈同形的深色轮廓当描边（比 stroke 路径更稳），再画本体
    const body = item.fill, ink = shade(item.fill, -0.55);
    if (item.stroke[3] > 0 && item.strokeWidth > 0) {
      ctx.save();
      ctx.shadowColor = toCss(item.stroke);
      ctx.shadowBlur = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) {
        ctx.save();
        ctx.translate(dx * item.strokeWidth * 0.5, dy * item.strokeWidth * 0.5);
        drawGlyph(ctx, item.glyph, item.size, { body: toCss(item.stroke), glass: toCss(item.stroke), dark: toCss(item.stroke) });
        ctx.restore();
      }
      ctx.restore();
    }
    if (item.glow) { ctx.shadowColor = toCss(body, 0.45); ctx.shadowBlur = item.size * 0.25 * pr; }
    drawGlyph(ctx, item.glyph, item.size, { body: toCss(body), glass: toCss(shade(body, 0.62)), dark: toCss(ink, 0.35) });
  },
};

function applyXform(ctx, item) {
  ctx.translate(item.x + item.ox, item.y + item.oy);
  ctx.rotate(item.rot + item.orot);
  ctx.scale(item.sx, item.sy);
}

/** 裁剪：以容器的变换为坐标系，复用绘制同一份轮廓路径，再 clip。路径描完后立刻还原变换，clip 区域保持在世界坐标 */
function clipPath(ctx, c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.rot || 0);
  ctx.scale(c.sx || 1, c.sy || 1);
  outline(ctx, c);
  ctx.restore();
  ctx.clip();
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

const COMPOSITE = { add: 'lighter', screen: 'screen', multiply: 'multiply', overlay: 'overlay', lighten: 'lighten', darken: 'darken', difference: 'difference' };

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

  // 镜头：缩放平移整个画面（背景与字幕不受影响）
  ctx.save();
  if (ir.camera) {
    const { z, cx, cy } = ir.camera;
    ctx.translate(ir.width / 2, ir.height / 2);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
  }

  for (const item of ir.items) {
    ctx.save();
    if (item.blur) ctx.filter = `blur(${item.blur * pr}px)`;
    if (item.blend) ctx.globalCompositeOperation = COMPOSITE[item.blend] || 'source-over';
    if (item.clip) clipPath(ctx, item.clip);
    drawShadow(ctx, item);
    ctx.globalAlpha = Math.min(1, item.alpha);
    ctx.lineJoin = 'round';
    DRAWERS[item.kind]?.(ctx, { item, pr });
    ctx.restore();
  }
  ctx.restore();

  if (opts.captions !== false) for (const cap of ir.captions) drawCaption(ctx, cap);
  ctx.restore();
}
