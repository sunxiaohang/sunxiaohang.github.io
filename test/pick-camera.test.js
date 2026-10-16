import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate } from '../src/core/index.js';
import { buildCamera, screenToWorld } from '../src/render/ir.js';

// StageView 的构造依赖浏览器的 ResizeObserver / getContext：给 Node 一个最小替身，只为测试 pick / withWorld
globalThis.ResizeObserver = class { observe() {} };
globalThis.getComputedStyle = () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0' });
const { StageView } = await import('../src/app/stage-view.js');

const wrap = (body) => `<scene width="800" height="600" grid="4x4" caption="false">${body}</scene>`;

function makeView(src, t) {
  const r = compile(src);
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const calls = [];
  const ctx = new Proxy({}, { get: (_, p) => (p === 'canvas' ? {} : (...a) => { calls.push([p, ...a]); }), set: () => true });
  const view = new StageView({ canvas: { getContext: () => ctx, width: 800, height: 600, style: {} }, wrap: { clientWidth: 800, clientHeight: 600 } });
  view.scene = r.scene;
  view.time = t;
  return { view, scene: r.scene, calls, ctx };
}

/** 世界点经镜头变换后在屏幕上的位置（draw() 里做的那一套：平移到中心 → 缩放 → 平移回 -cx） */
const worldToScreen = (cam, scene, x, y) => [(x - cam.cx) * cam.z + scene.width / 2, (y - cam.cy) * cam.z + scene.height / 2];

test('screenToWorld：与 draw() 的镜头变换互为逆运算（往返不变）', () => {
  const r = compile(wrap('<circle id="a" at="2,2"/><camera/><step dur="1"><camera zoom="2.5" at="3,3"/></step>'));
  const sc = r.scene;
  const cam = buildCamera(sc, evaluate(sc, sc.duration));
  assert.ok(cam && Math.abs(cam.z - 2.5) < 1e-6);
  for (const [x, y] of [[100, 80], [400, 300], [700, 560], [-50, 900]]) {
    const [sx, sy] = worldToScreen(cam, sc, x, y);
    const [wx, wy] = screenToWorld(cam, sc, sx, sy);
    assert.ok(Math.abs(wx - x) < 1e-6 && Math.abs(wy - y) < 1e-6, `(${x},${y}) 往返后变成 (${wx},${wy})`);
  }
});

test('screenToWorld：没有镜头时原样返回', () => {
  const sc = compile(wrap('<circle id="a" at="2,2"/>')).scene;
  assert.deepEqual(screenToWorld(null, sc, 123, 45), [123, 45]);
});

test('pick：无镜头时行为不变（点圆心选中、点空白不选）', () => {
  const { view } = makeView(wrap('<circle id="a" at="2,2" size="80"/><rect id="b" at="3,3" w="80" h="80"/>'), 0);
  const a = view.scene.byId.get('a');
  const cx = view.scene.ax + 1.5 * view.scene.cw, cy = view.scene.ay + 1.5 * view.scene.ch;
  assert.equal(view.pick(cx, cy)?.id, 'a');
  assert.equal(view.pick(5, 5), null);
  assert.ok(a);
});

test('pick：镜头推近后，按"屏幕上看到的位置"点选，而不是按原始坐标', () => {
  // 镜头 2 倍看向 b：b 被放大到屏幕中央；a 被推到屏幕外
  const { view, scene } = makeView(
    wrap('<circle id="a" at="1,1" size="80"/><rect id="b" at="3,3" w="80" h="80"/><camera/><step dur="1"><camera zoom="2" follow="b"/></step>'), 99);
  view.time = scene.duration;
  // b 在屏幕中央 (400,300)：点中央应选中 b
  assert.equal(view.pick(400, 300)?.id, 'b');
  // 同样点中央，按"原始坐标"（不撤销镜头）是撞不到 b 的——b 的世界位置在右下，这正是修复前的错误
  const b = scene.byId.get('b');
  const bx = scene.ax + 2.5 * scene.cw, by = scene.ay + 2.5 * scene.ch;
  assert.ok(Math.abs(bx - 400) > 40 || Math.abs(by - 300) > 40, '测试前提：b 的世界位置不在画布正中');
  // a 在世界左上，被推出屏幕：屏幕左上角附近不应选中任何东西
  assert.equal(view.pick(60, 60), null);
});

