import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, compileWithImports } from '../src/core/index.js';
import { PALETTES, PALETTE_NAMES, getPalette, seriesOf } from '../src/core/palettes.js';
import { parseColor, luminance } from '../src/core/util/color.js';
import { examples, makeLoader } from './helpers.js';

const hex = (c) => '#' + c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('配色库：名字唯一，令牌齐全且都是合法颜色，系列色 8 个互不相同', () => {
  assert.equal(new Set(PALETTE_NAMES).size, PALETTES.length);
  for (const p of PALETTES) {
    for (const k of ['accent', 'accent2', 'text', 'sub', 'bg', 'bg2', 'warn', 'good', 'bad']) {
      assert.ok(parseColor(p.tokens[k]), `${p.name}.${k} 不是合法颜色`);
    }
    const s = seriesOf(p.tokens);
    assert.equal(s.length, 8, p.name);
    assert.equal(new Set(s.map((c) => c.toLowerCase())).size, 8, `${p.name} 系列色有重复`);
    s.forEach((c) => assert.ok(parseColor(c), `${p.name} 系列色 ${c}`));
  }
});

test('配色库：dark 标记与背景亮度一致，正文与背景对比度足够（WCAG ≥ 7）', () => {
  for (const p of PALETTES) {
    const bg = parseColor(p.tokens.bg), text = parseColor(p.tokens.text);
    assert.equal(luminance(bg) < 0.4, p.dark, `${p.name} 的 dark 标记与背景不符`);
    assert.ok(contrast(bg, text) >= 7, `${p.name} 正文对比度 ${contrast(bg, text).toFixed(1)} 太低`);
    assert.ok(contrast(bg, parseColor(p.tokens.sub)) >= 3.5, `${p.name} 次要文字对比度太低`);
  }
});

test('配色库：别名可用，未知名字返回 null', () => {
  assert.equal(getPalette('pantone').name, 'pantone-classic-blue');
  assert.equal(getPalette(' Material ').name, 'material');
  assert.equal(getPalette('不存在'), null);
});

test('palette：背景、默认图形色、文字色、线条色自动套用', () => {
  const r = compile('<scene palette="nord"><circle id="a" at="1,1"/><circle id="b" at="2,1"/><text id="t" at="1,2" text="x"/><line id="l" from="1,1" to="2,2"/></scene>');
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === 'error'), []);
  const nord = getPalette('nord').tokens;
  assert.equal(hex(r.scene.bg), nord.bg.toLowerCase());
  assert.equal(hex(r.scene.bg2), nord.bg2.toLowerCase());
  assert.equal(hex(r.scene.byId.get('a').init.fill), nord.c1.toLowerCase());
  assert.equal(hex(r.scene.byId.get('b').init.fill), nord.c2.toLowerCase());
  assert.equal(hex(r.scene.byId.get('t').init.fill), nord.text.toLowerCase());
  assert.equal(hex(r.scene.byId.get('l').init.stroke), nord.text.toLowerCase());
  assert.equal(r.scene.dark, true);
});

test('palette：浅色配色标记 dark=false，没配色时保持原有默认外观', () => {
  assert.equal(compile('<scene palette="material"><circle id="a" at="1,1"/></scene>').scene.dark, false);
  const plain = compile('<scene><circle id="a" at="1,1"/></scene>').scene;
  assert.equal(plain.themed, false);
  assert.equal(plain.dark, true);
  assert.equal(hex(plain.byId.get('a').init.fill), '#ff6b9d');
});

test('palette：语义色可直接写进 fill，显式写的颜色覆盖模板同名项，显式 bg 优先', () => {
  const r = compile('<scene palette="material" bg="#101010"><theme accent="#ff0000"/><circle id="a" at="1,1" fill="accent"/><circle id="b" at="2,1" fill="good"/></scene>');
  assert.deepEqual(r.scene.byId.get('a').init.fill.slice(0, 3), [255, 0, 0]);
  assert.equal(hex(r.scene.byId.get('b').init.fill), getPalette('material').tokens.good.toLowerCase());
  assert.deepEqual(r.scene.bg.slice(0, 3), [16, 16, 16]);
  assert.notEqual(hex(r.scene.bg2), getPalette('material').tokens.bg2.toLowerCase(), '显式 bg 时不再取模板的 bg2');
});

