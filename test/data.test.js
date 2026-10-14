import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, compileWithImports, evalExpr } from '../src/core/index.js';
import { Scope } from '../src/core/lang/expr.js';
import { parseCSV, parseData } from '../src/core/lang/csv.js';

// ---------------- 表达式：属性访问 ----------------
test('表达式：对象属性访问 {row.字段} 与 {list[i].字段}', () => {
  const sc = new Scope();
  sc.declare('row', { 名称: '苹果', 数量: 3 });
  sc.declare('rows', [{ n: 1 }, { n: 2 }]);
  assert.equal(evalExpr('row.名称', sc, {}), '苹果');
  assert.equal(evalExpr('row.数量', sc, {}), 3);
  assert.equal(evalExpr('rows[1].n', sc, {}), 2);
});

// ---------------- CSV 解析 ----------------
test('parseCSV：表头 → 对象数组，数字自动转 number，引号内逗号不拆', () => {
  const rows = parseCSV('名称,数量,备注\n苹果,3,"甜,脆"\n香蕉,5,香');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { 名称: '苹果', 数量: 3, 备注: '甜,脆' });
  assert.equal(typeof rows[1].数量, 'number');
});

test('parseData：format=json 要求数组', () => {
  assert.deepEqual(parseData('[{"a":1}]', 'json'), [{ a: 1 }]);
  assert.throws(() => parseData('{"a":1}', 'json'));
});

// ---------------- 内联数据源 ----------------
test('data：内联 CSV → for 逐行渲染，属性访问取字段', () => {
  const src = '<scene grid="3x2">\n<data name="rows">名称,数量,颜色\n苹果,1,#ff0000\n香蕉,2,#0000ff</data>\n<for var="row" in="{rows}">\n  <circle id="c{row.名称}" at="{row.数量},1" fill="{row.颜色}"/>\n</for>\n</scene>';
  const r = compile(src);
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  const apple = r.scene.byId.get('c苹果'), banana = r.scene.byId.get('c香蕉');
  assert.ok(apple && banana);
  assert.equal(Math.round((apple.init.x - r.scene.ax) / r.scene.cw + 0.5), 1, '数量 1 → 第 1 列');
  assert.equal(Math.round((banana.init.x - r.scene.ax) / r.scene.cw + 0.5), 2, '数量 2 → 第 2 列');
  assert.deepEqual(apple.init.fill.slice(0, 3), [255, 0, 0]);
  assert.deepEqual(banana.init.fill.slice(0, 3), [0, 0, 255]);
});

test('data：内联 JSON 数据源', () => {
  const src = '<scene><data name="rows" format="json">[{"n":1,"name":"甲"},{"n":2,"name":"乙"}]</data><for var="row" in="{rows}"><circle id="c{row.name}" at="{row.n},1"/></for></scene>';
  const r = compile(src);
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  assert.ok(r.scene.byId.has('c甲') && r.scene.byId.has('c乙'));
});

test('data：数据长度可被 {rows.length} 读取', () => {
  const src = '<scene><data name="rows">a,b\n1,2\n3,4</data><let n="{rows.length}"/><text id="t" text="{n} 行"/></scene>';
  const r = compile(src);
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  assert.equal(r.scene.byId.get('t').init.text, '2 行');
});

// ---------------- 外部数据源 ----------------
test('data：外部 CSV 文件通过 loader 加载', async () => {
  const src = '<scene><data name="rows" src="data.csv"/><for var="row" in="{rows}"><circle id="c{row.id}" at="{row.x},1"/></for></scene>';
  const loader = (p) => Promise.resolve('id,x\n1,1\n2,2\n3,3');
  const r = await compileWithImports(src, loader);
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  assert.ok(r.scene.byId.has('c1') && r.scene.byId.has('c3'));
});

test('data：加载失败或解析失败给出诊断', async () => {
  const fail = await compileWithImports('<scene><data name="rows" src="nope.csv"/></scene>', () => Promise.reject(new Error('ENOENT')));
  assert.ok(fail.diagnostics.some((d) => d.code === 'E_DATA'));
  const bad = compile('<scene><data name="rows">a,b\n1</data></scene>'); // 列数不齐也能解析
  assert.ok(bad.scene);
  const syncSrc = compile('<scene><data name="rows" src="x.csv"/></scene>');
  assert.ok(syncSrc.diagnostics.some((d) => d.code === 'E_DATA'), '同步 compile 遇到 src 数据应提示用 compileWithImports');
});
