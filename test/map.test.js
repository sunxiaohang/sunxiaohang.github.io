import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate, lint, schema } from '../src/core/index.js';
import { composeFrame } from '../src/render/ir.js';
import { buildPath, bulgePoints, headingAt, shortestAngle, tracePoints } from '../src/core/util/path.js';
import { findCity } from '../src/core/geo/index.js';
import { near } from './helpers.js';

const measure = (t) => [...String(t)].length * 10;
const wrap = (body, head = '') => `<scene width="960" height="720" grid="12x9" pad="16 16 96 16" palette="graphite" ${head}>${body}</scene>`;
const build = (body, head) => {
  const r = compile(wrap(body, head));
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  return r;
};
const errs = (r) => r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
const irOf = (r, t = 0) => composeFrame(r.scene, evaluate(r.scene, t), measure);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// =============== <map> 与地名定位 ===============

test('map：编译出省界、外轮廓、南海诸岛，并进入渲染 IR', () => {
  const r = build('<map id="m"/><step say="x"><m alpha="1"/></step>');
  assert.deepEqual(errs(r), []);
  const m = r.scene.byId.get('m');
  assert.equal(m.provinces.length, 34);
  assert.equal(m.islands.length, 10, '九段线 10 段');
  const item = irOf(r).items.find((i) => i.kind === 'map');
  assert.ok(item && item.provinces.length === 34 && item.style.coastWidth > 0);
  assert.doesNotThrow(() => JSON.stringify({ ...item, provinces: item.provinces.length }));
});

test('定位：city / lonlat / at="成都" 落在同一个像素；北京在成都的右上方', () => {
  const r = build('<map/><circle id="a" city="成都"/><circle id="b" lonlat="104.065,30.659"/><circle id="c" at="成都"/><circle id="bj" city="北京"/>');
  assert.deepEqual(errs(r), []);
  const p = (id) => [r.scene.byId.get(id).init.x, r.scene.byId.get(id).init.y];
  assert.ok(dist(p('a'), p('c')) < 1e-6, 'city 与 at=地名 同一点');
  assert.ok(dist(p('a'), p('b')) < 1.5, 'lonlat 与 city 在同一位置（城市表四舍五入到 0.001°）');
  assert.ok(p('bj')[0] > p('a')[0] && p('bj')[1] < p('a')[1]);
});

test('定位：所有城市都落在地图框内（没有跑到画布外）', () => {
  const r = build('<map id="m"/><circle id="a" city="乌鲁木齐"/><circle id="b" city="漠河"/><circle id="c" city="三亚"/><circle id="d" city="喀什"/><circle id="e" city="台北"/>');
  const box = r.scene.byId.get('m').mapBox;
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    const { x, y } = r.scene.byId.get(id).init;
    assert.ok(x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h, `${id} 在地图框外：${x},${y}`);
  }
});

test('定位：没有 <map> 就写地名 → 明确的错误；城市名写错 → 带“是不是想写”的提示', () => {
  const noMap = compile(wrap('<circle city="成都"/>'));
  assert.ok(noMap.diagnostics.some((d) => d.code === 'E_NO_MAP' && d.hint.includes('<map')));
  const typo = compile(wrap('<map/><circle city="成部"/>'));
  const d = typo.diagnostics.find((x) => x.code === 'E_BAD_PLACE');
  assert.ok(d && d.hint.includes('成都'), JSON.stringify(typo.diagnostics));
  const bad = compile(wrap('<map region="火星"/>'));
  assert.ok(bad.diagnostics.some((x) => x.code === 'E_BAD_VALUE' && x.message.includes('region')));
  const badProj = compile(wrap('<map projection="xyz"/>'));
  assert.ok(badProj.diagnostics.some((x) => x.message.includes('projection')));
});

test('region：省名（可多个）放大到该区域；局部区域里城市分布得更开', () => {
  const full = build('<map id="m"/><circle id="a" city="成都"/><circle id="b" city="昆明"/>');
  const sw = build('<map id="m" region="四川 云南 重庆 贵州"/><circle id="a" city="成都"/><circle id="b" city="昆明"/>');
  const gap = (r) => dist([r.scene.byId.get('a').init.x, r.scene.byId.get('a').init.y], [r.scene.byId.get('b').init.x, r.scene.byId.get('b').init.y]);
  assert.ok(gap(sw) > gap(full) * 2, '西南四省的地图里，成都到昆明应该远远大于全国图');
  const box = build('<map region="100,20,125,42"/><circle city="上海"/>');
  assert.deepEqual(errs(box), []);
});

