import { readFileSync } from 'node:fs';
import { compileWithImports, lint } from './src/core/index.js';
import { dirname, resolve } from 'node:path';

const manifest = JSON.parse(readFileSync('examples/manifest.json', 'utf8'));
let total = 0;
for (const ex of manifest.examples) {
  const file = resolve('examples', ex.file);
  const src = readFileSync(file, 'utf8');
  const res = await compileWithImports(src, async (p) => readFileSync(resolve(dirname(file), p), 'utf8'));
  if (!res.scene) { console.log(ex.id, '编译失败', res.diagnostics[0]?.message); continue; }
  const probs = [...res.diagnostics, ...lint(res.scene)];
  if (probs.length) {
    total += probs.length;
    console.log(`\n== ${ex.id}`);
    for (const d of probs.slice(0, 6)) console.log(`  ${d.code}: ${d.message}`);
    if (probs.length > 6) console.log(`  … 还有 ${probs.length - 6} 条`);
  }
}
console.log(`\n共 ${total} 条`);
