import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate } from '../src/core/index.js';
import { composeFrame } from '../src/render/ir.js';
import { draw } from '../src/render/canvas2d.js';
import { makeFormatter } from '../src/core/compile/looks.js';

/** 无头文本度量器：每字符 10px */
const measure = (text) => [...String(text)].length * 10;

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

const wrap = (body, head = 'grid="4x4"') => `<scene width="800" height="600" ${head}>${body}</scene>`;
const ok = (r) => assert.ok(r.ok, JSON.stringify(r.diagnostics));

// ---------------- 镜头 camera ----------------
test('镜头：zoom 与平移在渲染层产生变换，背景与字幕不受影响', () => {
  const r = compile(wrap('<circle id="a" at="2,2"/><camera/><step><camera zoom="2" at="3,3"/></step>'));
  ok(r);
  const cam = r.scene.entities.find((e) => e.type === 'camera');
  assert.ok(cam, '应创建 camera 实体');

  // t=0：zoom=1、看向场景中心 → 无变换
  const ir0 = composeFrame(r.scene, evaluate(r.scene, 0), measure);
  assert.equal(ir0.camera, null, 'zoom=1 且居中时不输出变换');

  // 步骤末：zoom=2、看向 (3,3)
  const irE = composeFrame(r.scene, evaluate(r.scene, r.scene.duration), measure);
  assert.ok(irE.camera, '应输出镜头变换');
  assert.ok(Math.abs(irE.camera.z - 2) < 1e-6);
  // 看向点 = 格子 (3,3) 的像素中心
  assert.ok(irE.camera.cx > 400 && irE.camera.cy > 300);
  // 镜头不是被渲染的 item
  assert.ok(!irE.items.some((it) => it.kind === 'camera'));
});

test('镜头：follow 跟随对象，中心取对象当前位置', () => {
  const r = compile(wrap('<circle id="car" at="1,1"/><camera zoom="2" follow="car"/><step><car at="4,4"/></step>'));
  ok(r);
  const irStart = composeFrame(r.scene, evaluate(r.scene, 0), measure);
  const irEnd = composeFrame(r.scene, evaluate(r.scene, r.scene.duration), measure);
  // 跟随：对象从 (1,1) 走到 (4,4)，镜头中心随之右下移
  assert.ok(irEnd.camera.cx > irStart.camera.cx);
  assert.ok(irEnd.camera.cy > irStart.camera.cy);
});

test('镜头：follow="none" 停止跟随', () => {
  const r = compile(wrap('<circle id="car" at="1,1"/><camera zoom="2" follow="car"/><step><camera follow="none" at="2,2"/></step>'));
  ok(r);
  const irEnd = composeFrame(r.scene, evaluate(r.scene, r.scene.duration), measure);
  const [cx, cy] = [r.scene.ax + 1.5 * r.scene.cw, r.scene.ay + 1.5 * r.scene.ch];
  assert.ok(Math.abs(irEnd.camera.cx - cx) < 1, '停止跟随后看向 at 指定点');
  assert.ok(Math.abs(irEnd.camera.cy - cy) < 1);
});

test('镜头：步骤里的 <camera> 修改同一台，不会新建第二台', () => {
  const r = compile(wrap('<camera/><step><camera zoom="2"/></step><step><camera zoom="1"/></step>'));
  ok(r);
  assert.equal(r.scene.entities.filter((e) => e.type === 'camera').length, 1);
});

test('镜头：follow 找不到对象报错', () => {
  const r = compile(wrap('<camera follow="幽灵"/>'));
  assert.ok(r.diagnostics.some((d) => d.severity === 'error' && /找不到要跟随/.test(d.message)));
});

test('镜头：不参与越界 / 超框检查', async () => {
  const { lint } = await import('../src/core/analysis/lint.js');
  // 镜头看向画面外，不应报 W_OFFSCREEN / W_OVERFLOW
  const r = compile(wrap('<circle id="a" at="2,2"/><camera at="2,2"/><step><camera px="-500,-500"/></step>'));
  ok(r);
  const issues = lint(r.scene);
  assert.ok(!issues.some((d) => d.id === r.scene.entities.find((e) => e.type === 'camera')?.id));
});

