import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const manifest = JSON.parse(readFileSync(join(ROOT, 'examples/manifest.json'), 'utf8'));
export const loadExample = (file) => readFileSync(join(ROOT, 'examples', file), 'utf8');
export const examples = manifest.examples.map((e) => ({ ...e, src: loadExample(e.file) }));

export const near = (a, b, eps = 1e-6) => {
  if (!(Math.abs(a - b) < eps)) throw new Error(`${a} !≈ ${b}`);
};
