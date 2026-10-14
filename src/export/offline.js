import { evaluate } from '../core/runtime/evaluate.js';
import { draw } from '../render/canvas2d.js';
import { frameTimes } from '../player/player.js';

/**
 * 离线逐帧渲染：不依赖实时播放，按 fps 均匀采样、逐帧求值并渲染到 canvas。
 * 每一帧回调 onFrame(canvas, t, i)，由调用方决定如何编码 / 保存（PNG 序列、WebM、GIF…）。
 * createCanvas 可注入，使 Node（node-canvas / skia-canvas）也能无头渲染。
 *
 * 与"实时录制"的区别：帧内容由求值确定性产生，不受播放卡顿影响；渲染速度只取决于编码，
 * 可快于实时，也可用于高分辨率 / 逐帧精确控制。
 */
export async function renderFrames(scene, {
  fps = 30,
  scale = 1,
  onFrame,
  createCanvas = () => document.createElement('canvas'),
  signal,
  captions = true,
  grid = false,
} = {}) {
  if (!scene || typeof onFrame !== 'function') return 0;
  const canvas = createCanvas();
  canvas.width = Math.max(1, Math.round(scene.width * scale));
  canvas.height = Math.max(1, Math.round(scene.height * scale));
  const ctx = canvas.getContext('2d');
  let i = 0;
  for (const t of frameTimes(scene.duration, fps)) {
    if (signal?.aborted) break;
    draw(ctx, scene, evaluate(scene, t), { pixelRatio: scale, captions, grid });
    await onFrame(canvas, t, i);
    i++;
  }
  return i;
}
