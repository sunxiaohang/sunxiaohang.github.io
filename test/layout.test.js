import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate, lint } from '../src/core/index.js';
import { buildPath, tracePoints, trailSamples } from '../src/core/util/path.js';
import { labelFontSize } from '../src/core/util/label.js';
import { examples, near } from './helpers.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const wrap = (body, head = '') => `<scene width="800" height="500" grid="8x5" ${head}>${body}</scene>`;
const build = (body, head) => {
  const r = compile(wrap(body, head));
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  return r;
};
const codes = (r) => [...r.diagnostics, ...lint(r.scene)].map((d) => d.code);

// =============== 路径：按弧长参数化 ===============

test('路径：折线与平滑曲线都按弧长参数化（走到 q 时，实际走过的路程 = q × 总长）', () => {
  const pts = [[100, 400], [260, 100], [520, 400], [700, 120]];
  for (const smooth of [false, true]) {
    const p = buildPath(pts, smooth);
    // 用 4000 个细分累计真实弧长，再检查 q = 0.1 … 0.9 处是否在 q × 总长 上
    const N = 4000, cum = [0];
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + dist(p.at((i - 1) / N), p.at(i / N)));
    assert.ok(Math.abs(cum[N] - p.length) < p.length * 0.002, `smooth=${smooth} 总长不一致：${cum[N]} vs ${p.length}`);
    for (let q = 0.1; q < 0.95; q += 0.1) {
      const walked = cum[Math.round(q * N)];
      assert.ok(Math.abs(walked - q * p.length) < 1.2, `smooth=${smooth} q=${q.toFixed(1)}：走过 ${walked.toFixed(1)}px，应为 ${(q * p.length).toFixed(1)}px`);
    }
    near(dist(p.at(0), pts[0]), 0, 1e-6);
    near(dist(p.at(1), pts.at(-1)), 0, 1e-6);
  }
});

test('路径：平滑曲线经过每个路标，且点距悬殊时不出现过冲（centripetal）', () => {
  const pts = [[100, 100], [110, 100], [600, 100], [610, 300], [200, 320]];
  const p = buildPath(pts, true);
  // 经过路标
  for (const v of pts) {
    let best = Infinity;
    for (let k = 0; k <= 4000; k++) best = Math.min(best, dist(p.at(k / 4000), v));
    assert.ok(best < 0.6, `曲线没有经过路标 ${v}：最近 ${best.toFixed(2)}px`);
  }
  // 曲线偏离“路标折线”的最大距离：悬殊点距下，均匀 Catmull-Rom（旧实现）会明显鼓包，centripetal 应小得多
  const segDist = (q, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2));
    return Math.hypot(q[0] - a[0] - dx * u, q[1] - a[1] - dy * u);
  };
  const dev = (at) => {
    let worst = 0;
    for (let k = 0; k <= 3000; k++) {
      const q = at(k / 3000);
      worst = Math.max(worst, Math.min(...pts.slice(1).map((b, i) => segDist(q, pts[i], b))));
    }
    return worst;
  };
  const uniform = (u0) => {   // 旧实现：均匀 Catmull-Rom，按“第几段”计时
    const n = pts.length - 1, u = u0 * n, i = Math.min(n - 1, Math.floor(u)), t = u - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    const f = (k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
    return [f(0), f(1)];
  };
  const centri = dev(p.at), old = dev(uniform);
  assert.ok(centri < old * 0.75, `centripetal 偏离 ${centri.toFixed(1)}px，应明显小于均匀 Catmull-Rom 的 ${old.toFixed(1)}px`);
});