test('highlight 与 provinces：指定省高亮；写错省名只警告并给建议', () => {
  const r = build('<map id="m" highlight="四川 云南"/>');
  const m = r.scene.byId.get('m');
  assert.deepEqual(m.provinces.filter((p) => p.hi).map((p) => p.short).sort(), ['云南', '四川']);
  const typo = compile(wrap('<map highlight="四州"/>'));
  const w = typo.diagnostics.find((d) => d.code === 'W_BAD_VALUE');
  assert.ok(w && w.hint.includes('四川'));
  const only = build('<map id="m" provinces="四川"/>');
  assert.equal(only.scene.byId.get('m').provinces.length, 1);
});

// =============== 线条可自定义 ===============

test('线条自定义：省界、外轮廓、南海诸岛各自的颜色 / 粗细 / 虚实 / none', () => {
  const r = build('<map id="m" border="#ff0000" borderWidth="3" coast="#00ff00" coastWidth="5" island="#0000ff" islandWidth="4" dash="6 3"/>');
  const st = r.scene.byId.get('m').style;
  assert.deepEqual(st.border.slice(0, 3), [255, 0, 0]);
  assert.equal(st.borderWidth, 3);
  assert.deepEqual(st.coast.slice(0, 3), [0, 255, 0]);
  assert.equal(st.coastWidth, 5);
  assert.deepEqual(st.island.slice(0, 3), [0, 0, 255]);
  assert.equal(st.islandWidth, 4);
  assert.deepEqual(st.dash, [6, 3]);
  const none = build('<map id="m" border="none" island="none"/>');
  assert.equal(none.scene.byId.get('m').style.border, null);
  assert.equal(none.scene.byId.get('m').style.island, null);
  const dflt = build('<map id="m"/>');
  assert.equal(dflt.scene.byId.get('m').style.island, dflt.scene.byId.get('m').style.coast, '南海诸岛默认跟外轮廓同色');
});

test('线条自定义：样式真的被用于绘制（描边颜色、线宽、虚线都出现在绘制调用里）', async () => {
  const { draw } = await import('../src/render/canvas2d.js');
  const r = build('<map id="m" border="#ff0000" borderWidth="3" coast="#00ff00" coastWidth="5" dash="6 3"/>');
  const strokes = [], dashes = [];
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'stroke') return () => strokes.push({ color: t.strokeStyle, width: t.lineWidth });
      if (p === 'setLineDash') return (d) => dashes.push(d.slice());
      return typeof t[p] === 'function' ? t[p] : (t[p] ??= () => {});
    },
    set(t, p, v) { t[p] = v; return true; },
  });
  draw(ctx, r.scene, evaluate(r.scene, 0), { pixelRatio: 1 });
  assert.ok(strokes.some((s) => /255,0,0/.test(s.color) && s.width === 3), '省界用红色 3px');
  assert.ok(strokes.some((s) => /0,255,0/.test(s.color) && s.width === 5), '外轮廓用绿色 5px');
  assert.ok(dashes.some((d) => d.length === 2 && d[0] === 18), '省界是虚线（6 × 线宽 3）');
});

test('外轮廓只在国土外缘；省界只在省与省之间（公共边不会画成外轮廓）', async () => {
  const r = build('<map id="m"/>');
  const m = r.scene.byId.get('m');
  // 同一条公共边在相邻两省各出现一次；外边只出现一次
  const key = (a, b) => { const p = `${Math.round(a[0] * 4)},${Math.round(a[1] * 4)}`, q = `${Math.round(b[0] * 4)},${Math.round(b[1] * 4)}`; return p < q ? `${p}|${q}` : `${q}|${p}`; };
  const count = new Map();
  for (const p of m.provinces) for (const ring of p.rings) for (let i = 0; i < ring.length - 1; i++) { const k = key(ring[i], ring[i + 1]); count.set(k, (count.get(k) || 0) + 1); }
  const inner = [...count.values()].filter((c) => c >= 2).length, outer = [...count.values()].filter((c) => c === 1).length;
  assert.ok(inner > 500, `应有大量公共边（省界）：${inner}`);
  assert.ok(outer > 500, `应有大量外边（国界与海岸线）：${outer}`);
});

