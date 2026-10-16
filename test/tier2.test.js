import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, compileWithImports, evaluate } from '../src/core/index.js';
import { composeFrame } from '../src/render/ir.js';
import { draw } from '../src/render/canvas2d.js';

const measure = (text) => [...String(text)].length * 10;
function mockCtx() {
  const grad = { addColorStop() {} };
  const store = {};
  return new Proxy(store, {
    get(t, p) {
      if (p === 'measureText') return (s) => ({ width: measure(s) });
      if (/createLinearGradient|createRadialGradient|createPattern/.test(p)) return () => grad;
      const v = t[p];
      return typeof v === 'function' ? v : (v === undefined ? (t[p] = () => {}) : v);
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const wrap = (body, head = 'grid="6x4"') => `<scene width="800" height="600" ${head}>${body}</scene>`;
const ok = (r) => assert.ok(r.ok, JSON.stringify(r.diagnostics));
const rotOf = (sc, id, t) => evaluate(sc, t).entities[sc.byId.get(id).index].rot;

// ---------------- 沿路径朝向 ----------------
test('orbit + heading：车头随圆周切线转（修复前恒为 0）', () => {
  const r = compile(wrap('<icon id="c" name="car" at="3,2"/><step dur="2"><c orbit="1c" around="3,2" turns="1" heading="0" ease="linear"/></step>'));
  ok(r);
  const sc = r.scene;
  const r0 = rotOf(sc, 'c', 0);
  const rMid = rotOf(sc, 'c', sc.steps[0].t0 + 1);
  const rEnd = rotOf(sc, 'c', sc.duration);
  // 转一圈，车头朝向应单调变化约 2π
  assert.ok(Math.abs(rMid - r0) > 1, '半程朝向应明显改变');
  assert.ok(Math.abs((rEnd - r0) - Math.PI * 2) < 0.3, `整圈朝向应变化约 2π，实际 ${(rEnd - r0).toFixed(2)}`);
});

test('path + heading：直角拐弯后车头转 90°', () => {
  const r = compile(wrap('<icon id="c" name="car" at="1,1"/><step dur="2"><c path="1,1 5,1 5,4" heading="0"/></step>'));
  ok(r);
  const end = rotOf(r.scene, 'c', r.scene.duration);
  assert.ok(Math.abs(end - Math.PI / 2) < 0.2, `末端车头应朝下(≈π/2)，实际 ${end.toFixed(2)}`);
});

// ---------------- 时间控制 ----------------
test('speed：整步快放让动画时长按比例缩短，后续步骤顺延', () => {
  const base = compile(wrap('<circle id="a" at="1,1"/><step dur="1" hold=".3"><a at="3,3"/></step><step dur="1" hold=".3"><a at="1,1"/></step>'));
  const fast = compile(wrap('<circle id="a" at="1,1"/><step dur="1" hold=".3" speed="2"><a at="3,3"/></step><step dur="1" hold=".3"><a at="1,1"/></step>'));
  ok(base); ok(fast);
  // 步 1 的动画段：base 1s，fast 0.5s
  assert.ok(Math.abs((base.scene.steps[0].t1 - base.scene.steps[0].t0) - 1) < 1e-6);
  assert.ok(Math.abs((fast.scene.steps[0].t1 - fast.scene.steps[0].t0) - 0.5) < 1e-6);
  // 步 2 起点顺延（fast 更早）
  assert.ok(fast.scene.steps[1].t0 < base.scene.steps[1].t0);
});

test('speed：慢放让动画翻倍', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><step dur="1" speed="0.5"><a at="3,3"/></step>'));
  ok(r);
  assert.ok(Math.abs((r.scene.steps[0].t1 - r.scene.steps[0].t0) - 2) < 1e-6);
});

test('speed：慢放后对象在重映射的时间点上确实在中途', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><step dur="1" speed="0.5"><a px="700,500"/></step>'));
  ok(r);
  const a = r.scene.byId.get('a');
  // 动画 0→2s，1s 时应在中途（不在起点也不在终点）
  const mid = evaluate(r.scene, 1).entities[a.index];
  assert.ok(mid.x > 100 && mid.x < 690, `1s 时应在中途，实际 x=${mid.x.toFixed(0)}`);
});

test('mark：步骤标记记录时间点；重名报错', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><step mark="开场" dur=".5"><a at="2,2"/></step><step mark="收尾" dur=".5"><a at="3,3"/></step>'));
  ok(r);
  assert.ok(r.scene.marks.has('开场') && r.scene.marks.has('收尾'));
  assert.equal(r.scene.marks.get('开场').t, 0);
  assert.ok(r.scene.marks.get('收尾').t > 0);
  const dup = compile(wrap('<circle id="a" at="1,1"/><step mark="x"><a at="2,2"/></step><step mark="x"><a at="3,3"/></step>'));
  assert.ok(dup.diagnostics.some((d) => d.code === 'E_DUP_ID'));
});

// ---------------- 粒子 emitter ----------------
test('emitter：burst 生成指定数量粒子，一次性（不循环），场景时长覆盖寿命', () => {
  const r = compile(wrap('<emitter id="p" at="3,2" mode="burst" count="50" life="1.2" speed="2c"/>'));
  ok(r);
  const p = r.scene.byId.get('p');
  assert.equal(p.emit.particles.length, 50);
  assert.equal(p.emit.loop, false);
  assert.ok(r.scene.duration >= 1.2, `时长应覆盖寿命，实际 ${r.scene.duration}`);
});

test('emitter：粒子随时间运动（burst + 重力下坠）', () => {
  const r = compile(wrap('<emitter id="p" at="3,2" mode="burst" count="40" life="1.5" speed="1c" gravity="3"/>'));
  ok(r);
  const idx = r.scene.byId.get('p').index;
  const yAt = (t) => {
    const ir = composeFrame(r.scene, evaluate(r.scene, t), measure);
    const it = ir.items.find((x) => x.kind === 'particles');
    return it.points.length ? it.points.reduce((a, q) => a + q.y, 0) / it.points.length : null;
  };
  const y1 = yAt(0.4), y2 = yAt(0.9);
  assert.ok(y1 !== null && y2 !== null && y2 > y1, '重力应让粒子平均 y 增大（下坠）');
});

test('emitter：确定性——同脚本两次编译粒子参数完全一致', () => {
  const a = compile(wrap('<emitter id="p" at="3,2" count="30" mode="fountain"/>'));
  const b = compile(wrap('<emitter id="p" at="3,2" count="30" mode="fountain"/>'));
  assert.equal(JSON.stringify(a.scene.byId.get('p').emit.particles), JSON.stringify(b.scene.byId.get('p').emit.particles));
});

test('emitter：未知 mode 报错', () => {
  const r = compile(wrap('<emitter id="p" at="3,2" mode="乱写"/>'));
  assert.ok(r.diagnostics.some((d) => d.severity === 'error' && /mode/.test(d.message)));
});

test('emitter：不参与越界检查（粒子本就会飞出画布）', async () => {
  const { lint } = await import('../src/core/analysis/lint.js');
  const r = compile(wrap('<emitter id="p" at="3,2" mode="burst" count="40" speed="8c"/>'));
  ok(r);
  assert.ok(!lint(r.scene).some((d) => d.id === 'p'));
});

test('emitter：snow / fountain / rise / fall 都能渲染不抛异常', () => {
  for (const mode of ['snow', 'fountain', 'rise', 'fall', 'burst']) {
    const r = compile(wrap(`<emitter id="p" at="3,2" mode="${mode}" count="30"/><step dur="1"/>`));
    ok(r);
    for (let t = 0; t <= r.scene.duration; t += 0.25) {
      assert.doesNotThrow(() => draw(mockCtx(), r.scene, evaluate(r.scene, t), { pixelRatio: 1 }));
    }
  }
});

// ---------------- 外部音频 ----------------
test('audio：记录播放线索，at 支持秒数', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><audio src="bgm.mp3" at="1.5" volume=".6" loop/><step><a at="2,2"/></step>'));
  ok(r);
  assert.equal(r.scene.audios.length, 1);
  const a = r.scene.audios[0];
  assert.equal(a.src, 'bgm.mp3');
  assert.equal(a.at, 1.5);
  assert.equal(a.volume, 0.6);
  assert.equal(a.loop, true);
});