test('pick：镜头和发射器不可点选（发射器有 18×18 的包围盒，点到它的位置必须仍选不中）', async () => {
  const { aabb } = await import('../src/core/analysis/lint.js');
  const { view, scene } = makeView(wrap('<camera at="2,2"/><emitter id="p" at="2,2" count="10" mode="fountain"/>'), 0.5);
  const p = scene.byId.get('p');
  const b = aabb(p, evaluate(scene, 0.5).entities[p.index]);
  assert.ok(b.r - b.l > 5, '测试前提：发射器必须有可被点中的包围盒，否则这条断言没有意义');
  const x = (b.l + b.r) / 2, y = (b.t + b.b) / 2;
  assert.equal(view.pick(x, y), null, '点到发射器正中心，也不应选中它');
});

test('pick：普通对象和发射器重叠、镜头恒等时，选中的是普通对象（排除按类型，不是整体失效）', () => {
  const { view, scene } = makeView(wrap('<circle id="c" at="3,3" size="80"/><camera/><emitter id="p" at="3,3" count="10"/>'), 0.5);
  assert.equal(buildCamera(scene, evaluate(scene, 0.5)), null, '测试前提：镜头应是恒等变换');
  const x = scene.ax + 2.5 * scene.cw, y = scene.ay + 2.5 * scene.ch;
  assert.equal(view.pick(x, y)?.id, 'c');
});

test('pick：镜头只平移（zoom=1）也要撤销——按屏幕位置选得中，按世界位置选不中', () => {
  // 镜头看向 (2,2) 而不是画面中心：画面被整体平移，即使 zoom 仍是 1
  const { view, scene } = makeView(wrap('<circle id="c" at="3,3" size="80"/><camera at="2,2"/>'), 0.5);
  const cam = buildCamera(scene, evaluate(scene, 0.5));
  assert.ok(cam && cam.z === 1, '测试前提：只平移、不缩放');
  const wx = scene.ax + 2.5 * scene.cw, wy = scene.ay + 2.5 * scene.ch;       // 圆的世界位置
  const sx = (wx - cam.cx) * cam.z + scene.width / 2, sy = (wy - cam.cy) * cam.z + scene.height / 2; // 圆在屏幕上的位置
  assert.equal(view.pick(sx, sy)?.id, 'c', '点圆在屏幕上的位置应选中');
  assert.equal(view.pick(wx, wy), null, '点圆的世界位置（此刻屏幕上是空白）不应选中——修复前会错选');
});

test('pick：线条的包围盒是 0×0，本来就点不中（既有行为，记录下来，防止被无意改变）', () => {
  const { view, scene } = makeView(wrap('<line id="ln" from="1,1" to="4,1" width="12"/>'), 0);
  const lx = scene.ax + 2.5 * scene.cw, ly = scene.ay + 0.5 * scene.ch;
  assert.equal(view.pick(lx, ly), null);
});

test('withWorld：线宽按 1/(pr·z) 补偿，放大后选框在屏幕上粗细不变', () => {
  const { view, scene, ctx } = makeView(wrap('<circle id="a" at="2,2" size="80"/><camera/><step dur="1"><camera zoom="4" at="2,2"/></step>'), 0);
  const frame = evaluate(scene, scene.duration);
  let k1 = null;
  view.withWorld(frame, (k) => { k1 = k; });
  const pr = view.canvas.width / scene.width;
  assert.ok(Math.abs(k1 - 1 / (pr * 4)) < 1e-9, `k 应为 1/(pr·z)，实际 ${k1}`);
  void ctx;
});