// =============== 南海小图 ===============

test('南海诸岛小图：不压住任何省的轮廓，且在地图框内', () => {
  for (const size of ['width="960" height="720"', 'width="640" height="640"', 'width="1280" height="640"']) {
    const r = compile(`<scene ${size} grid="12x9" pad="16 16 60 16" palette="graphite"><map id="m"/></scene>`);
    const m = r.scene.byId.get('m');
    assert.ok(m.insetBox, size);
    const b = m.insetBox;
    assert.ok(!b.overlaps, `${size}：没找到不压住国土的位置`);
    for (const p of m.provinces) for (const ring of p.rings) for (const [x, y] of ring) {
      assert.ok(!(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h), `${size}：小图压住了 ${p.name}`);
    }
    for (const ring of m.islands) for (const [x, y] of ring) assert.ok(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h, '岛屿画出了小图框');
  }
  const off = build('<map id="m" inset="off"/>');
  assert.equal(off.scene.byId.get('m').insetBox, undefined);
  const none = build('<map id="m" inset="none"/>');
  assert.equal(none.scene.byId.get('m').islands.length, 0);
});

test('主图不含远海岛礁：国土最南端是海南岛，不是南沙', () => {
  const r = build('<map id="m"/>');
  const m = r.scene.byId.get('m');
  const hainan = m.provinces.find((p) => p.short === '海南');
  const sanya = findCity('三亚');
  const [, sy] = r.scene.geo.project(sanya.lon, sanya.lat);
  let maxY = -Infinity;
  for (const ring of hainan.rings) for (const [, y] of ring) maxY = Math.max(maxY, y);
  assert.ok(maxY < sy + 40, `海南省的环不应远远低于三亚：maxY=${maxY} 三亚=${sy}`);
});

// =============== 路线：弧线、朝向 ===============

test('arc：每段向前进方向左侧凸出；0 不变；负数向右', () => {
  const pts = [[0, 0], [100, 0]];
  const left = bulgePoints(pts, 0.2);
  assert.equal(left.length, 3);
  near(left[1][0], 50, 1e-9);
  assert.ok(left[1][1] < 0, '向右行进时，左手边是屏幕上方（y 更小）');
  near(left[1][1], -20, 1e-9);
  assert.ok(bulgePoints(pts, -0.2)[1][1] > 0);
  assert.equal(bulgePoints(pts, 0), pts);
});

test('arc：弧线路径比直线更长，仍然经过起点与终点', () => {
  const pts = [[0, 0], [400, 0], [400, 300]];
  const straight = buildPath(pts, false), curved = buildPath(bulgePoints(pts, 0.2), true);
  assert.ok(curved.length > straight.length);
  assert.ok(dist(curved.at(0), pts[0]) < 1e-6 && dist(curved.at(1), pts[2]) < 1e-6);
});

test('heading：朝向取路径切线；直线向右 = 0°，向下 = 90°，向左走时走最短弧', () => {
  const right = buildPath([[0, 0], [200, 0]]), down = buildPath([[0, 0], [0, 200]]), left = buildPath([[200, 0], [0, 0]]);
  near(headingAt(right, 0.5), 0, 1e-9);
  near(headingAt(down, 0.5), Math.PI / 2, 1e-9);
  near(Math.abs(headingAt(left, 0.5)), Math.PI, 1e-9);
  assert.equal(headingAt(buildPath([[5, 5], [5, 5]]), 0.5), null, '没有位移时没有朝向');
  // 179° → -179° 应该只转 2° 而不是 358°
  near(shortestAngle((179 * Math.PI) / 180, (-179 * Math.PI) / 180) - (179 * Math.PI) / 180, (2 * Math.PI) / 180, 1e-9);
});