test('路径：采样折线足够密，相邻采样的转角很小（看起来是光滑曲线，不是折线）', () => {
  const p = buildPath([[100, 400], [260, 100], [520, 400], [700, 120]], true);
  const s = p.sample(trailSamples(p.length));
  assert.ok(s.length >= 200, `采样点太少：${s.length}`);
  for (let i = 1; i < s.length - 1; i++) {
    const a = Math.atan2(s[i][1] - s[i - 1][1], s[i][0] - s[i - 1][0]);
    const b = Math.atan2(s[i + 1][1] - s[i][1], s[i + 1][0] - s[i][0]);
    let d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    assert.ok(d < 0.2, `第 ${i} 个采样点转角 ${(d * 180 / Math.PI).toFixed(1)}° 太大`);
  }
});

test('路径：重复点 / 起点与首个路标重合不会产生 NaN 或断裂', () => {
  const p = buildPath([[50, 50], [50, 50], [200, 80], [200, 80], [300, 300]], true);
  for (let k = 0; k <= 50; k++) for (const v of p.at(k / 50)) assert.ok(Number.isFinite(v));
  assert.ok(p.length > 200);
});

test('路径：过冲缓动（q 越界）沿端点切线外推，不被钳死', () => {
  const p = buildPath([[0, 0], [100, 0], [200, 100]], true);
  const before = p.at(-0.1), after = p.at(1.1);
  assert.ok(before[0] < 0 && after[0] > 200, `未外推：${before} ${after}`);
});

// =============== 尾迹：笔尖 = 圆心 ===============

test('尾迹：笔尖与所属对象的圆心始终重合（任何缓动、折线或曲线）', () => {
  for (const [path, smooth, ease] of [['2,1 6,4 3,5 7,2', ' smooth', 'soft'], ['2,1 6,4 3,5 7,2', '', 'in'], ['1,1 8,1 8,5', ' smooth', 'bounce'], ['1,3 4,1 7,3', ' smooth', 'back']]) {
    const r = build(`<circle id="a" at="1,1" size=".4c"/><step say="走"><a path="${path}"${smooth} trail ease="${ease}" dur="2"/></step>`);
    const sc = r.scene;
    const trace = sc.entities.find((e) => e.type === 'trace');
    const seg = sc.segments.find((s) => s.ent === trace.index);
    for (let k = 0; k <= 80; k++) {
      const f = evaluate(sc, seg.t0 + (seg.dur * k) / 80);
      const O = f.entities[trace.owner];
      const part = tracePoints(trace.pts, f.entities[trace.index].draw);
      if (!part.length) continue;
      const head = part.at(-1);
      // 过冲缓动时对象会冲出尾迹终点，此时笔尖停在终点；其余时刻必须重合
      const over = ease === 'back' || ease === 'bounce';
      if (!over || f.entities[trace.index].draw < 1) {
        const d = dist(head, [O.x + O.ox, O.y + O.oy]);
        assert.ok(d < (over ? 3 : 0.6), `${path} ${ease} k=${k}：笔尖偏离圆心 ${d.toFixed(2)}px`);
      }
    }
  }
});

test('尾迹：orbit 的尾迹是圆（采样足够密，不出现多边形棱角）', () => {
  const r = build('<circle id="p" at="6,3" size=".3c"/><step say="转"><p orbit="2c" around="4,3" turns="1" trail dur="2" ease="linear"/></step>');
  const trace = r.scene.entities.find((e) => e.type === 'trace');
  assert.ok(trace.pts.length > 150, `orbit 尾迹采样太少：${trace.pts.length}`);
});

// 通用护栏：所有示例里的所有尾迹，笔尖都必须落在所属对象的圆心上
for (const ex of examples) {
  test(`[${ex.category}/${ex.id}] 所有尾迹的笔尖与所属对象圆心重合`, async () => {
    const { compileWithImports } = await import('../src/core/index.js');
    const { makeLoader } = await import('./helpers.js');
    const { scene } = await compileWithImports(ex.src, makeLoader(ex.file));
    for (const trace of scene.entities.filter((e) => e.type === 'trace')) {
      const seg = scene.segments.find((s) => s.ent === trace.index);
      for (let k = 1; k < 30; k++) {
        const f = evaluate(scene, seg.t0 + (seg.dur * k) / 30);
        const draw = f.entities[trace.index].draw;
        if (draw >= 1) continue;
        const O = f.entities[trace.owner];
        const head = tracePoints(trace.pts, draw).at(-1);
        assert.ok(dist(head, [O.x + O.ox, O.y + O.oy]) < 1.5, `${trace.id} 在进度 ${k}/30 笔尖偏离圆心`);
      }
    }
  });
}

