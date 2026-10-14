import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, compileWithImports } from '../src/core/index.js';
import { makeLoader } from './helpers.js';

// ---------------- theme 语义色 ----------------
test('theme：fill="accent" 命中 <theme> 声明，bg 也可引用', () => {
  const r = compile('<scene bg="bg"><theme accent="#ff0000" text="#00ff00" bg="#101020"/><circle id="a" at="1,1" fill="accent"/><text id="t" at="2,2" text="x" fill="text"/></scene>');
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.scene.byId.get('a').init.fill.slice(0, 3), [255, 0, 0]);
  assert.deepEqual(r.scene.byId.get('t').init.fill.slice(0, 3), [0, 255, 0]);
  assert.deepEqual(r.scene.bg.slice(0, 3), [16, 16, 32]);
});

test('theme：语义色覆盖内置色名', () => {
  const r = compile('<scene><theme red="#0000ff"/><circle id="a" at="1,1" fill="red"/></scene>');
  assert.deepEqual(r.scene.byId.get('a').init.fill.slice(0, 3), [0, 0, 255]);
});

test('theme：非法语义色值给出警告但不阻断编译', () => {
  const r = compile('<scene><theme accent="不是颜色"/><circle id="a" at="1,1" fill="accent"/></scene>');
  assert.ok(r.scene);
  assert.ok(r.diagnostics.some((d) => d.code === 'W_BAD_VALUE'));
  assert.ok(r.diagnostics.some((d) => d.code === 'E_BAD_COLOR'), '引用未解析的语义色应回退报错');
});

// ---------------- import 跨文件 ----------------
test('import：引入主题 + 组件库，语义色与 def 一起生效', async () => {
  const src = '<scene><import src="../themes/dark.xml"/><import src="../lib/cards.xml"/><卡牌 id="c" at="1,1" fill="accent"/></scene>';
  const r = await compileWithImports(src, makeLoader('effects/theme-demo.xml'));
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  assert.equal(r.scene.byId.get('c').type, 'rect');
  assert.deepEqual(r.scene.byId.get('c').init.fill.slice(0, 3).map(Math.round), [124, 108, 255]);
});

test('import：as 命名空间给 def 加前缀', async () => {
  const src = '<scene><import src="../lib/cards.xml" as="dk"/><dk.卡牌 id="c" at="1,1"/></scene>';
  const r = await compileWithImports(src, makeLoader('effects/theme-demo.xml'));
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  assert.equal(r.scene.byId.get('c').type, 'rect');
});

test('import：文件缺失与循环依赖给出诊断', async () => {
  const missing = await compileWithImports('<scene><import src="nope.xml"/></scene>', () => Promise.reject(new Error('ENOENT')));
  assert.ok(missing.diagnostics.some((d) => d.code === 'E_IMPORT'));
  const files = { 'a.xml': '<scene><import src="b.xml"/></scene>', 'b.xml': '<scene><import src="a.xml"/></scene>' };
  const loop = await compileWithImports('<scene><import src="a.xml"/></scene>', (p) => Promise.resolve(files[p]));
  assert.ok(loop.diagnostics.some((d) => d.code === 'E_IMPORT_LOOP'));
});

test('import：嵌套依赖被递归展开', async () => {
  const files = {
    'mid.xml': '<lib><import src="leaf.xml"/><def name="两层" is="circle" size=".5c"/></lib>',
    'leaf.xml': '<lib><def name="叶子" is="circle" size=".3c"/></lib>',
  };
  const src = '<scene><import src="mid.xml"/><两层 id="a" at="1,1"/><叶子 id="b" at="2,1"/></scene>';
  const r = await compileWithImports(src, (p) => Promise.resolve(files[p]));
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  assert.equal(r.scene.byId.get('a').type, 'circle');
  assert.equal(r.scene.byId.get('b').type, 'circle');
});
