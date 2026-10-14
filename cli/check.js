import { readFileSync } from 'node:fs';
import { compile, describe, lint, evaluate, schema } from '../src/core/index.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};

if (args.includes('--schema')) {
  console.log(JSON.stringify(schema(), null, 2));
  process.exit(0);
}

const at = flag('--at');
const step = flag('--step');
const file = args[0];
if (!file) {
  console.error('用法：node cli/check.js <脚本.xml|-> [--at 秒] [--step N]   |   node cli/check.js --schema');
  process.exit(2);
}

const src = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
const res = compile(src);
const out = { ok: res.ok, diagnostics: res.diagnostics };
if (res.scene) {
  out.diagnostics = [...res.diagnostics, ...lint(res.scene)];
  out.report = describe(res.scene);
  let t = at !== undefined ? Number(at) : undefined;
  if (step !== undefined) {
    const s = res.scene.steps[Number(step) - 1];
    if (s) t = s.freeze;
  }
  if (t !== undefined) out.frame = evaluate(res.scene, t);
}
console.log(JSON.stringify(out, null, 2));
process.exit(res.ok ? 0 : 1);