// ---------------- 文字动效 ----------------
test('数字滚动：count 从当前值补间到目标，fmt 实时格式化', () => {
  const r = compile(wrap('<text id="n" at="2,2" count="0" fmt="# 分"/><step dur="1"><n count="100"/></step>'));
  ok(r);
  const n = r.scene.byId.get('n');
  assert.equal(evaluate(r.scene, 0).entities[n.index].text, '0 分');
  const mid = evaluate(r.scene, r.scene.steps[0].t0 + 0.5).entities[n.index];
  const midVal = parseInt(mid.text, 10);
  assert.ok(midVal > 0 && midVal < 100, `中途应在 0~100 之间，实际 ${mid.text}`);
  assert.equal(evaluate(r.scene, r.scene.duration).entities[n.index].text, '100 分');
});

test('数字格式 makeFormatter：千分位、小数、前后缀', () => {
  assert.equal(makeFormatter('')(1234567), '1,234,567');
  assert.equal(makeFormatter('¥#.00')(1280.5), '¥1,280.50');
  assert.equal(makeFormatter('#%')(87), '87%');
  assert.equal(makeFormatter('# 人')(1280), '1,280 人');
  assert.equal(makeFormatter('#.0 万')(3.14159), '3.1 万');
});

test('打字机：in="type" 让文字 reveal 从 0 补间到 1', () => {
  const r = compile(wrap('<step><text id="t" at="2,2" text="你好世界" in="type" dur="1"/></step>'));
  ok(r);
  const t = r.scene.byId.get('t');
  assert.ok(evaluate(r.scene, 0).entities[t.index].reveal < 0.05);
  assert.ok(Math.abs(evaluate(r.scene, r.scene.steps[0].t0 + 1).entities[t.index].reveal - 1) < 0.05);
});

test('打字机：reveal 属性可在步骤里直接补间', () => {
  const r = compile(wrap('<text id="t" at="2,2" text="标题文字" reveal="0"/><step dur="1"><t reveal="1"/></step>'));
  ok(r);
  const t = r.scene.byId.get('t');
  assert.equal(evaluate(r.scene, 0).entities[t.index].reveal, 0);
  assert.ok(evaluate(r.scene, r.scene.duration).entities[t.index].reveal > 0.95);
});

test('打字机：in="type" 用在非文字上会降级并告警', () => {
  const r = compile(wrap('<step><circle id="c" at="2,2" in="type"/></step>'));
  assert.ok(r.diagnostics.some((d) => d.code === 'W_NOT_APPLICABLE' && /打字机/.test(d.message)));
});

// ---------------- 渐变 ----------------
test('渐变：写了 fill2 的图形在 IR 里带 grad 描述', () => {
  const r = compile(wrap('<rect id="a" at="2,2" w="100" h="60" fill="#4cc9f0" fill2="#ff6b9d"/><circle id="b" at="3,3" fill="#fff" fill2="#000" gradient="radial"/>'));
  ok(r);
  const ir = composeFrame(r.scene, evaluate(r.scene, 0), measure);
  const a = ir.items.find((it) => it.shape === 'rect');
  assert.ok(a.grad && a.grad.radial === false && Math.abs(a.grad.angle - 135) < 1e-6);
  const b = ir.items.find((it) => it.shape === 'circle');
  assert.ok(b.grad && b.grad.radial === true);
});

test('渐变：linear 可指定角度', () => {
  const r = compile(wrap('<rect id="a" at="2,2" w="100" h="60" fill="#4cc9f0" fill2="#ff6b9d" gradient="linear 45"/>'));
  ok(r);
  const ir = composeFrame(r.scene, evaluate(r.scene, 0), measure);
  assert.equal(ir.items.find((it) => it.shape === 'rect').grad.angle, 45);
});

test('渐变：fill2 可在步骤里补间（颜色过渡）', () => {
  const r = compile(wrap('<rect id="a" at="2,2" w="100" h="60" fill="#000000" fill2="#000000"/><step dur="1"><a fill2="#ffffff"/></step>'));
  ok(r);
  const a = r.scene.byId.get('a');
  const end = evaluate(r.scene, r.scene.duration).entities[a.index];
  assert.ok(end.fill2[0] > 200, '末帧 fill2 应接近白色');
});

