import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileWithImports, evaluate, lint, describe } from '../src/core/index.js';
import { examples, manifest, near, makeLoader } from './helpers.js';

/**
 * 示例套件：每个示例都是一份"语言兼容性 + 效果多样性"的回归用例。
 * 这里只做机器能判断的部分（编译、静帧语义、数值）；"好不好看"靠 tools/gallery.mjs 肉眼复核。
 */

const compiled = new Map();
for (const e of examples) compiled.set(e.id, await compileWithImports(e.src, makeLoader(e.file)));
const ids = (id) => compiled.get(id).scene.entities.filter((e) => !e.internal).map((e) => e.id);
const frameAt = (id, step) => {
  const { scene } = compiled.get(id);
  return evaluate(scene, scene.steps[step].freeze);
};
const ent = (id, name) => compiled.get(id).scene.byId.get(name);
const live = (id, step, name) => frameAt(id, step).entities[ent(id, name).index];
/** 按字幕关键词找步骤序号：比写死序号稳，剧本增删步骤时测试不会悄悄指向错误的画面 */
const stepOf = (id, keyword) => {
  const i = compiled.get(id).scene.steps.findIndex((s) => s.say.includes(keyword));
  assert.ok(i >= 0, `"${id}" 里没有字幕包含 "${keyword}"`);
  return i;
};

// ---------------- 通用质量门槛：每个示例都必须满足 ----------------
for (const ex of examples) {
  test(`[${ex.category}/${ex.id}] 零诊断：无错误、无警告、无出界、无意外重叠`, () => {
    const r = compiled.get(ex.id);
    assert.ok(r.scene, '必须能编译出场景');
    const problems = [...r.diagnostics, ...lint(r.scene)];
    assert.deepEqual(problems, [], problems.map((d) => `${d.code}@${d.line}:${d.col} ${d.message}`).join('\n'));
  });

  test(`[${ex.category}/${ex.id}] 每一步的静帧都有字幕，且字幕在静帧时完全显示`, () => {
    const { scene } = compiled.get(ex.id);
    assert.ok(scene.steps.length >= 3, '教程至少 3 步');
    scene.steps.forEach((s, i) => {
      assert.ok(s.say && s.say.trim().length >= 1, `第 ${i + 1} 步缺少 say`);
      const f = evaluate(scene, s.freeze);
      assert.equal(f.step, i);
      const c = f.captions.find((x) => x.text === s.say);
      assert.ok(c && c.k > 0.999, `第 ${i + 1} 步的静帧字幕没有完全显示`);
    });
  });

  test(`[${ex.category}/${ex.id}] 静帧时该步的补间全部完成（freeze ≥ 步内最晚片段结束）`, () => {
    const { scene } = compiled.get(ex.id);
    for (const s of scene.steps) {
      const late = scene.segments.filter((g) => g.step === s.index).reduce((m, g) => Math.max(m, g.t0 + g.dur), s.t0);
      assert.ok(s.freeze >= Math.min(late, s.t2) - 1e-6, `第 ${s.index + 1} 步 freeze=${s.freeze} 早于片段结束 ${late}`);
    }
  });

  test(`[${ex.category}/${ex.id}] 求值是确定性的，且数值全部有限`, () => {
    const { scene } = compiled.get(ex.id);
    const times = [0, scene.duration * 0.37, scene.duration * 0.37, scene.duration];
    const seen = [];
    for (const t of times) {
      const f = evaluate(scene, t);
      for (const L of f.entities.filter((x) => x.type !== 'layer')) {
        for (const k of ['x', 'y', 'size', 'rot', 'alpha', 'sx', 'sy', 'ox', 'oy', 'ma']) {
          assert.ok(Number.isFinite(L[k]), `${L.id}.${k} 在 t=${t} 不是有限数：${L[k]}`);
        }
      }
      seen.push(JSON.stringify(f));
    }
    assert.equal(seen[1], seen[2], '同一时刻两次求值结果必须一致');
  });

  test(`[${ex.category}/${ex.id}] describe 输出可被 JSON 序列化，步骤与场景一致`, () => {
    const { scene } = compiled.get(ex.id);
    const d = describe(scene);
    assert.equal(d.steps.length, scene.steps.length);
    assert.doesNotThrow(() => JSON.stringify(d));
    // 允许第 1 步是纯开场白（只有字幕）；其余每一步都必须真的改变了画面
    for (const s of d.steps.slice(1)) assert.ok(s.touches.length > 0, `第 ${s.n} 步没有改变任何对象`);
  });
}