test('palette：<theme palette> 可用，scene 上的 palette 优先', () => {
  const a = compile('<scene><theme palette="dracula"/><circle id="c" at="1,1"/></scene>').scene;
  assert.equal(hex(a.bg), getPalette('dracula').tokens.bg.toLowerCase());
  const b = compile('<scene palette="nord"><theme palette="dracula"/><circle id="c" at="1,1"/></scene>').scene;
  assert.equal(hex(b.bg), getPalette('nord').tokens.bg.toLowerCase());
});

test('palette：未知名字报错并给出相近建议，不阻断编译', () => {
  const r = compile('<scene palette="nrod"><circle id="a" at="1,1"/></scene>');
  const d = r.diagnostics.find((x) => x.code === 'E_BAD_VALUE');
  assert.ok(d, JSON.stringify(r.diagnostics));
  assert.match(d.message, /nrod/);
  assert.match(d.hint ?? d.message, /nord/);
});

test('pal(i)：按序号循环取系列色；pal("名字") 取语义色；未配色时用默认系列色', () => {
  const m = getPalette('material').tokens;
  const r = compile('<scene palette="material"><circle id="a" at="1,1" fill="{pal(0)}"/><circle id="b" at="2,1" fill="{pal(9)}"/><circle id="c" at="3,1" fill="{pal(-1)}"/><circle id="d" at="1,2" fill="{pal(&quot;accent&quot;)}"/></scene>');
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === 'error'), [], JSON.stringify(r.diagnostics));
  const f = (id) => hex(r.scene.byId.get(id).init.fill);
  assert.equal(f('a'), m.c1.toLowerCase());
  assert.equal(f('b'), m.c2.toLowerCase());
  assert.equal(f('c'), m.c8.toLowerCase());
  assert.equal(f('d'), m.accent.toLowerCase());
  const plain = compile('<scene><circle id="a" at="1,1" fill="{pal(1)}"/></scene>').scene;
  assert.equal(hex(plain.byId.get('a').init.fill), '#4cc9f0');
  const bad = compile('<scene><circle id="a" at="1,1" fill="{pal(&quot;nope&quot;)}"/></scene>');
  assert.ok(bad.diagnostics.some((d) => d.code === 'E_EXPR'));
});

test('palette：图形标签按填充色自动选深 / 浅字，保证对比度', () => {
  const r = compile('<scene palette="macaron"><circle id="a" at="1,1" label="x"/></scene>').scene;
  const a = r.byId.get('a').init;
  assert.ok(contrast(a.fill, a.color) >= 4.5, `马卡龙浅底上的标签对比度 ${contrast(a.fill, a.color).toFixed(1)}`);
  const d = compile('<scene palette="material-dark"><circle id="a" at="1,1" label="x"/></scene>').scene.byId.get('a').init;
  assert.ok(contrast(d.fill, d.color) >= 4.5);
  for (const p of PALETTES) {
    for (let i = 1; i <= 8; i++) {
      const s = compile(`<scene palette="${p.name}"><circle id="a" at="1,1" fill="c${i}" label="x"/></scene>`).scene.byId.get('a').init;
      assert.ok(contrast(s.fill, s.color) >= 3, `${p.name} c${i} 标签对比度 ${contrast(s.fill, s.color).toFixed(1)}`);
    }
  }
});

test('palette：所有示例在每一套配色下都能编译、无错误（配色可随意切换）', async () => {
  for (const e of examples) {
    for (const p of PALETTES) {
      const src = e.src.replace(/<scene\b[^>]*>/, (tag) => `${tag.replace(/\s+palette="[^"]*"/, '').replace(/(\/?>)$/, ` palette="${p.name}"$1`)}`);
      const r = await compileWithImports(src, makeLoader(e.file));
      const errs = r.diagnostics.filter((d) => d.severity === 'error');
      assert.deepEqual(errs, [], `${e.id} × ${p.name}`);
    }
  }
});
