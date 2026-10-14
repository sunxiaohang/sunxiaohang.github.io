import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate, lint, describe } from '../src/core/index.js';
import { near } from './helpers.js';

/** 本轮新增的语言特性：group / ellipse / flat / trail / read / 区间表达式 / ease() 函数 / overlap 开关 */

const wrap = (body, head = '') => `<scene width="800" height="600" grid="3x3" ${head}>${body}</scene>`;
const codes = (r) => r.diagnostics.map((d) => d.code);
const live = (r, t, id) => evaluate(r.scene, t).entities[r.scene.byId.get(id).index];
const CW = 800 / 3;

// ---------------- group ----------------
test('group：<group> 包住的对象自动成员；步骤里写组名 = 批量修改', () => {
  const r = compile(wrap('<group name="红"><circle id="a" at="1,1"/><circle id="b" at="1,2"/></group><circle id="c"/><step dur="1"><红 at="3,3"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.scene.groups.get('红').members.length, 2);
  near(live(r, r.scene.duration, 'a').x, 2.5 * CW);
  near(live(r, r.scene.duration, 'b').x, 2.5 * CW);
  assert.notEqual(live(r, r.scene.duration, 'c').x, 2.5 * CW, '组外对象不受影响');
});

test('group：group 属性即声明，可多组；组可嵌套', () => {
  const r = compile(wrap('<circle id="a" group="x y"/><group name="outer"><group name="inner"><circle id="b"/></group></group>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.scene.byId.get('a').groups, ['x', 'y']);
  assert.deepEqual(r.scene.byId.get('b').groups, ['outer', 'inner']);
  assert.equal(r.scene.groups.get('outer').members.length, 1, '嵌套的成员同时属于外层组');
});

test('group：对已退场成员的批量修改静默跳过，直接点名才报错', () => {
  const batch = compile(wrap('<group name="g"><circle id="a"/><circle id="b"/></group><step><a out/></step><step><g pulse/></step>'));
  assert.ok(!codes(batch).includes('E_GONE'));
  const direct = compile(wrap('<circle id="a"/><step><a out/></step><step><a pulse/></step>'));
  assert.ok(codes(direct).includes('E_GONE'));
});

test('group：组名与对象 id 冲突时报错；未知组名给出提示', () => {
  assert.ok(codes(compile(wrap('<circle id="a"/><group name="a"><circle/></group>'))).includes('E_DUP_ID'));
  const r = compile(wrap('<circle id="a"/><step><nope pulse/></step>'));
  assert.ok(codes(r).includes('E_UNKNOWN_TAG'));
});

test('group：lint 不把"同组拼在一起"的图形判为重叠，不同组才算', () => {
  const same = compile(wrap('<group name="g"><circle id="a" at="2,2"/><circle id="b" at="2,2"/></group><step><g pulse/></step>'));
  assert.ok(!lint(same.scene).some((d) => d.code === 'W_OVERLAP'));
  const diff = compile(wrap('<circle id="a" at="2,2"/><circle id="b" at="2,2"/><step><a pulse/></step>'));
  assert.ok(lint(diff.scene).some((d) => d.code === 'W_OVERLAP'));
});

test('group：describe 暴露分组', () => {
  const r = compile(wrap('<group name="g"><circle id="a"/></group><step><g pulse/></step>'));
  const d = describe(r.scene);
  assert.deepEqual(d.groups, { g: ['a'] });
  assert.deepEqual(d.entities[0].groups, ['g']);
});

// ---------------- ellipse / flat / label color ----------------
test('ellipse：w/h 可独立设置与补间；size 同时改两者', () => {
  const r = compile(wrap('<ellipse id="e" at="2,2" w="100" h="40"/><step dur="1"><e h="80"/></step><step dur="1"><e size="60"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const e1 = evaluate(r.scene, r.scene.steps[0].freeze).entities[0];
  near(e1.w, 100); near(e1.h, 80);
  const e2 = evaluate(r.scene, r.scene.duration).entities[0];
  near(e2.w, 60); near(e2.h, 60);
});

test('flat：缺省属性即生效；不影响补间', () => {
  const r = compile(wrap('<rect id="a" flat/><def name="水" is="rect" flat=""/><水 id="b"/>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.equal(r.scene.byId.get('a').flat, true);
  assert.equal(r.scene.byId.get('b').flat, true);
  assert.equal(compile(wrap('<rect id="a"/>')).scene.byId.get('a').flat, false);
});

test('color：图形 label 的文字颜色可设置、可补间', () => {
  const r = compile(wrap('<circle id="a" label="X" color="red"/><step dur="1"><a color="blue"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.scene.byId.get('a').init.color.slice(0, 3), [255, 69, 58]);
  assert.deepEqual(live(r, r.scene.duration, 'a').color.slice(0, 3).map(Math.round), [10, 132, 255]);
});

// ---------------- trail ----------------
test('trail：移动时生成内部尾迹对象，随进度长出来，走完保留；不暴露给脚本与 describe', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><step dur="1"><a path="3,1 3,3" trail="#ffd166" ease="linear"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const trace = r.scene.entities.find((e) => e.type === 'trace');
  assert.ok(trace && trace.internal);
  assert.ok(trace.pts.length > 10);
  near(evaluate(r.scene, 0.5).entities[trace.index].draw, 0.5, 1e-6);
  near(evaluate(r.scene, r.scene.duration).entities[trace.index].draw, 1);
  assert.ok(!describe(r.scene).entities.some((e) => e.id === trace.id));
  assert.ok(codes(compile(wrap('<circle id="a"/><step><a~trail1 pulse/></step>'))).includes('E_SYNTAX'));
});

test('trail：通配 * 不会匹配到内部尾迹对象', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><step dur="1"><a at="3,3" trail/></step><step><change id="a*" pulse/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.equal(r.scene.segments.filter((s) => s.step === 1).length, 1, '只命中 a 本身');
});

// ---------------- read（字幕阅读时长）----------------
test('read：停顿自动延长到读完字幕；显式 hold 优先；短字幕不缩短下限', () => {
  const body = (say, extra = '') => `<circle id="a"/><step say="${say}" dur="0.5" ${extra}><a pulse/></step>`;
  const base = compile(wrap(body('一二三四五六七八九十'), 'read="2" hold="0.6"')).scene.steps[0];
  near(base.t2 - base.t1, 5, 1e-9);
  const explicit = compile(wrap(body('一二三四五六七八九十', 'hold="1"'), 'read="2"')).scene.steps[0];
  near(explicit.t2 - explicit.t1, 1, 1e-9);
  const short = compile(wrap(body('好'), 'read="2" hold="0.6"')).scene.steps[0];
  near(short.t2 - short.t1, 0.6, 1e-9);
  const off = compile(wrap(body('一二三四五六七八九十'), 'hold="0.6"')).scene.steps[0];
  near(off.t2 - off.t1, 0.6, 1e-9);
});

test('read：换行符不计入阅读字数', () => {
  const r = compile(wrap('<circle id="a"/><step say="一二|三四" dur="0.5"><a pulse/></step>', 'read="1" hold="0.1"')).scene.steps[0];
  near(r.t2 - r.t1, 4, 1e-9);
});

// ---------------- 区间表达式 ----------------
test('for 区间：端点可以是变量与算式；倒序；步长；字面量行为不变', () => {
  const ids = (head, loop) => compile(wrap(`${head}<for var="i" in="${loop}"><circle id="c{i}"/></for>`)).scene.entities.map((e) => e.id).join(',');
  assert.equal(ids('<let n="3"/>', '1..n'), 'c1,c2,c3');
  assert.equal(ids('<let n="3"/>', '0..n-1'), 'c0,c1,c2');
  assert.equal(ids('<let a="5" b="2"/>', '1..(a-b)'), 'c1,c2,c3');
  assert.equal(ids('<let n="3"/>', 'n..1'), 'c3,c2,c1');
  assert.equal(ids('<let n="2"/>', '{n+1}..{n+3}'), 'c3,c4,c5');
  assert.equal(ids('', '1..3'), 'c1,c2,c3');
});

test('for 区间：端点不是数字时给出明确错误', () => {
  const r = compile(wrap('<let s="x"/><for var="i" in="1..s"><circle/></for>'));
  assert.ok(codes(r).includes('E_EXPR'));
});

// ---------------- ease() 函数 ----------------
test('ease(name,t)：端点正确，过冲型可超过 1，未知缓动报错', () => {
  const r = compile(wrap('<let a="{ease(\'linear\', 0.25)}" b="{ease(\'back\', 0.8)}"/><circle id="v{round(a*100)}_{b > 1 ? \'over\' : \'under\'}"/>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.equal(r.scene.entities[0].id, 'v25_over');
  assert.ok(codes(compile(wrap('<let a="{ease(\'nope\', 0.5)}"/>'))).includes('E_EXPR'));
});

// ---------------- overlap 开关 ----------------
test('overlap="off"：关闭冻结画面的重叠检查，出界检查保留', () => {
  const body = '<circle id="a" at="2,2"/><circle id="b" at="2,2"/><step><a pulse/></step>';
  assert.ok(lint(compile(wrap(body)).scene).some((d) => d.code === 'W_OVERLAP'));
  assert.ok(!lint(compile(wrap(body, 'overlap="off"')).scene).some((d) => d.code === 'W_OVERLAP'));
  const off = compile(wrap('<circle id="a" at="1,1"/><step><a px="2000,100"/></step>', 'overlap="off"'));
  assert.ok(lint(off.scene).some((d) => d.code === 'W_OFFSCREEN'));
});

// ---------------- lint：出界但已透明不报 ----------------
test('lint：飞出画布但已淡出视为正常退场，不报出界', () => {
  const gone = compile(wrap('<circle id="a" at="2,2"/><step dur="1"><a by="6,0" alpha="0" ease="in"/></step>'));
  assert.ok(!lint(gone.scene).some((d) => d.code === 'W_OFFSCREEN'));
  const stay = compile(wrap('<circle id="a" at="2,2"/><step dur="1"><a by="6,0"/></step>'));
  assert.ok(lint(stay.scene).some((d) => d.code === 'W_OFFSCREEN'));
});

// ---------------- def 模板 ----------------
test('def 模板：嵌套 for / 表达式参数 / group="{id}" 组合，生成的对象都归到该实例的组', () => {
  const r = compile(wrap(
    '<def name="花" cx="1" cy="1"><for var="k" in="0..2"><circle id="{id}_p{k}" at="{cx + k * 0.3},{cy}" size="20" group="{id}"/></for></def>' +
    '<花 id="f1" cx="1" cy="1"/><花 id="f2" cx="2" cy="2"/>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.equal(r.scene.groups.get('f1').members.length, 3);
  assert.equal(r.scene.groups.get('f2').members.length, 3);
});

test('def 模板：参数名拼错给出警告，并提示可用参数', () => {
  const r = compile(wrap('<def name="X" a="1"><circle id="{id}"/></def><X id="x" b="2"/>'));
  const d = r.diagnostics.find((x) => x.code === 'W_UNKNOWN_ATTR');
  assert.ok(d && /a/.test(d.hint));
});

// ---------------- z 补间 ----------------
test('z：对象与图层的 z 可补间，遮挡序平滑过渡而非瞬间跳变', () => {
  const r = compile(wrap('<circle id="a" z="0"/><step dur="1"><a z="10" ease="linear"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  near(live(r, 0.5, 'a').z, 5, 1e-3);
  near(live(r, r.scene.duration, 'a').z, 10);
  const r2 = compile(wrap('<layer name="fg" z="0"><circle id="b"/></layer><step dur="1"><fg z="20" ease="linear"/></step>'));
  assert.ok(r2.ok, JSON.stringify(r2.diagnostics));
  near(live(r2, 0.5, 'fg').z, 10, 1e-3);
});

// ---------------- 音效 ----------------
test('sound：实体登场与步骤开始时收集音效事件，未知音色给出警告', () => {
  const r = compile(wrap('<circle id="a" sound="pop"/><step sound="ding" dur="1"><circle id="b" sound="tick"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.equal(r.scene.sounds.length, 3);
  assert.ok(r.scene.sounds.some((s) => s.name === 'pop' && s.at === 0));
  assert.ok(r.scene.sounds.some((s) => s.name === 'ding' && s.at === 0));
  assert.ok(r.scene.sounds.some((s) => s.name === 'tick'));
  assert.ok(codes(compile(wrap('<circle id="a" sound="nope"/>'))).includes('W_BAD_VALUE'));
  assert.ok(codes(compile(wrap('<step sound="nope"><circle/></step>'))).includes('W_BAD_VALUE'));
});

// ---------------- 扩充缓动 ----------------
test('缓动：扩充曲线可被 ease 属性与 ease() 接受，端点正确', () => {
  const r = compile(wrap('<circle id="a"/><step dur="1"><a at="3,3" ease="quadOut"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.ok(!codes(r).includes('W_BAD_EASE'));
  const r2 = compile(wrap('<let x="{ease(\'sine\', 0.5)}"/><circle id="v{round(x*100)}"/>'));
  assert.ok(r2.ok, JSON.stringify(r2.diagnostics));
  assert.equal(r2.scene.entities[0].id, 'v50'); // sine(0.5) = 0.5
  const r3 = compile(wrap('<let a="{ease(\'quadOut\', 0.5)}" b="{ease(\'backIn\', 1)}" c="{ease(\'elasticOut\', 1)}"/>'));
  assert.ok(r3.ok, JSON.stringify(r3.diagnostics));
});

// ---------------- 新效果 flash / wobble ----------------
test('效果：flash 与 wobble 可编译，中途生效、结束回到原状', () => {
  const r = compile(wrap('<circle id="a" at="1,1"/><step dur="1"><a flash wobble="15"/></step>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.notEqual(live(r, r.scene.steps[0].t0 + 0.25, 'a').orot, 0, 'wobble 中途改变旋转');
  near(live(r, r.scene.duration, 'a').orot, 0, 1e-6);
  assert.ok(!codes(r).includes('W_BAD_VALUE'));
});

// ---------------- text 描边 / star 角数 ----------------
test('text：支持描边 stroke/width', () => {
  const r = compile(wrap('<text id="t" at="2,2" text="你好" stroke="#000000" width="3"/>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const st = r.scene.byId.get('t').init;
  assert.deepEqual(st.stroke.slice(0, 3), [0, 0, 0]);
  near(st.width, 3);
});

test('star：支持 points 角数，越界自动修正到 [3,24]', () => {
  const r = compile(wrap('<star id="s" at="2,2" points="6"/>'));
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.equal(r.scene.byId.get('s').points, 6);
  assert.equal(compile(wrap('<star points="2"/>')).scene.entities[0].points, 3);
  assert.equal(compile(wrap('<star points="40"/>')).scene.entities[0].points, 24);
});
