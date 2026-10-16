globalThis.ResizeObserver = class { observe() {} };
globalThis.getComputedStyle = () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0' });
const { compile } = await import('./src/core/index.js');
const { StageView } = await import('./src/app/stage-view.js');
const { evaluate } = await import('./src/core/runtime/evaluate.js');
const { buildCamera } = await import('./src/render/ir.js');

function view(src, t) {
  const sc = compile(src).scene;
  const v = new StageView({ canvas: { getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }), width: 800, height: 600, style: {} }, wrap: { clientWidth: 800, clientHeight: 600 } });
  v.scene = sc; v.time = t; return { v, sc };
}
const W = (b) => `<scene width="800" height="600" grid="4x4" caption="false">${b}</scene>`;

// A：镜头 at="2,2"（不是中心）→ 画面被平移
{
  const { v, sc } = view(W('<circle id="c" at="3,3" size="80"/><camera at="2,2"/><emitter id="p" at="3,3" count="10"/>'), 0.5);
  const cam = buildCamera(sc, evaluate(sc, 0.5));
  console.log('A 镜头变换:', cam ? `z=${cam.z} 中心=(${Math.round(cam.cx)},${Math.round(cam.cy)})` : 'null（恒等）');
  const wx = sc.ax + 2.5 * sc.cw, wy = sc.ay + 2.5 * sc.ch;
  console.log('A 点圆的【世界】位置 →', v.pick(wx, wy)?.id ?? v.pick(wx, wy));
  // 圆在屏幕上的位置 = (世界 - cam.c) * z + 画布中心
  const sx = (wx - cam.cx) * cam.z + 400, sy = (wy - cam.cy) * cam.z + 300;
  console.log('A 点圆的【屏幕】位置 →', v.pick(sx, sy)?.id ?? v.pick(sx, sy));
}
// B：镜头 at 恰好是场景中心 → 恒等
{
  const { v, sc } = view(W('<circle id="c" at="3,3" size="80"/><camera/><emitter id="p" at="3,3" count="10"/>'), 0.5);
  const cam = buildCamera(sc, evaluate(sc, 0.5));
  console.log('B 镜头变换:', cam ? '有' : 'null（恒等）');
  const wx = sc.ax + 2.5 * sc.cw, wy = sc.ay + 2.5 * sc.ch;
  console.log('B 点圆 →', v.pick(wx, wy)?.id);
}
