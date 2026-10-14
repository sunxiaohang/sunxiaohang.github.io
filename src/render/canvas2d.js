import { SOLID } from '../core/lang/schema.js';
import { drawSolid, drawRing, drawText } from './shapes.js';
import { drawLine, drawNote, drawGridEntity, drawTrace } from './annotations.js';
import { drawBackground, drawGuide, drawCaption } from './overlay.js';

function drawShadow(ctx, scene, e, L, a) {
  if (!scene.shadow || !SOLID.has(e.type) || e.flat) return;
  // 半透明或无填充的图形（高亮框、标注框）也是"平面"的，不该有落地投影
  if (L.fill[3] < 0.9) return;
  const boxed = e.type === 'rect' || e.type === 'ellipse';
  const half = (boxed ? L.h : L.size) / 2;
  // 投影只锚定"设定位置 + 原始尺寸"：跳起/抖动/压扁都不会把影子带走或带缩
  const lift = Math.max(0, -L.oy);
  const k = Math.min(1, lift / (L.size * 1.6 + 1));
  const rx = (boxed ? L.w : L.size) * 0.5 * (1 - k * 0.4);
  ctx.save();
  ctx.translate(L.x, L.y + half);
  ctx.scale(1, 0.2);
  ctx.fillStyle = `rgba(0,0,0,${0.3 * a * (1 - k * 0.6)})`;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0, rx), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 每种图元的绘制入口：新增图元只需在这里登记一项 */
const DRAWERS = {
  grid: (ctx, { scene, e, L }) => drawGridEntity(ctx, scene, e, L),
  line: (ctx, { e, L, pr }) => drawLine(ctx, e, L, pr),
  arrow: (ctx, { e, L, pr }) => drawLine(ctx, e, L, pr),
  trace: (ctx, { e, L, pr }) => drawTrace(ctx, e, L, pr),
  note: (ctx, { scene, e, L }) => {
    ctx.translate(L.ox, L.oy);
    ctx.translate(L.x, L.y);
    ctx.scale(L.sx, L.sy);
    ctx.translate(-L.x, -L.y);
    drawNote(ctx, scene, e, L);
  },
  text: (ctx, { scene, L, pr }) => { applyXform(ctx, L); drawText(ctx, scene, L, pr); },
  ring: (ctx, { L, pr }) => { applyXform(ctx, L); drawRing(ctx, L, pr); },
};
for (const t of SOLID) DRAWERS[t] = (ctx, { scene, e, L, pr }) => { applyXform(ctx, L); drawSolid(ctx, scene, e, L, pr); };

function applyXform(ctx, L) {
  ctx.translate(L.x + L.ox, L.y + L.oy);
  ctx.rotate(L.rot + L.orot);
  ctx.scale(L.sx, L.sy);
}

/** 可见对象按 (图层 z, 对象 z, 书写顺序) 排序 */
function collect(scene, frame) {
  const items = [];
  scene.entities.forEach((e, i) => {
    if (e.type === 'layer') return;
    const L = frame.entities[i];
    if (L.hidden) return;
    const layer = e.layer >= 0 ? frame.entities[e.layer] : null;
    const a = L.alpha * L.ma * (layer ? layer.alpha : 1);
    if (a <= 0.002) return;
    items.push({ e, L, a, lz: layer ? layer.z : 0, i });
  });
  return items.sort((p, q) => p.lz - q.lz || p.L.z - q.L.z || p.i - q.i);
}

/**
 * 把 frame 画到 ctx 上。逻辑坐标 = 场景像素，pixelRatio = 画布像素 / 场景像素。
 * 只依赖 CanvasRenderingContext2D，因此也可接 node-canvas / OffscreenCanvas 做无头渲染。
 */
export function draw(ctx, scene, frame, opts = {}) {
  const pr = opts.pixelRatio ?? 1;
  ctx.setTransform(pr, 0, 0, pr, 0, 0);
  ctx.clearRect(0, 0, scene.width, scene.height);
  // 裁剪到场景范围内，避免大字号/长文本/标签/光晕溢出舞台
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, scene.width, scene.height);
  ctx.clip();
  drawBackground(ctx, scene);
  if (opts.grid) drawGuide(ctx, scene);

  for (const { e, L, a } of collect(scene, frame)) {
    ctx.save();
    drawShadow(ctx, scene, e, L, a);
    ctx.globalAlpha = Math.min(1, a);
    ctx.lineJoin = 'round';
    DRAWERS[e.type]?.(ctx, { scene, e, L, pr });
    ctx.restore();
  }

  if (opts.captions !== false) for (const c of frame.captions) drawCaption(ctx, scene, c.text, c.k);
  ctx.restore();
}