// =============== 绑定连线 ===============

test('绑定连线：端点落在两个对象的边缘外（留 gap），而不是写死的坐标', () => {
  const r = build('<rect id="a" at="2,3" w="1.2c" h="1c" radius="10"/><circle id="b" at="6,3" size="1c"/><arrow id="ln" from="a" to="b" gap="6"/><step say="x"><a pulse/></step>');
  assert.deepEqual(codes(r), []);
  const f = evaluate(r.scene, r.scene.steps[0].t0 + 0.0);
  const L = f.entities[r.scene.byId.get('ln').index];
  const A = f.entities[r.scene.byId.get('a').index], B = f.entities[r.scene.byId.get('b').index];
  near(L.x1, A.x + A.w / 2 + 6, 0.6);        // 起点 = 矩形右边缘 + gap
  near(L.x2, B.x - B.size / 2 - 6, 0.6);     // 终点 = 圆左边缘 - gap
  near(L.y1, A.y, 1e-6);
});

test('绑定连线：对象移动 / 脉冲放大时，连线跟着走，始终贴边', () => {
  const r = build('<rect id="a" at="2,3" w="1c" h="1c"/><circle id="b" at="6,3" size="1c"/><arrow id="ln" from="a" to="b" gap="4"/><step say="移" dur="1"><b at="6,1"/></step>');
  const sc = r.scene;
  const k = sc.byId.get('ln').index, b = sc.byId.get('b').index;
  const f0 = evaluate(sc, sc.steps[0].t0 - 0.001), f1 = evaluate(sc, sc.steps[0].freeze);
  assert.ok(Math.abs(f1.entities[k].y2 - f0.entities[k].y2) > 20, '终点应随 b 上移');
  const B = f1.entities[b];
  // 终点到 b 圆心的距离 = 半径 + gap
  near(Math.hypot(f1.entities[k].x2 - B.x, f1.entities[k].y2 - B.y), B.size / 2 + 4, 0.6);
});

test('绑定连线：一端是对象、另一端是格子坐标；引用不存在的对象有清晰的错误', () => {
  const ok = build('<circle id="a" at="2,3" size="1c"/><arrow id="ln" from="a" to="7,3"/><step say="x"><a pulse/></step>');
  assert.deepEqual(codes(ok), []);
  const bad = compile(wrap('<circle id="a" at="2,3"/><arrow from="a" to="nope"/>'));
  const d = bad.diagnostics.find((x) => x.code === 'E_BAD_VALUE');
  assert.ok(d && d.message.includes('对象 id'), JSON.stringify(bad.diagnostics));
  const same = compile(wrap('<circle id="a" at="2,3"/><arrow from="a" to="a"/>'));
  assert.ok(same.diagnostics.some((x) => x.message.includes('同一个对象')));
});

// =============== 版式 lint ===============

test('lint：连线端点被图形盖住 / 没接上，都会给出带修复建议的警告', () => {
  const covered = build('<layer name="l" z="1"/><layer name="n" z="3"/><rect id="a" at="2,3" w="1c" h="1c" layer="n"/><rect id="b" at="6,3" w="1c" h="1c" layer="n"/><arrow id="ln" from="2.9,3" to="6,3" layer="l"/><step say="x"><a pulse/></step>');
  const c = [...lint(covered.scene)].find((d) => d.code === 'W_LINE_COVERED');
  assert.ok(c && c.hint.includes('from='), '应提示被盖住并建议绑定');
  const gap = build('<rect id="a" at="2,3" w="1c" h="1c"/><rect id="b" at="6,3" w="1c" h="1c"/><arrow id="ln" from="2.65,3" to="5.4,3"/><step say="x"><a pulse/></step>');
  assert.ok(lint(gap.scene).some((d) => d.code === 'W_LINE_GAP'), '起点离 a 太远应报没接上');
});