test('heading：小车沿弧线行驶时，车头始终和位移方向一致（数值验证）', () => {
  const r = build('<map/><icon id="car" name="car" city="北京" size="30"/><step say="走" dur="3"><car path="西安 成都 昆明" heading="0" arc=".18" ease="linear"/></step>');
  assert.deepEqual(errs(r), []);
  const sc = r.scene, idx = sc.byId.get('car').index;
  const s = sc.steps[0];
  let worst = 0;
  for (let k = 1; k < 59; k++) {
    const t = s.t0 + ((s.t1 - s.t0) * k) / 60, dt = (s.t1 - s.t0) / 600;
    const a = evaluate(sc, t - dt).entities[idx], b = evaluate(sc, t + dt).entities[idx];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
    const move = Math.atan2(b.y - a.y, b.x - a.x);
    const rot = evaluate(sc, t).entities[idx].rot;
    let d = Math.abs(((rot - move + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
    d = Math.abs(d);
    worst = Math.max(worst, d);
  }
  assert.ok(worst < 0.2, `车头与位移方向最大偏差 ${(worst * 180 / Math.PI).toFixed(1)}°`);
});

test('heading：base 角度生效——rot = 实际位移方向 − 图形默认朝向（与投影细节无关的不变量）', () => {
  // 三种默认朝向：朝上(-90)、朝右(0)、朝下(90)；同一段位移，rot 都应该是 位移方向 - base
  for (const base of [-90, 0, 90, 180]) {
    const r = build(`<map/><triangle id="t" city="成都" size="20"/><step say="走" dur="1"><t lonlat="116,30.659" heading="${base}" ease="linear"/></step>`);
    const sc = r.scene, i = sc.byId.get('t').index, s = sc.steps[0];
    const a = evaluate(sc, s.t0).entities[i], b = evaluate(sc, s.freeze).entities[i];
    const move = Math.atan2(b.y - a.y, b.x - a.x);
    const want = move - (base * Math.PI) / 180;
    let d = ((b.rot - want + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    assert.ok(Math.abs(d) < 0.02, `heading=${base}：rot=${b.rot}，应为 ${want}`);
  }
  // 默认朝上的图形向右走，必须顺时针转约 90°（方向别反了）
  const up = build('<map/><triangle id="t" city="成都" size="20"/><step say="走" dur="1"><t lonlat="116,30.659" heading="-90" ease="linear"/></step>');
  const rot = evaluate(up.scene, up.scene.steps[0].freeze).entities[up.scene.byId.get('t').index].rot;
  assert.ok(rot > 1.3 && rot < 1.75, `朝上的图形向右走应转约 +90°，实际 ${rot}`);
});

test('heading / arc：普通格子场景里也能用，且不写它们时行为与以前完全一致', () => {
  const plain = build('<circle id="a" at="2,2"/><step say="x"><a at="6,4"/></step>', 'grid="8x6"');
  const arc = build('<circle id="a" at="2,2"/><step say="x"><a at="6,4" arc=".2"/></step>', 'grid="8x6"');
  const end = (r) => evaluate(r.scene, r.scene.steps[0].freeze).entities[0];
  near(end(plain).x, end(arc).x, 1e-6);
  const midT = (r) => r.scene.steps[0].t0 + 0.35;
  const dx = evaluate(plain.scene, midT(plain)).entities[0], ax = evaluate(arc.scene, midT(arc)).entities[0];
  assert.ok(dist([dx.x, dx.y], [ax.x, ax.y]) > 5, 'arc 让中途位置偏离直线');
  const rot = build('<triangle id="t" at="2,2"/><step say="x"><t at="6,2" heading="-90"/></step>', 'grid="8x6"');
  assert.deepEqual(errs(rot), []);
});

// =============== 图标 ===============

test('icon name：5 种交通工具图标可用；未知名字给建议；不写 name 仍是 emoji 文字', () => {
  for (const nm of ['car', 'bus', 'train', 'plane', 'ship']) {
    const r = build(`<icon id="i" name="${nm}" at="3,3" size="40"/><step say="x"><i pulse/></step>`, 'grid="8x6"');
    assert.deepEqual(errs(r), [], nm);
    const it = irOf(r).items.find((x) => x.kind === 'glyph');
    assert.ok(it && it.glyph === nm, nm);
  }
  const typo = compile(wrap('<icon name="cra" at="3,3"/>'));
  const d = typo.diagnostics.find((x) => x.code === 'E_BAD_VALUE');
  assert.ok(d && d.hint.includes('car'));
  const emoji = build('<icon id="i" at="3,3" text="🎯"/><step say="x"><i pulse/></step>', 'grid="8x6"');
  assert.equal(irOf(emoji).items.some((x) => x.kind === 'glyph'), false);
});

test('icon 图标：无头画布下整帧可绘制，不抛异常', async () => {
  const { draw } = await import('../src/render/canvas2d.js');
  const r = build('<map/><icon id="c" name="plane" city="北京" size="36" fill="warn" stroke="bg" width="4"/><step say="x"><c pulse/></step>');
  const ctx = new Proxy({}, { get(t, p) { if (p === 'measureText') return () => ({ width: 10 }); if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} }); return typeof t[p] === 'function' ? t[p] : (t[p] ??= () => {}); }, set(t, p, v) { t[p] = v; return true; } });
  assert.doesNotThrow(() => draw(ctx, r.scene, evaluate(r.scene, r.scene.steps[0].freeze), { pixelRatio: 1 }));
});

// =============== 兼容性与文档 ===============

test('保留字：map 现在是内置标签，用它当图层名会给出明确的冲突错误', () => {
  const r = compile(wrap('<layer name="map"/>'));
  assert.ok(r.diagnostics.some((d) => d.code === 'E_DUP_ID'));
});

test('schema：map、city、lonlat、arc、heading 都有文档；地图线条各属性都有说明', () => {
  const s = schema();
  assert.ok(s.entities.map.doc.includes('city'));
  for (const k of ['projection', 'region', 'highlight', 'border', 'borderWidth', 'coast', 'coastWidth', 'island', 'islandWidth', 'dash', 'inset']) assert.ok(s.entities.map.attrs[k], `map 缺少 ${k} 的文档`);
  for (const k of ['city', 'lonlat']) assert.ok(s.entities.circle.attrs[k], `circle 缺少 ${k}`);
  assert.ok(s.modify.attrs.path && s.entities.icon.attrs.name);
});

test('lint：地图场景里的圆点、文字、小车不会被误报成“超框 / 重叠 / 文字压边”', () => {
  const r = build(`<map id="m"/>
    <circle id="a" city="北京" size="14" label="1"/><text id="ta" city="北京" off="30,-6" text="北京" size="17"/>
    <icon id="c" name="car" city="成都" size="30"/><step say="x"><c pulse/></step>`, 'overlap="off"');
  const bad = lint(r.scene).filter((d) => ['W_OVERFLOW', 'W_TEXT_OVERFLOW', 'W_TEXT_TIGHT', 'W_LINE_COVERED'].includes(d.code));
  assert.deepEqual(bad.map((d) => `${d.code}:${d.message}`), []);
});

test('确定性：同一份地图脚本编译两次，每一帧结果完全一致', () => {
  const src = wrap('<map/><icon id="c" name="car" city="北京" size="30"/><step say="x" dur="2"><c path="西安 成都" heading="0" arc=".16" trail="warn"/></step>');
  const a = compile(src).scene, b = compile(src).scene;
  for (const t of [0, 0.7, 1.9, 3.3]) assert.equal(JSON.stringify(evaluate(a, t).entities.map((e) => [e.x, e.y, e.rot, e.draw])), JSON.stringify(evaluate(b, t).entities.map((e) => [e.x, e.y, e.rot, e.draw])));
});

test('尾迹：地图上沿 arc 路线的尾迹笔尖始终在小车位置上', () => {
  const r = build('<map/><icon id="c" name="car" city="北京" size="30"/><step say="x" dur="3"><c path="西安 成都 昆明" heading="0" arc=".16" trail="warn" ease="soft"/></step>');
  const sc = r.scene, trace = sc.entities.find((e) => e.type === 'trace'), seg = sc.segments.find((s) => s.ent === trace.index);
  for (let k = 1; k < 40; k++) {
    const f = evaluate(sc, seg.t0 + (seg.dur * k) / 40);
    const draw = f.entities[trace.index].draw;
    if (draw >= 1) continue;
    const head = tracePoints(trace.pts, draw).at(-1), car = f.entities[trace.owner];
    assert.ok(dist(head, [car.x, car.y]) < 1.5, `进度 ${k}/40 笔尖偏离小车`);
  }
});

test('poster：封面帧属性——正数第几步、负数倒数、不写为 0；旅行示例都取最后一步', () => {
  assert.equal(build('<circle at="1,1"/>', 'grid="3x3"').scene.poster, 0);
  assert.equal(build('<circle at="1,1"/>', 'grid="3x3" poster="3"').scene.poster, 3);
  assert.equal(build('<circle at="1,1"/>', 'grid="3x3" poster="-1"').scene.poster, -1);
  const bad = compile(wrap('<circle at="1,1"/>', 'poster="abc"'));
  assert.ok(bad.diagnostics.some((d) => d.code === 'E_BAD_VALUE'));
});
