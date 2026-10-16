import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, lint } from '../src/core/index.js';
import { LESSONS, MINIMAL, appendSnippet, replaceAll, applyStep, checkStep } from '../src/editor/tutorial-content.js';

/** 教程片段在编辑器里的真实效果：从一个空编辑器开始，按顺序逐步写入 */

const apply = applyStep;
const startState = (first) => (first.mode === 'replace' ? '' : MINIMAL);

test('教程：每一关的标题、目标、步骤说明都写全了', () => {
  assert.ok(LESSONS.length >= 3, '至少要有三关');
  for (const l of LESSONS) {
    assert.ok(l.name && l.goal && l.level, `${l.id} 缺少名称 / 目标 / 难度`);
    assert.ok(l.steps.length >= 3, `${l.id} 步骤太少，学不到东西`);
    for (const s of l.steps) {
      assert.ok(s.title && s.why && s.snippet, `${l.id} 的某一步缺少标题 / 说明 / 片段`);
      assert.ok(['replace', 'append', 'edit'].includes(s.mode), `${l.id} 的步骤 mode 不合法`);
      if (s.mode === 'edit') assert.ok(s.edit && s.edit.palette, `${l.id} / ${s.title}：edit 步骤要写明改什么`);
      assert.equal(s.snippet, s.snippet.trimEnd(), `${l.id} / ${s.title} 片段尾部有多余空行`);
    }
    assert.equal(l.steps[0].mode, 'replace', `${l.id} 的第一步应该是整段替换（从干净的场景开始）`);
  }
});

test('教程：每一关逐条跟着做下来，每一步的脚本都能编译、零错误', () => {
  for (const lesson of LESSONS) {
    let src = startState(lesson.steps[0]);
    lesson.steps.forEach((step, i) => {
      const next = apply(src, step);
      assert.ok(next, `${lesson.id} / ${step.title}：拼接失败（脚本里找不到 </scene>）`);
      const r = compile(next);
      const errs = r.diagnostics.filter((d) => d.severity === 'error');
      assert.deepEqual(errs.map((d) => `${d.code} ${d.message}`), [], `${lesson.id} / 第 ${i + 1} 步「${step.title}」编译报错`);
      assert.ok(r.scene, `${lesson.id} / 第 ${i + 1} 步没有编译出场景`);
      src = next;
    });
  }
});

test('教程：跟完一关之后，画面里的东西和这一关承诺的一致，且没有 lint 警告', () => {
  for (const lesson of LESSONS) {
    let src = startState(lesson.steps[0]);
    for (const step of lesson.steps) src = apply(src, step);
    const r = compile(src);
    assert.ok(r.scene, lesson.id);
    const warns = [...r.diagnostics, ...lint(r.scene)].filter((d) => d.severity !== 'error');
    assert.deepEqual(warns.map((d) => `${d.code} ${d.message}`), [], `${lesson.id} 的成品有 lint 警告`);
    assert.ok(r.scene.steps.length >= 2, `${lesson.id} 的成品至少要有 2 步，否则讲不了`);
    assert.ok(r.scene.duration > 1 && r.scene.duration < 30, `${lesson.id} 的成品时长不合理：${r.scene.duration}`);
  }
});

test('教程：每一步的检查项都能判断「做到 / 还没做到」', () => {
  for (const lesson of LESSONS) {
    let src = startState(lesson.steps[0]);
    lesson.steps.forEach((step) => {
      // 还没做这一步之前：这一步的检查项应该是「还没做到」
      const before = compile(src);
      const notYet = checkStep(step, { src, scene: before.scene, diagnostics: before.diagnostics });
      assert.equal(notYet.ok, false, `${lesson.id} / ${step.title}：做之前就判定完成了，检查项没有意义`);

      // 做完之后：全部满足
      src = apply(src, step);
      const after = compile(src);
      const done = checkStep(step, { src, scene: after.scene, diagnostics: after.diagnostics });
      assert.equal(done.ok, true, `${lesson.id} / ${step.title}：做完之后仍未满足：${done.todo.join('；')}`);
      assert.ok(done.done.length >= 1, `${lesson.id} / ${step.title}：没有任何检查项`);
    });
  }
});

test('教程：片段测试的检查项在「用户手改坏了」时不会被误判为完成', () => {
  const loop = LESSONS.find((l) => l.id === 'loop');
  const forStep = loop.steps.find((s) => s.title.includes('for'));
  // 少写了循环，柱子只有一根
  const half = `<scene width="800" height="480" grid="8x6" palette="porcelain">
  <rect id="bar1" at="1,4" w=".5c" h=".3c"/>
</scene>`;
  const r = compile(half);
  const res = checkStep(forStep, { src: half, scene: r.scene, diagnostics: r.diagnostics });
  assert.equal(res.ok, false, '只放了一根柱子不应算完成');
  assert.match(res.todo.join(), /8 根柱子/);
});

test('教程：appendSnippet 把片段插到 </scene> 之前，且不动原有内容', () => {
  const base = `<scene width="800" height="480" grid="8x6" palette="porcelain">
  <circle id="a" at="1,1"/>
</scene>
`;
  const out = appendSnippet(base, '  <step say="走"><a at="3,3"/></step>');
  assert.ok(out.startsWith(base.split('</scene>')[0].trimEnd()), '原有内容应保持在前面');
  assert.ok(out.indexOf('<circle') < out.indexOf('<step'), '片段应插在最后');
  assert.ok(/<\/scene>\s*$/.test(out), '</scene> 仍在结尾');
  assert.equal((out.match(/<scene\b/g) || []).length, 1, '不应重复插入根标签');
  assert.equal(appendSnippet('<scene></scene>', '  <circle/>'), '<scene>\n  <circle/>\n</scene>');
});

test('教程：脚本不完整（没有 </scene>）时返回 null，让界面去提示，而不是瞎插', () => {
  assert.equal(appendSnippet('', '  <circle/>'), null);
  assert.equal(appendSnippet('<scene width="800">', '  <circle/>'), null);
  assert.equal(appendSnippet('<scene></scene>', 'x'), '<scene>\nx\n</scene>');
});

test('教程：片段本身不夹带 id="a" 之类的示例残留，也不写死颜色（要跟随配色）', () => {
  for (const lesson of LESSONS) {
    for (const step of lesson.steps) {
      assert.ok(!/#[0-9a-fA-F]{6}/.test(step.snippet), `${lesson.id} / ${step.title}：片段里写死了颜色，应该用 accent / warn 这类语义色`);
      assert.ok(!/GridMotion|gridmotion/i.test(step.snippet), `${lesson.id} / ${step.title}：残留了旧名字`);
    }
  }
});