// ---------------- 清单与文件一致性 ----------------
test('manifest：每个分类都有示例，id 唯一，covers 非空', () => {
  const cats = new Set(manifest.categories.map((c) => c.id));
  const seen = new Set();
  for (const e of manifest.examples) {
    assert.ok(cats.has(e.category), `${e.id} 的分类 ${e.category} 未声明`);
    assert.ok(!seen.has(e.id), `重复 id ${e.id}`);
    seen.add(e.id);
    assert.ok(e.covers.length > 0);
  }
  for (const c of manifest.categories) assert.ok(manifest.examples.some((e) => e.category === c.id), `分类 ${c.id} 没有示例`);
});

test('示例规模：棋类 ≥5、幼儿 ≥7、效果 ≥2', () => {
  const n = (c) => manifest.examples.filter((e) => e.category === c).length;
  assert.ok(n('chess') >= 5);
  assert.ok(n('kids') >= 7);
  assert.ok(n('effects') >= 2);
});

// ---------------- 语义校验：示例讲的内容要和画面一致 ----------------
test('五子棋：9 手棋黑白交替，落在预期交点上，最后五子连成一线', () => {
  const { scene } = compiled.get('gomoku');
  const stones = scene.entities.filter((e) => e.type === 'circle');
  assert.equal(stones.length, 9);
  const last = frameAt('gomoku', scene.steps.length - 1);
  assert.equal(stones.map((e) => (last.entities[e.index].fill[0] < 100 ? 'B' : 'W')).join(''), 'BWBWBWBWB');
  const cell = (e) => [(e.init.x - scene.ax) / scene.cw + 0.5, (e.init.y - scene.ay) / scene.ch + 0.5];
  assert.deepEqual(cell(stones[0]).map(Math.round), [8, 8]);
  const blackRow8 = stones.filter((e, i) => i % 2 === 0 && Math.round(cell(e)[1]) === 8).map((e) => Math.round(cell(e)[0])).sort((a, b) => a - b);
  assert.deepEqual(blackRow8, [7, 8, 9, 10, 11], '黑棋应在第 8 行 7..11 列连成五子');
});

test('象棋：红黑两个分组各 5 子，吃子后被吃的黑炮消失，红炮落在黑炮原位', () => {
  const sc = compiled.get('xiangqi').scene;
  assert.equal(sc.groups.get('红方').members.length, 5);
  assert.equal(sc.groups.get('黑方').members.length, 5);
  const before = frameAt('xiangqi', stepOf('xiangqi', '隔着一个棋子'));
  assert.equal(before.entities[ent('xiangqi', 'b炮').index].hidden, false);
  const after = frameAt('xiangqi', stepOf('xiangqi', '吃掉了黑炮'));
  assert.equal(after.entities[ent('xiangqi', 'b炮').index].hidden, true);
  const red = after.entities[ent('xiangqi', 'r炮').index], black = ent('xiangqi', 'b炮').init;
  assert.ok(Math.hypot(red.x - black.x, red.y - black.y) < 1, '红炮应落在黑炮的位置');
});

test('象棋：马走日——路径是"先直一格再斜一格"，终点相对起点是 (+1,-2)', () => {
  const { scene } = compiled.get('xiangqi');
  const start = ent('xiangqi', 'r马').init, end = live('xiangqi', stepOf('xiangqi', '日」字'), 'r马');
  assert.ok(Math.abs((end.x - start.x) / scene.cw - 1) < 1e-6);
  assert.ok(Math.abs((end.y - start.y) / scene.ch + 2) < 1e-6);
});

test('斗兽棋：8 个动物按大小排序、鼠克象成立、尾迹存在且内部对象不暴露', () => {
  const sc = compiled.get('doushouqi').scene;
  assert.equal(sc.entities.filter((e) => e.id.startsWith('rank')).length, 8);
  const hue = (i) => sc.byId.get(`rank${i}`).init.fill;
  assert.ok(hue(0)[2] > hue(7)[2], '象（最大）应比鼠（最小）更偏蓝');
  assert.ok(sc.entities.some((e) => e.type === 'trace'), '应生成尾迹对象');
  assert.ok(!describe(sc).entities.some((e) => e.type === 'trace'), 'describe 不应暴露内部尾迹');
  const eaten = stepOf('doushouqi', '把它吃掉了');
  assert.equal(frameAt('doushouqi', eaten).entities[ent('doushouqi', 'b象').index].hidden, true, '象被吃掉');
  const mouse = live('doushouqi', eaten, 'r鼠');
  near(mouse.x, ent('doushouqi', 'b象').init.x, 1);
  assert.equal(frameAt('doushouqi', eaten - 1).entities[ent('doushouqi', 'b象').index].hidden, false, '吃之前象还在');
});