test('audio：at 可引用 <step mark> 的标记名', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><audio src="ding.mp3" at="高潮"/><step mark="高潮" dur="1"><a at="3,3"/></step>'));
  ok(r);
  assert.equal(r.scene.audios[0].at, r.scene.marks.get('高潮').t);
});

test('audio：缺 src 报错；at 写错标记名报错', () => {
  assert.ok(compile(wrap('<audio volume=".5"/>')).diagnostics.some((d) => d.code === 'E_MISSING_ATTR'));
  const bad = compile(wrap('<circle id="a" at="1,1"/><audio src="x.mp3" at="没这个标记"/><step><a at="2,2"/></step>'));
  assert.ok(bad.diagnostics.some((d) => d.code === 'E_BAD_VALUE' && /audio/.test(d.message)));
});

test('audio：compileWithImports 预加载二进制并挂到 cue.data', async () => {
  const loader = async (p, opts) => (opts?.binary ? new Uint8Array([1, 2, 3, 4]).buffer : Promise.reject(new Error('text not used')));
  const r = await compileWithImports(wrap('<circle id="a" at="1,1"/><audio src="n.mp3" at="0"/><step><a at="2,2"/></step>'), loader);
  ok(r);
  assert.ok(r.scene.audios[0].data instanceof ArrayBuffer);
  assert.equal(r.scene.audios[0].data.byteLength, 4);
});

test('audio：describe 与 JSON 序列化不受 marks(Map) 影响', async () => {
  const { describe } = await import('../src/core/analysis/lint.js');
  const r = compile(wrap('<circle id="a" at="1,1"/><audio src="x.mp3" at="0"/><step mark="m"><a at="2,2"/></step>'));
  ok(r);
  assert.doesNotThrow(() => JSON.stringify(describe(r.scene)));
});
