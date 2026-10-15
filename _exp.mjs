import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { compileWithImports } from './src/core/index.js';
import { evaluate } from './src/core/runtime/evaluate.js';
import { draw } from './src/render/canvas2d.js';
import { frameTimes } from './src/player/player.js';

const mkCtx = () => new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return (s) => ({ width: String(s).length * 10 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    return typeof t[p] === 'function' ? t[p] : (t[p] ??= () => {});
  },
  set(t, p, v) { t[p] = v; return true; },
});

const m = JSON.parse(readFileSync('examples/manifest.json', 'utf8'));
let bad = 0;
for (const e of m.examples) {
  const file = join('examples', e.file);
  const loader = async (p) => readFileSync(join(dirname(file), p), 'utf8');
  const res = await compileWithImports(readFileSync(file, 'utf8'), loader);
  if (!res.scene) { console.log(e.id, '编译失败'); continue; }
  const sc = res.scene, ctx = mkCtx();
  let failed = null;
  // 与导出完全一致：30fps 逐帧；captions 开 / 关各跑一遍
  for (const captions of [true, false]) {
    for (const t of frameTimes(sc.duration, 6)) {
      try { draw(ctx, sc, evaluate(sc, t), { pixelRatio: 1, captions, grid: false }); }
      catch (err) { failed = { t, captions, msg: err.message, stack: String(err.stack).split('\n').slice(1, 4).join(' | ') }; break; }
    }
    if (failed) break;
  }
  if (failed) { bad++; console.log('✖', e.id.padEnd(18), `t=${failed.t.toFixed(2)} captions=${failed.captions}`, failed.msg, '\n    ', failed.stack); }
}
console.log(bad ? `共 ${bad} 个示例导出会失败` : '全部示例逐帧绘制正常');
