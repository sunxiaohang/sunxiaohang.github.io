import { evaluate } from '../core/runtime/evaluate.js';
import { draw } from '../render/canvas2d.js';

/**
 * 分镜：把每一步结束时的静帧拼成一张长图，本身就是一份图文教程。
 * 返回一个 canvas，宿主决定怎么保存。
 */
export function renderStoryboard(scene, { cols = 3, tileWidth = 520, gap = 20, createCanvas = () => document.createElement('canvas') } = {}) {
  const steps = scene.steps;
  if (!steps.length) return null;
  const c = Math.min(cols, steps.length);
  const rows = Math.ceil(steps.length / c);
  const aspect = scene.height / scene.width;
  let tw = tileWidth;
  while (rows * (tw * aspect + gap) + gap > 14000 && tw > 160) tw -= 20;
  const th = Math.round(tw * aspect);

  const sheet = createCanvas();
  sheet.width = c * tw + (c + 1) * gap;
  sheet.height = rows * (th + gap) + gap;
  const sx = sheet.getContext('2d');
  sx.fillStyle = '#0b0c15';
  sx.fillRect(0, 0, sheet.width, sheet.height);

  const tile = createCanvas();
  tile.width = tw * 2;
  tile.height = th * 2;
  const tx = tile.getContext('2d');
  steps.forEach((s, i) => {
    draw(tx, scene, evaluate(scene, s.freeze), { pixelRatio: tile.width / scene.width, grid: false });
    const x = gap + (i % c) * (tw + gap), y = gap + Math.floor(i / c) * (th + gap);
    sx.drawImage(tile, x, y, tw, th);
    sx.fillStyle = 'rgba(124,108,255,.95)';
    sx.beginPath();
    sx.arc(x + 22, y + 22, 15, 0, Math.PI * 2);
    sx.fill();
    sx.fillStyle = '#fff';
    sx.font = '700 15px system-ui,sans-serif';
    sx.textAlign = 'center';
    sx.textBaseline = 'middle';
    sx.fillText(String(i + 1), x + 22, y + 23);
  });
  return sheet;
}
