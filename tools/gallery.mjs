// 为 examples/manifest.json 里的每个示例生成"各步骤冻结画面"的静态页，供肉眼检查与回归。
//   node tools/gallery.mjs            -> 写出 gallery.html（需 npm start 才能 import 模块）
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'examples/manifest.json'), 'utf8'));

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>GridMotion Gallery</title>
<style>
  body { margin: 0; background: #0b0c15; color: #e8eaf6; font: 14px system-ui, "Microsoft YaHei UI", sans-serif; padding: 20px; }
  h1 { font-size: 18px; } h2 { margin: 28px 0 6px; font-size: 16px; color: #7fe3d3; }
  .meta { color: #8a8fa8; font-size: 12px; margin-bottom: 8px; }
  .strip { display: flex; flex-wrap: wrap; gap: 10px; }
  figure { margin: 0; } figcaption { font-size: 11px; color: #8a8fa8; max-width: 260px; margin-top: 3px; }
  canvas { border-radius: 6px; box-shadow: 0 0 0 1px #22243a; width: 260px; display: block; }
  .bad { color: #ff6b8a; }
</style></head><body>
<h1>GridMotion Gallery</h1><div id="root"></div>
<script type="module">
import { compileWithImports, evaluate, lint } from './src/core/index.js';
import { draw } from './src/render/canvas2d.js';
const manifest = ${JSON.stringify(manifest)};
const root = document.getElementById('root');
const only = new URLSearchParams(location.hash.slice(1)).get('only');
for (const ex of manifest.examples) {
  if (only && ex.id !== only) continue;
  const src = await (await fetch('./examples/' + ex.file)).text();
  const base = new URL('./examples/' + ex.file, location.href);
  const loader = async (p) => { const r = await fetch(new URL(p, base).href); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); };
  const r = await compileWithImports(src, loader);
  const diags = r.scene ? [...r.diagnostics, ...lint(r.scene)] : r.diagnostics;
  const h = document.createElement('div');
  h.innerHTML = '<h2>' + ex.name + '</h2><div class="meta">' + ex.id + ' · ' + (r.scene ? r.scene.steps.length + ' 步 · ' + r.scene.duration.toFixed(1) + 's' : '编译失败') +
    (diags.length ? ' · <span class="bad">' + diags.length + ' 条诊断</span>' : ' · 零诊断') + '</div>';
  root.appendChild(h);
  if (!r.scene) continue;
  const strip = document.createElement('div'); strip.className = 'strip'; h.appendChild(strip);
  const sc = r.scene;
  sc.steps.forEach((s, i) => {
    const fig = document.createElement('figure');
    const c = document.createElement('canvas'); c.width = sc.width; c.height = sc.height;
    draw(c.getContext('2d'), sc, evaluate(sc, s.freeze), { pixelRatio: 1 });
    const cap = document.createElement('figcaption'); cap.textContent = (i + 1) + '. ' + (s.say || '');
    fig.append(c, cap); strip.appendChild(fig);
  });
}
document.title = 'ready';
</script></body></html>`;

writeFileSync(join(root, 'gallery.html'), html);
console.log('已写出 gallery.html；运行 npm start 后访问 http://localhost:5173/gallery.html#only=<示例id>');