// ---------------- 模糊 / 混合 ----------------
test('模糊：blur 进 IR，可在步骤里补间（聚焦动画）', () => {
  const r = compile(wrap('<circle id="a" at="2,2" blur="10"/><step dur="1"><a blur="0"/></step>'));
  ok(r);
  const a = r.scene.byId.get('a');
  const ir0 = composeFrame(r.scene, evaluate(r.scene, 0), measure);
  assert.ok(Math.abs(ir0.items.find((it) => it.kind === 'solid').blur - 10) < 1e-6);
  const irE = composeFrame(r.scene, evaluate(r.scene, r.scene.duration), measure);
  assert.ok(!irE.items.find((it) => it.kind === 'solid').blur, '末帧模糊应清零');
});

test('混合：blend 进 IR', () => {
  const r = compile(wrap('<circle id="a" at="2,2" blend="screen"/>'));
  ok(r);
  const ir = composeFrame(r.scene, evaluate(r.scene, 0), measure);
  assert.equal(ir.items.find((it) => it.kind === 'solid').blend, 'screen');
});

test('混合：未知模式报错', () => {
  const r = compile(wrap('<circle id="a" at="2,2" blend="xyz"/>'));
  assert.ok(r.diagnostics.some((d) => d.severity === 'error' && /混合模式/.test(d.message)));
});

test('图层：blur / blend 下沉到层内每个对象', () => {
  const r = compile(wrap('<layer name="bg" blur="6" blend="screen"><circle id="a" at="2,2"/></layer>'));
  ok(r);
  const ir = composeFrame(r.scene, evaluate(r.scene, 0), measure);
  const a = ir.items.find((it) => it.kind === 'solid');
  assert.ok(Math.abs(a.blur - 6) < 1e-6);
  assert.equal(a.blend, 'screen');
});

// ---------------- 裁剪 clip ----------------
test('裁剪：clip 解析成容器几何，进 IR', () => {
  const r = compile(wrap('<rect id="win" at="2,2" w="200" h="120"/><text id="t" at="2,2" text="被裁剪的文字" clip="win"/>'));
  ok(r);
  const t = r.scene.byId.get('t');
  assert.ok(t.clip >= 0, 'clip 应解析成容器 index');
  const ir = composeFrame(r.scene, evaluate(r.scene, 0), measure);
  const item = ir.items.find((it) => it.kind === 'text');
  assert.ok(item.clip && item.clip.shape === 'rect' && item.clip.w === 200);
});

test('裁剪：容器必须是实心图形', () => {
  const r = compile(wrap('<line id="ln" from="1,1" to="3,3"/><text id="t" at="2,2" text="x" clip="ln"/>'));
  assert.ok(r.diagnostics.some((d) => d.severity === 'error' && /实心图形/.test(d.message)));
});

test('裁剪：找不到容器报错', () => {
  const r = compile(wrap('<text id="t" at="2,2" text="x" clip="没有这个"/>'));
  assert.ok(r.diagnostics.some((d) => d.severity === 'error' && /裁剪容器/.test(d.message)));
});

// ---------------- 渲染冒烟：全特性一起不崩 ----------------
test('draw：镜头 + 渐变 + 模糊 + 混合 + 裁剪 + 打字机一起渲染不抛异常', () => {
  const r = compile(wrap(`
    <rect id="win" at="2,2" w="200" h="120" fill="#4cc9f0" fill2="#ff6b9d"/>
    <circle id="c" at="1,1" blur="5" blend="screen" fill="#ffd166"/>
    <text id="n" at="3,3" count="0" fmt="¥#,"/>
    <camera follow="c"/>
    <step dur="1"><text id="t" at="2,2" text="标题" clip="win" in="type"/><n count="9999"/><camera zoom="2"/></step>`));
  ok(r);
  for (let t = 0; t <= r.scene.duration; t += 0.2) {
    const f = evaluate(r.scene, t);
    assert.doesNotThrow(() => draw(mockCtx(), r.scene, f, { pixelRatio: 2, grid: false }));
  }
});
