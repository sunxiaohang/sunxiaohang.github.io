import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate } from '../src/core/index.js';
import { composeFrame } from '../src/render/ir.js';
import { setSceneAttr, getSceneAttr } from '../src/app/scene-src.js';

const measure = (text) => [...String(text)].length * 10;
const scene = (head) => `<scene width="800" height="500" grid="4x3" ${head}><circle id="a" at="2,2"/><step say="一句字幕"><a pulse/></step></scene>`;
const irOf = (head) => {
  const r = compile(scene(head));
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.diagnostics, []);
  return composeFrame(r.scene, evaluate(r.scene, r.scene.steps[0].freeze), measure);
};

test('字幕：默认是安静的 soft 胶囊，字号随画布宽度', () => {
  const cap = irOf('').captions[0];
  assert.equal(cap.style.name, 'soft');
  assert.equal(cap.style.panel, true);
  assert.ok(cap.layout.fs >= 18 && cap.layout.fs <= 20, `默认字号应约为 800 × 2.4% ≈ 19，实际 ${cap.layout.fs}`);
  assert.ok(cap.style.colors.fill[3] < 0.9, '底板应是半透明的，不抢画面');
});

test('字幕：每种样式都能产出完整、可序列化的布局，且不超出画布', () => {
  for (const s of ['soft', 'plain', 'bar', 'minimal', 'accent', 'classic']) {
    const cap = irOf(`caption="${s}"`).captions[0];
    assert.equal(cap.style.name, s);
    assert.ok(cap.box.w > 0 && cap.box.h > 0, s);
    assert.ok(cap.box.x >= 0 && cap.box.x + cap.box.w <= 800 + 1e-6, `${s} 横向不应出界`);
    assert.ok(cap.box.y >= 0 && cap.box.y + cap.box.h <= 500 + 1e-6, `${s} 纵向不应出界`);
    assert.doesNotThrow(() => JSON.stringify(cap));
  }
  assert.equal(irOf('caption="bar"').captions[0].box.w, 800, 'bar 是通栏');
  assert.equal(irOf('caption="minimal"').captions[0].style.left, true);
});

test('字幕：caption-size 预设与像素值；caption-pos 决定上下位置', () => {
  const fs = (h) => irOf(h).captions[0].layout.fs;
  assert.ok(fs('caption-size="small"') < fs('') && fs('') < fs('caption-size="large"') && fs('caption-size="large"') < fs('caption-size="xlarge"'));
  assert.equal(fs('caption-size="30"'), 30);
  const bottom = irOf('').captions[0].box.y;
  const top = irOf('caption-pos="top"').captions[0].box.y;
  assert.ok(top < 100 && bottom > 400, `top=${top} bottom=${bottom}`);
});

test('字幕：caption="false" 关闭；写错值给出带可选项的错误', () => {
  const off = compile(scene('caption="false"'));
  assert.equal(off.scene.caption, false);
  assert.equal(evaluate(off.scene, off.scene.steps[0].freeze).captions.length, 0);
  const bad = compile(scene('caption="fancy" caption-size="huge" caption-pos="left"'));
  const codes = bad.diagnostics.filter((d) => d.code === 'E_BAD_VALUE');
  assert.equal(codes.length, 3);
  assert.ok(codes[0].hint.includes('soft'));
});

test('字幕：样式颜色跟随配色模板，换配色字幕也换', () => {
  const light = irOf('palette="porcelain"').captions[0].style.colors;
  const dark = irOf('palette="graphite"').captions[0].style.colors;
  assert.ok(light.text[0] < 100, '浅色底上字幕文字应是深色');
  assert.ok(dark.text[0] > 200, '深色底上字幕文字应是浅色');
});

test('scene-src：读写 <scene> 上带连字符的属性', () => {
  const s = '<scene width="8" caption="bar" caption-size="large" palette="nord">';
  assert.equal(getSceneAttr(s, 'caption'), 'bar');
  assert.equal(getSceneAttr(s, 'caption-size'), 'large');
  assert.equal(setSceneAttr(s, 'caption', 'false'), '<scene width="8" caption-size="large" palette="nord" caption="false">');
  assert.equal(setSceneAttr(s, 'caption-size', ''), '<scene width="8" caption="bar" palette="nord">');
  assert.equal(setSceneAttr('<scene a="1"/>', 'caption', 'plain'), '<scene a="1" caption="plain"/>');
  assert.equal(setSceneAttr('<x/>', 'caption', 'bar'), null);
});