test('lint：棋盘线、从棋子中心出发的标注箭头不是连接线，不应误报', () => {
  const r = build('<circle id="a" at="2,3" size="1c"/><circle id="b" at="6,3" size="1c"/><arrow id="ln" from="2,3" to="6,3"/><line from="1,1" to="8,1"/><step say="x"><a pulse/></step>');
  assert.equal(lint(r.scene).filter((d) => d.code.startsWith('W_LINE')).length, 0);
});

test('lint：卡片里的文字压边 / 溢出会报警，留足内边距则通过', () => {
  const tight = build('<rect id="c" at="4,3" w="2c" h="1.4c" radius="20"/><text id="t" at="4,3" off="0,.62c" text="拼音" size=".3c"/><step say="x"><c pulse/></step>');
  const cs = lint(tight.scene).map((d) => d.code);
  assert.ok(cs.includes('W_TEXT_TIGHT') || cs.includes('W_TEXT_OVERFLOW'), `应报文字贴边：${cs}`);
  const over = build('<rect id="c" at="4,3" w="1.2c" h="1c" radius="20"/><text id="t" at="4,3" text="这是一段很长的文字" size=".4c"/><step say="x"><c pulse/></step>');
  assert.ok(lint(over.scene).some((d) => d.code === 'W_TEXT_OVERFLOW'), '文字比容器宽应报溢出');
  const fine = build('<layer name="bg" z="0"/><layer name="fg" z="5"/><rect id="c" at="4,3" w="2c" h="1.4c" radius="20" layer="bg"/><text id="t" at="4,3" text="拼音" size=".3c" layer="fg"/><step say="x"><c pulse/></step>');
  assert.deepEqual(codes(fine), []);
});

test('lint：label 过长被压得看不清会提醒；正常 label 不报', () => {
  const small = build('<rect id="c" at="4,3" w="1c" h=".5c" label="这是一个非常非常长的标签文字" flat=""/><step say="x"><c pulse/></step>');
  assert.ok(lint(small.scene).some((d) => d.code === 'W_LABEL_SMALL'));
  const fine = build('<rect id="c" at="4,3" w="2c" h=".6c" label="确定" flat=""/><circle id="n" at="2,2" size=".8c" label="10"/><step say="x"><c pulse/></step>');
  assert.deepEqual(codes(fine), []);
});

test('label 字号：按宽度收缩（长文字不再溢出图形），短文字取高度的 0.52', () => {
  const single = labelFontSize('circle', 80, 80, '5');
  near(single, 80 * 0.52, 1e-6);
  const long = labelFontSize('rect', 100, 40, '200 OK · 59 ms');
  assert.ok(long < 40 * 0.52, '长文字应缩小');
  const two = labelFontSize('circle', 80, 80, '象棋');
  assert.ok(two * 2 <= 80 * 0.8, `两个汉字不应超出圆：字号 ${two}`);
});

test('off：与 size 同单位偏移，不受行高列宽影响', () => {
  const r = build('<text id="t" at="4,3" off="0,.5c" text="x" size=".3c"/><text id="u" at="4,3" text="x" size=".3c"/>', 'pad="0 0 100 0"');
  const t = r.scene.byId.get('t').init, u = r.scene.byId.get('u').init;
  near(t.x, u.x, 1e-6);
  near(t.y - u.y, 0.5 * r.scene.unit, 1e-6);
  const bad = compile(wrap('<text at="4,3" off="3" text="x"/>'));
  assert.ok(bad.diagnostics.some((d) => d.code === 'E_BAD_VALUE'));
});
