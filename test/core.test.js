import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate, lint, describe, parseXML, resolveEase, parseColor, evalExpr } from '../src/core/index.js';
import { Scope } from '../src/core/lang/expr.js';
import { loadExample } from './helpers.js';

// 800x600 的 3x3 场景：格子 266.67 x 200，圆心 (列-.5)*cw, (行-.5)*ch
const wrap = (body, head = '') => `<scene width="800" height="600" grid="3x3" ${head}>${body}</scene>`;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`);
const CW = 800 / 3, CH = 200;
const codes = (r) => r.diagnostics.map((d) => d.code);
const live = (r, t, id) => evaluate(r.scene, t).entities[r.scene.byId.get(id).index];
const calc = (src, vars = {}) => {
  const sc = new Scope();
  for (const [k, v] of Object.entries(vars)) sc.declare(k, v);
  return evalExpr(src, sc, { rng: Math.random });
};

// ---------------- 解析 ----------------
test('解析器：错误带行列号', () => {
  const r = parseXML('<scene>\n  <circle id="a">\n</scene>');
  assert.equal(r.root, null);
  assert.equal(r.diagnostics[0].line, 3);
  assert.match(r.diagnostics[0].message, /期望 <\/circle>/);
});

test('解析器：缺省属性、中文标签与属性', () => {
  const r = parseXML('<scene><黑 at="1,1" pulse labels/></scene>');
  assert.equal(r.root.children[0].tag, '黑');
  assert.equal(r.root.children[0].attrs.pulse, '');
  assert.equal(r.root.children[0].attrs.labels, '');
});

test('解析器：缺引号、未闭合、多根', () => {
  assert.match(parseXML('<scene a=1/>').diagnostics[0].message, /引号/);
  assert.match(parseXML('<scene><circle').diagnostics[0].message, /没有闭合/);
  assert.match(parseXML('<scene/><scene/>').diagnostics[0].message, /只能有一个根节点/);
});

// ---------------- 表达式 ----------------
test('表达式：运算符优先级与结合性', () => {
  assert.equal(calc('1 + 2 * 3'), 7);
  assert.equal(calc('(1 + 2) * 3'), 9);
  assert.equal(calc('2 ** 3 ** 2'), 512);
  assert.equal(calc('-2 ** 2'), -4);
  assert.equal(calc('10 % 4 + 7 / 2'), 5.5);
  assert.equal(calc('1 < 2 && 2 < 3'), true);
  assert.equal(calc('not (1 == 1) or 2 != 3'), true);
  assert.equal(calc('3 > 2 ? "a" : "b"'), 'a');
});

test('表达式：变量、数组、字符串、函数', () => {
  assert.equal(calc('xs[1] + xs.length', { xs: [10, 20, 30] }), 23);
  assert.equal(calc("'第' + (k + 1) + '步'", { k: 2 }), '第3步');
  assert.deepEqual(calc('range(1, 4)'), [1, 2, 3, 4]);
  assert.deepEqual(calc('split("a b  c")'), ['a', 'b', 'c']);
  assert.equal(calc('max(1, 5, 3) + floor(2.7)'), 7);
  assert.equal(calc('col("H")'), 8);
  assert.equal(calc('letter(3)'), 'C');
  assert.match(calc('hsl(120, 80, 60)'), /^hsl\(120,80%,60%\)$/);
});

test('表达式：安全——不能访问全局对象与原型', () => {
  assert.throws(() => calc('constructor'), /未定义的变量/);
  assert.throws(() => calc('process.exit()'), /未定义的变量|只能调用/);
  assert.throws(() => calc('xs.constructor', { xs: [] }), /不支持/);
  assert.throws(() => calc('toString()'), /未知函数/);
  assert.throws(() => calc('x = 1', { x: 0 }), /==/);
  assert.throws(() => calc('xs[5]', { xs: [1] }), /越界/);
});

// ---------------- 编程语法 ----------------
test('let / {} 插值：数字自动类型，字符串拼接', () => {
  const r = compile(wrap('<let n="2" name="a"/><circle id="{name}{n+1}" at="{n},1"/>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.ok(r.scene.byId.has('a3'));
  near(r.scene.byId.get('a3').init.x, 1.5 * CW);
});

test('for：区间 / 列表 / 数组 / 数字 / index / 倒序', () => {
  const ids = (body) => compile(wrap(body)).scene.entities.map((e) => e.id).join(',');
  assert.equal(ids('<for var="i" in="1..3"><circle id="c{i}"/></for>'), 'c1,c2,c3');
  assert.equal(ids('<for var="i" in="3..1"><circle id="c{i}"/></for>'), 'c3,c2,c1');
  assert.equal(ids('<for var="s" in="a b"><circle id="{s}"/></for>'), 'a,b');
  assert.equal(ids('<let L="{[7,8]}"/><for var="v" index="k" in="{L}"><circle id="x{k}_{v}"/></for>'), 'x0_7,x1_8');
  assert.equal(ids('<for var="i" in="2"><circle id="c{i}"/></for>'), 'c1,c2');
  assert.equal(ids('<for var="i" in="0..1" step="0.5"><circle id="c{i}"/></for>'), 'c0,c0.5,c1');
});

test('for：循环内 set 能累积外层变量', () => {
  const r = compile(wrap('<let sum="0"/><for var="i" in="1..4"><set sum="{sum+i}"/></for><circle id="s{sum}"/>'));
  assert.ok(r.scene.byId.has('s10'));
});

test('if / elseif / else', () => {
  const pick = (v) => compile(wrap(`<let v="${v}"/><if test="v == 1"><circle id="one"/></if><elseif test="v == 2"><circle id="two"/></elseif><else><circle id="many"/></else>`)).scene.entities[0].id;
  assert.equal(pick(1), 'one');
  assert.equal(pick(2), 'two');
  assert.equal(pick(9), 'many');
  assert.ok(codes(compile(wrap('<else><circle/></else>'))).includes('E_ELSE_ORPHAN'));
});

test('def 简写：is + 默认属性，使用处覆盖', () => {
  const r = compile(wrap('<def name="黑" is="circle" size="50" fill="red"/><黑 id="a" at="2,2"/><黑 id="b" size="70"/>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const a = r.scene.byId.get('a'), b = r.scene.byId.get('b');
  assert.equal(a.type, 'circle');
  assert.equal(a.init.size, 50);
  assert.equal(b.init.size, 70);
  assert.deepEqual(a.init.fill.slice(0, 3), [255, 69, 58]);
});

test('def 模板：参数、默认值、id 透传', () => {
  const r = compile(wrap(
    '<def name="旗" color="red"><rect id="{id}_p" w="4" h="60" fill="{color}"/><circle id="{id}_f" size="20" fill="{color}"/></def>' +
    '<旗 id="a" color="blue"/><旗 id="b"/>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.scene.entities.map((e) => e.id), ['a_p', 'a_f', 'b_p', 'b_f']);
  assert.deepEqual(r.scene.byId.get('a_p').init.fill.slice(0, 3), [10, 132, 255]);
  assert.deepEqual(r.scene.byId.get('b_p').init.fill.slice(0, 3), [255, 69, 58]);
});

test('展开：死循环与超大范围会被截断而不是卡死', () => {
  assert.ok(codes(compile(wrap('<def name="x"><x/></def><x/>'))).includes('E_TOO_BIG'));
  assert.ok(codes(compile(wrap('<for var="i" in="1..9999999"><circle/></for>'))).includes('E_TOO_BIG'));
});

test('rand：同一个 seed 结果一致', () => {
  const x = (seed) => compile(wrap(`<let r="{rand()}"/><circle id="a" size="{10 + r*10}"/>`, `seed="${seed}"`)).scene.byId.get('a').init.size;
  assert.equal(x(5), x(5));
  assert.notEqual(x(5), x(6));
});

test('表达式错误：定位到属性并跳过', () => {
  const r = compile(wrap('<circle id="a" size="{oops + 1}"/>'));
  const d = r.diagnostics.find((x) => x.code === 'E_EXPR');
  assert.ok(d && d.line === 1 && /未定义的变量/.test(d.message));
});

// ---------------- 步骤语义 ----------------
test('坐标：at 落在格子中心，H8 写法等价于 8,8', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><circle id="b" at="3,3"/>'));
  near(r.scene.byId.get('a').init.x, CW * 0.5);
  near(r.scene.byId.get('b').init.y, 500);
  const g = compile('<scene width="600" height="600" grid="15x15"><circle id="a" at="H8"/></scene>');
  near(g.scene.byId.get('a').init.x, 7.5 * 40);
  near(g.scene.byId.get('a').init.y, 7.5 * 40);
});

test('pad：格子区域留白，坐标随之偏移', () => {
  const r = compile('<scene width="800" height="600" grid="2x2" pad="100 0 0 0"><circle id="a" at="1,1" size="10"/></scene>');
  near(r.scene.byId.get('a').init.y, 100 + 125);
  near(r.scene.ch, 250);
});

test('步骤：步内并行、步间顺序，写什么变什么', () => {
  const r = compile(wrap('<circle id="a" at="1,1" fill="red"/><step dur="1" hold="0.5"><a at="3,3" fill="blue" size="100"/></step><step dur="2"><a at="1,1"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const [s1, s2] = r.scene.steps;
  near(s1.t0, 0); near(s1.t1, 1); near(s2.t0, 1.5); near(s2.t1, 3.5);
  const mid = live(r, 0.5, 'a'), end = live(r, 1, 'a');
  near(mid.x, (0.5 * CW + 2.5 * CW) / 2);
  near(end.x, 2.5 * CW); near(end.size, 100);
  assert.deepEqual(end.fill.slice(0, 3), [10, 132, 255]);
  near(live(r, 3.5, 'a').x, 0.5 * CW);
});

test('步骤：stagger 与 delay 叠加', () => {
  const r = compile(wrap('<circle id="a"/><circle id="b"/><circle id="c"/><step dur="1" stagger="0.2"><a at="1,1"/><b at="1,2"/><c at="1,3" delay="0.1"/></step>'));
  const starts = r.scene.segments.map((s) => +s.t0.toFixed(2));
  assert.deepEqual(starts, [0, 0.2, 0.5]);
});

test('步骤：新类型在步骤里登场，id 当标签修改已有对象', () => {
  const r = compile(wrap('<step dur="1"><circle id="a" at="2,2"/></step><step dur="1"><a at="3,3"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.equal(live(r, 0.5, 'a').hidden, false);
  assert.equal(r.scene.byId.get('a').birth, 0);
  const r2 = compile(wrap('<circle id="a"/><step><circle id="b"/></step>'));
  assert.equal(live(r2, 0.2, 'b').hidden, false);
  assert.ok(r2.scene.byId.get('b').birth >= 0);
});

test('登场：步骤之前不可见，pop 结束后尺寸与透明度完整', () => {
  const r = compile(wrap('<step dur="1"/><step><circle id="b" at="2,2"/></step>'));
  const t0 = r.scene.byId.get('b').birth;
  assert.ok(t0 > 0);
  assert.equal(live(r, t0 - 0.01, 'b').hidden, true);
  const L = live(r, t0 + 0.45, 'b');
  near(L.sx, 1, 1e-3); near(L.ma, 1, 1e-3);
  assert.ok(live(r, t0 + 0.05, 'b').sx < 1);
});

test('退场：out 之后消失，再次修改会报错', () => {
  const r = compile(wrap('<circle id="a"/><step><a out/></step><step><a at="3,3"/></step>'));
  assert.ok(codes(r).includes('E_GONE'));
  const r2 = compile(wrap('<circle id="a"/><step><a out/></step>'));
  assert.equal(live(r2, 0.1, 'a').hidden, false);
  assert.equal(live(r2, 5, 'a').hidden, true);
});

test('效果：pulse/shake/jump 叠加型，结束后完全回到原位', () => {
  const r = compile(wrap('<rect id="a" at="2,2"/><step><a pulse="0.4" shake jump/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const f = live(r, r.scene.steps[0].t1 + 0.1, 'a');
  near(f.sx, 1); near(f.sy, 1); near(f.ox, 0); near(f.oy, 0);
  assert.ok(Math.abs(live(r, 0.2, 'a').sy - 1) > 1e-3);
});

test('walk：圆滚动，方块不滚动', () => {
  const r = compile(wrap('<circle id="c" at="1,2" size="80"/><rect id="r" at="1,3"/><step><c at="3,2" walk/><r at="3,3" walk/></step>'));
  const end = r.scene.duration;
  near(live(r, end, 'c').rot, (2 * CW) / 40, 1e-9);
  near(live(r, end, 'r').rot, 0);
});

test('jump + at：跳向目标（抛物线）', () => {
  const r = compile(wrap('<circle id="a" at="1,2"/><step><a at="3,2" jump="1c" dur="1"/></step>'));
  const mid = live(r, 0.5, 'a');
  assert.ok(mid.oy < -50);
  near(live(r, 1.2, 'a').x, 2.5 * CW);
});

test('spin：相对旋转；rot：绝对旋转', () => {
  const r = compile(wrap('<rect id="a"/><step><a spin="180" dur="1"/></step><step><a spin="180" dur="1"/></step>'));
  near(live(r, r.scene.duration, 'a').rot, 2 * Math.PI);
  const r2 = compile(wrap('<rect id="a"/><step><a rot="90" dur="1"/></step>'));
  near(live(r2, r2.scene.duration, 'a').rot, Math.PI / 2);
});

test('path：沿折线匀速移动，smooth 经过各点', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><step><a path="3,1 3,3" dur="1" ease="linear"/></step>'));
  // 折线总长 = 水平 2 格 + 垂直 2 格；走到一半时距离 = total/2，仍在第一段（水平）上
  const total = 2 * CW + 400;
  near(live(r, 0.5, 'a').x, 0.5 * CW + total / 2, 1e-6);
  near(live(r, 0.5, 'a').y, 100, 1e-6);
  const r2 = compile(wrap('<circle id="a" at="1,1"/><step><a path="2,1 3,3" smooth dur="1"/></step>'));
  near(live(r2, r2.scene.duration, 'a').x, 2.5 * CW);
  near(live(r2, r2.scene.duration, 'a').y, 500);
});

test('by：相对格数；size 对矩形同时改 w/h；颜色 none 能参与补间', () => {
  const r = compile(wrap('<rect id="a" at="1,1" size="40" fill="none"/><step dur="1"><a by="1,2" size="80" fill="red"/></step>'));
  const f = live(r, r.scene.duration, 'a');
  near(f.x, 1.5 * CW); near(f.y, 100 + 2 * CH);
  near(f.w, 80); near(f.h, 80);
  assert.deepEqual(f.fill.slice(0, 3), [255, 69, 58]);
  assert.ok(live(r, 0.5, 'a').fill[3] > 0.3);
});

test('单位 c：1c = 格子短边', () => {
  const r = compile(wrap('<circle id="a" size="0.5c"/>'));
  near(r.scene.byId.get('a').init.size, 100);
});

test('属性单独缓动：fill.ease 与 ease', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><step dur="1"><a at="3,3" ease="linear" fill="blue" fill.ease="spring"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
});

test('change：多 id 与前缀通配，批量修改', () => {
  const r = compile(wrap('<circle id="c1"/><circle id="c2"/><circle id="d1"/><step dur="1" stagger="0.1"><change id="c*" at="3,3"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  near(live(r, r.scene.duration, 'c1').x, 2.5 * CW);
  near(live(r, r.scene.duration, 'c2').x, 2.5 * CW);
  assert.notEqual(live(r, r.scene.duration, 'd1').x, 2.5 * CW);
  const starts = r.scene.segments.map((s) => +s.t0.toFixed(2));
  assert.deepEqual(starts, [0, 0.1]);
});

// ---------------- 自定义关键帧 ----------------
test('anim：相对叠加、可循环与 yoyo、首尾回到原样', () => {
  const src = (extra) => wrap(`<anim name="摇" dur="1"><k at="50%" rot="30" dx="1"/></anim><rect id="a" at="2,2"/><step><a do="摇" ${extra}/></step>`);
  const r = compile(src(''));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const mid = live(r, 0.5, 'a');
  near(mid.orot, (30 * Math.PI) / 180, 1e-6);
  near(mid.ox, CW, 1e-6);
  const end = live(r, 1.2, 'a');
  near(end.orot, 0); near(end.ox, 0);
  const r2 = compile(src('loop="2" yoyo'));
  near(r2.scene.steps[0].t1, 2);
  near(live(r2, 1.5, 'a').orot, (30 * Math.PI) / 180, 1e-6);
});

// ---------------- 图层 / 字幕 / 冻结帧 ----------------
test('图层：对象继承图层，图层 alpha 可在步骤里改', () => {
  const r = compile(wrap('<layer name="bg" z="0"><circle id="a"/></layer><layer name="fg" z="9"/><circle id="b" layer="fg"/><step><bg alpha="0.3" dur="1"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.equal(r.scene.byId.get('a').layer, r.scene.byId.get('bg').index);
  assert.equal(r.scene.byId.get('b').layer, r.scene.byId.get('fg').index);
  near(live(r, r.scene.duration, 'bg').alpha, 0.3);
  assert.ok(codes(compile(wrap('<circle layer="nope"/>'))).includes('E_UNKNOWN_LAYER'));
});

test('字幕：随步骤切换，前一条淡出', () => {
  const r = compile(wrap('<circle id="a"/><step say="第一步" dur="1"><a at="2,2"/></step><step say="第二步" dur="1"><a at="3,3"/></step>'));
  const [s1, s2] = r.scene.steps;
  const f1 = evaluate(r.scene, s1.freeze);
  assert.equal(f1.captions.length, 1);
  assert.equal(f1.captions[0].text, '第一步');
  near(f1.captions[0].k, 1, 1e-6);
  const mid = evaluate(r.scene, s2.t0 + 0.1);
  assert.deepEqual(mid.captions.map((c) => c.text).sort(), ['第一步', '第二步']);
  assert.equal(f1.step, 0);
  assert.equal(evaluate(r.scene, s2.freeze).step, 1);
});

test('冻结帧：每一步 freeze 时刻字幕完整、该步变化已完成', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><step say="走过去" dur="1"><a at="3,3"/></step>'));
  const s = r.scene.steps[0];
  assert.ok(s.freeze >= s.t1 - 1e-9 && s.freeze < s.t2);
  near(live(r, s.freeze, 'a').x, 2.5 * CW);
  near(evaluate(r.scene, s.freeze).captions[0].k, 1, 1e-6);
});

test('describe：每一步说了什么、动了谁', () => {
  const r = compile(wrap('<circle id="a"/><circle id="b"/><step say="x" dur="1"><a at="3,3"/></step>'));
  const d = describe(r.scene);
  assert.deepEqual(d.steps[0].touches, ['a']);
  assert.equal(d.steps[0].say, 'x');
});

// ---------------- 内置标注 ----------------
test('line/arrow：from/to，draw 登场，可修改端点', () => {
  const r = compile(wrap('<step><line id="l" from="1,1" to="2,1"/></step><step dur="1"><l to="3,1" ease="linear"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const t = r.scene.steps[1].t0;
  near(live(r, t + 0.5, 'l').x2, (1.5 * CW + 2.5 * CW) / 2, 1e-6);
  near(live(r, r.scene.duration, 'l').x2, 2.5 * CW);
  assert.ok(codes(compile(wrap('<line from="1,1"/>'))).includes('E_MISSING_ATTR'));
});

test('ring / note / grid 能创建，note 的 side 会校验', () => {
  const r = compile(wrap('<grid/><ring at="2,2"/><note at="2,2" text="hi" side="left"/>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.ok(codes(compile(wrap('<note text="x" side="up"/>'))).includes('E_BAD_VALUE'));
});

// ---------------- 诊断 ----------------
test('诊断：未知属性、未知对象、缺 who 都带提示', () => {
  const r = compile(wrap('<circle id="ball" sizee="9"/><step><bal at="2,2"/><ball atx="1,1"/></step>'));
  const hint = (c) => r.diagnostics.find((d) => d.code === c)?.hint;
  assert.match(hint('W_UNKNOWN_ATTR'), /size/);
  assert.match(hint('E_UNKNOWN_TAG'), /ball/);
  assert.ok(r.scene, '节点级错误仍应产出可预览场景');
});

test('诊断：旧语法 timeline/moveTo 给出明确错误', () => {
  const r = compile(wrap('<circle id="a"/><timeline><moveTo who="a" to="2,2"/></timeline>'));
  assert.ok(codes(r).includes('E_UNKNOWN_TAG'));
});

test('诊断：重复 id 会指出怎么修改已有对象', () => {
  const r = compile(wrap('<circle id="a"/><step><circle id="a"/></step>'));
  const d = r.diagnostics.find((x) => x.code === 'E_DUP_ID');
  assert.match(d.hint, /<a /);
});

test('诊断：并行修改同一属性给出冲突警告，不同属性则没有', () => {
  assert.ok(codes(compile(wrap('<circle id="a"/><step><a at="2,2"/><a at="3,3"/></step>'))).includes('W_CONFLICT'));
  assert.equal(compile(wrap('<circle id="a"/><step><a at="2,2" rot="90" pulse shake/></step>')).diagnostics.length, 0);
});

test('诊断：空修改给出提示；效果用在不支持的对象上给出提示', () => {
  assert.ok(codes(compile(wrap('<circle id="a"/><step><a/></step>'))).includes('W_NOOP'));
  assert.ok(codes(compile(wrap('<line id="l" from="1,1" to="2,2"/><step><l pulse/></step>'))).includes('W_UNKNOWN_ATTR'));
});

test('诊断：旧属性 toPos 不再支持', () => {
  assert.ok(codes(compile(wrap('<circle id="a"/><step><a toPos="1,1"/></step>'))).includes('W_UNKNOWN_ATTR'));
});

test('lint：出界与实心图形重叠', () => {
  const out = compile(wrap('<circle id="a" at="1,1"/><step><a px="2000,100"/></step>'));
  assert.ok(lint(out.scene).some((d) => d.code === 'W_OFFSCREEN'));
  const ov = compile(wrap('<circle id="a" at="2,2"/><circle id="b" at="2,2"/><step><a pulse/></step>'));
  assert.ok(lint(ov.scene).some((d) => d.code === 'W_OVERLAP'));
});

// ---------------- 基础工具 ----------------
test('求值是确定性的：与调用顺序无关', () => {
  const { scene } = compile(loadExample('effects/orbits.xml'));
  const first = new Map();
  for (const t of [0.3, 2.1, 0.3, 5, 1.2, 2.1]) {
    const s = JSON.stringify(evaluate(scene, t));
    if (first.has(t)) assert.equal(s, first.get(t));
    else first.set(t, s);
  }
});

test('缓动与颜色', () => {
  for (const n of ['linear', 'in', 'out', 'inOut', 'soft', 'snap', 'back', 'spring', 'bounce', 'elastic']) {
    const f = resolveEase(n);
    near(f(0), 0, 1e-9);
    near(f(1), 1, 1e-9);
  }
  assert.ok(resolveEase('cubic(0.25,0.1,0.25,1)')(0.5) > 0.5);
  assert.equal(resolveEase('cubic(2,0,0,1)'), null);
  assert.deepEqual(parseColor('#f00'), [255, 0, 0, 1]);
  assert.deepEqual(parseColor('none'), [0, 0, 0, 0]);
  assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), [255, 0, 0, 1]);
});

// 示例的零诊断 / 语义校验见 test/examples.test.js