test('狼吃羊：被跳过的羊消失，狼落在羊的后方空位', () => {
  const { scene } = compiled.get('wolf-sheep');
  assert.equal(scene.groups.get('羊群').members.length, 4);
  const eaten = stepOf('wolf-sheep', '把羊吃掉了');
  assert.equal(frameAt('wolf-sheep', eaten - 1).entities[ent('wolf-sheep', 's2').index].hidden, false, '吃之前羊还在');
  assert.equal(frameAt('wolf-sheep', eaten).entities[ent('wolf-sheep', 's2').index].hidden, true);
  const wolf = live('wolf-sheep', eaten, 'wolf');
  const cell = [(wolf.x - scene.ax) / scene.cw + 0.5, (wolf.y - scene.ay) / scene.ch + 0.5].map(Math.round);
  assert.deepEqual(cell, [2, 5]);
});

test('井字棋：X 用模板生成（每个两条线），O 用 def 简写，最终有一条获胜线', () => {
  const sc = compiled.get('tictactoe').scene;
  const lines = sc.entities.filter((e) => e.type === 'line');
  assert.equal(lines.filter((e) => /^x\d+[ab]$/.test(e.id)).length, 10, '5 个 X × 2 条线');
  assert.equal(sc.entities.filter((e) => e.type === 'circle').length, 4);
  assert.ok(ent('tictactoe', 'win'));
  assert.equal(sc.groups.get('x1').members.length, 2, '模板里的 group="{id}" 把一个 X 的两条线编成一组');
});

test('识字：八张卡 × 三个部件，卡片内容与字表一致；逐个点亮', () => {
  const sc = compiled.get('literacy').scene;
  const chars = '日月山水火木田口';
  [...chars].forEach((c, i) => {
    assert.equal(sc.byId.get(`k${i}_ch`).init.text, c);
    assert.ok(sc.byId.get(`k${i}_py`).init.text.length >= 2);
  });
  assert.equal(sc.entities.filter((e) => e.type === 'text').length, 16);
  // 讲到「山」时：山的卡片变成实心主题色（不再是白色），而上一张「月」已恢复白色
  const f = frameAt('literacy', stepOf('literacy', '山（shān）'));
  const bg = (k) => f.entities[sc.byId.get(`k${k}_bg`).index].fill;
  assert.ok(bg(2)[2] < 200, '山的卡片应被点亮（不是白色）');
  assert.deepEqual(bg(1).slice(0, 3).map(Math.round), [255, 255, 255], '月的卡片应已恢复白色');
});

test('识图：每样东西是一个分组，用到椭圆/三角/星形，分组成员数符合模板', () => {
  const sc = compiled.get('pictures').scene;
  assert.equal(sc.groups.get('sun').members.length, 9, '太阳 = 1 圆 + 8 光芒');
  assert.equal(sc.groups.get('house').members.length, 3);
  assert.equal(sc.groups.get('tree').members.length, 4);
  assert.equal(sc.groups.get('flower').members.length, 8, '花 = 6 瓣 + 花心 + 茎');
  for (const t of ['ellipse', 'triangle', 'star', 'rect', 'circle']) assert.ok(sc.entities.some((e) => e.type === t), `缺少 ${t}`);
});

test('数数：苹果数量与步数一致，大数字文字逐步变化到 10', () => {
  const sc = compiled.get('counting').scene;
  assert.equal(sc.entities.filter((e) => /^a\d+_b$/.test(e.id)).length, 10);
  for (let n = 1; n <= 10; n++) assert.equal(frameAt('counting', n).entities[ent('counting', '大数').index].text, String(n));
  assert.equal(sc.steps.length, 12);
});

test('加法：3 + 2 的算式文字在最后一步等于 3 + 2 = 5，两堆球合并后是 5 个连续格子', () => {
  const sc = compiled.get('addition').scene;
  const last = frameAt('addition', sc.steps.length - 1);
  assert.equal(last.entities[ent('addition', '算式').index].text, '3 + 2 = 5');
  const xs = sc.entities.filter((e) => /^(r|b)\d+$/.test(e.id)).map((e) => Math.round(last.entities[e.index].x / sc.cw - 0.5 + 1)).sort((a, b) => a - b);
  assert.deepEqual(xs, [1, 2, 3, 4, 5]);
});

test('减法：7 只鸟飞走 3 只，剩 4 只可见，飞走的透明', () => {
  const sc = compiled.get('subtraction').scene;
  const f = frameAt('subtraction', sc.steps.length - 1);
  const alpha = (i) => f.entities[ent('subtraction', `n${i}_b`).index].alpha;
  for (let i = 1; i <= 4; i++) assert.equal(alpha(i), 1);
  for (let i = 5; i <= 7; i++) assert.equal(alpha(i), 0);
  assert.equal(f.entities[ent('subtraction', '算式').index].text, '7 - 3 = 4');
});

