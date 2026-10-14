import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate } from '../src/core/index.js';
import { composeFrame } from '../src/render/ir.js';
import { draw } from '../src/render/canvas2d.js';

/** 无头文本度量器：每字符 10px（Node 无 canvas 时的等价替身） */
const measure = (text) => [...String(text)].length * 10;

/** 极简 CanvasRenderingContext2D 替身：让 draw() 无头跑通、不抛异常 */
function mockCtx() {
  const gradient = { addColorStop() {} };
  const store = {};
  return new Proxy(store, {
    get(t, p) {
      if (p === 'measureText') return (s) => ({ width: measure(s) });
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => gradient;
      const v = t[p];
      return typeof v === 'function' ? v : (v === undefined ? (t[p] = () => {}) : v);
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

const wrap = (body, head = '') => `<scene width="800" height="600" grid="3x3" ${head}>${body}</scene>`;

test('composeFrame：产出有序 IR，含投影/折行/字幕，且为纯数据', () => {
  const r = compile(wrap('<circle id="a" at="1,1" fill="#ff0000"/><text id="t" at="2,2" text="很长的一行会折行" w="40"/><note id="n" at="3,3" text="提示"/><step say="第一步字幕"><a pulse/></step>'));
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  const frame = evaluate(r.scene, r.scene.steps[0].freeze);
  const ir = composeFrame(r.scene, frame, measure);

  assert.equal(ir.width, 800);
  assert.equal(ir.height, 600);
  assert.ok(Array.isArray(ir.background.inner));
  const kinds = ir.items.map((it) => it.kind);
  assert.ok(kinds.includes('solid'));
  assert.ok(kinds.includes('text'));
  assert.ok(kinds.includes('note'));
  // 实心图形有投影
  const solid = ir.items.find((it) => it.kind === 'solid');
  assert.ok(solid.shadow && Number.isFinite(solid.shadow.x));
  // 折行文本有多行
  const text = ir.items.find((it) => it.kind === 'text');
  assert.ok(text.lines.length > 1);
  // 字幕带布局
  assert.equal(ir.captions.length, 1);
  assert.ok(ir.captions[0].box.w > 0);
  // IR 是纯数据：可 JSON 序列化（不含 DOM / 函数）
  const json = JSON.stringify(ir);
  assert.ok(json.includes('"kind":"solid"'));
});

test('draw：无头画布下整帧可跑通、不抛异常', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><rect id="b" at="2,2" w="80" h="40"/><line id="l" from="1,1" to="3,3"/><step say="ok"><a at="2,2" walk/></step>'));
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  const frame = evaluate(r.scene, r.scene.steps[0].freeze);
  assert.doesNotThrow(() => draw(mockCtx(), r.scene, frame, { pixelRatio: 2, grid: true }));
  assert.doesNotThrow(() => draw(mockCtx(), r.scene, frame, { pixelRatio: 1, grid: false }));
});