test('乘法：3 排 × 4 个 = 12 个点，算式文字正确', () => {
  const sc = compiled.get('multiplication').scene;
  assert.equal(sc.entities.filter((e) => /^d\d_\d$/.test(e.id)).length, 12);
  assert.equal(frameAt('multiplication', sc.steps.length - 1).entities[ent('multiplication', '算式').index].text, '3 × 4 = 12');
});

test('除法：12 颗糖分给 3 个篮子，每个篮子恰好 4 颗，且按取余规则分配', () => {
  const sc = compiled.get('division').scene;
  const f = frameAt('division', sc.steps.length - 1);
  const perBasket = [0, 0, 0];
  for (let i = 1; i <= 12; i++) {
    const L = f.entities[sc.byId.get(`c${i}`).index];
    const col = Math.round((L.x - sc.ax) / sc.cw - 0.5 + 1);
    const b = { 2.5: 0, 4.5: 1, 6.5: 2 }[+(((L.x - sc.ax) / sc.cw + 0.5).toFixed(1))];
    assert.ok(b !== undefined, `糖 c${i} 没有落在篮子上方（列 ${col}）`);
    assert.equal(b, (i - 1) % 3, `第 ${i} 颗糖应进第 ${(i - 1) % 3 + 1} 个篮子`);
    perBasket[b]++;
  }
  assert.deepEqual(perBasket, [4, 4, 4]);
  assert.equal(f.entities[ent('division', '算式').index].text, '12 ÷ 3 = 4');
});

test('九九表：下三角共 45 个格子，每格数字 = 行×列，对角线是平方数', () => {
  const sc = compiled.get('times-table').scene;
  const cells = sc.entities.filter((e) => /^t\d+_\d+$/.test(e.id));
  assert.equal(cells.length, 45);
  for (const e of cells) {
    const [r, c] = e.id.slice(1).split('_').map(Number);
    assert.equal(e.init.label, String(r * c), `${e.id} 的数字应为 ${r * c}`);
    assert.ok(c <= r);
  }
  const fin = frameAt('times-table', stepOf('times-table', '平方数'));
  for (let k = 1; k <= 9; k++) {
    const fill = fin.entities[sc.byId.get(`t${k}_${k}`).index].fill;
    assert.ok(fill[0] > 200 && fill[1] < 120, `对角线 ${k} 应变红，实际 ${fill.map(Math.round)}`);
  }
});

test('九九表：口诀字幕按课本读法（一一得一…），不能出现数字糊在一起的写法', () => {
  const { scene } = compiled.get('times-table');
  const rows = scene.steps.filter((s) => /^第 \d 行/.test(s.say));
  assert.equal(rows.length, 9);
  assert.equal(rows[0].say, '第 1 行：一一得1，二一得2，……，一一得1');
  assert.equal(rows[2].say, '第 3 行：一三得3，二三得6，……，三三得9');
  assert.equal(rows[8].say, '第 9 行：一九得9，二九得18，……，九九得81');
  for (const s of rows) assert.ok(!/\d\d\d/.test(s.say.replace(/第 \d 行/, '')), `字幕里有连在一起的三位数：${s.say}`);
});

test('缓动展览：残影点位置等于 ease(name,t)，终点处全部收敛，过冲型确实越过终点', () => {
  const sc = compiled.get('easing-gallery').scene;
  const x = (i, j) => sc.byId.get(`t${i}_${j}`).init.x;
  const x0 = x(0, 0), x1 = x(0, 10);
  for (let i = 0; i < 8; i++) {
    near(x(i, 0), x0, 1e-6);
    near(x(i, 10), x1, 1e-6);
  }
  const mid = (i) => (x(i, 5) - x0) / (x1 - x0);
  near(mid(0), 0.5, 1e-6);
  assert.ok(Math.abs(mid(1) - 0.5) < 1e-6, 'soft 关于中点对称');
  assert.ok(mid(2) > 0.5, 'snap 起步快');
  assert.ok(mid(3) < 0.5, 'in 起步慢');
  let maxBack = 0, maxSpring = 0;
  for (let j = 0; j <= 10; j++) { maxBack = Math.max(maxBack, (x(4, j) - x0) / (x1 - x0)); maxSpring = Math.max(maxSpring, (x(5, j) - x0) / (x1 - x0)); }
  assert.ok(maxBack > 1.02, 'back 应过冲');
  assert.ok(maxSpring > 1.02, 'spring 应过冲');
});

test('轨道：行星数 = n，越靠外的轨道半径越大', () => {
  const sc = compiled.get('orbits').scene;
  const planets = sc.entities.filter((e) => /^p\d+$/.test(e.id));
  assert.equal(planets.length, 6);
  const rings = sc.entities.filter((e) => /^o\d+$/.test(e.id));
  for (let i = 1; i < rings.length; i++) assert.ok(rings[i].init.size > rings[i - 1].init.size);
  assert.equal(ids('orbits').includes('sun'), true);
});
