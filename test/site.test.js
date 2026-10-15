import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { compile, evaluate } from '../src/core/index.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('examples/manifest.json'));
const home = read('src/site/home.js');

// 首页开篇轮播里列出的每个场景：文件存在、已登记进清单（从而被零诊断 / 确定性等通用门槛覆盖）
const reelFiles = [...home.matchAll(/file:\s*'(site\/hero[^']*\.xml)'/g)].map((m) => m[1]);

test('开篇轮播：至少 4 个场景，文件都存在且已登记在清单里', () => {
  assert.ok(reelFiles.length >= 4, `轮播场景太少：${reelFiles.length}`);
  assert.equal(new Set(reelFiles).size, reelFiles.length, '场景文件重复');
  for (const f of reelFiles) {
    assert.ok(existsSync(new URL(`../examples/${f}`, import.meta.url)), `${f} 不存在`);
    assert.ok(manifest.examples.some((e) => e.file === f), `${f} 没有登记进 examples/manifest.json，通用质量门槛不会覆盖它`);
  }
});

test('开篇轮播：所有场景同为 16:10，卡片里不会露出色带；每个都能完整播完且时长合适', () => {
  for (const f of reelFiles) {
    const sc = compile(read(`examples/${f}`)).scene;
    assert.ok(sc, f);
    assert.equal(sc.width / sc.height, 1.6, `${f} 不是 16:10（${sc.width}x${sc.height}），切换场景时会露出色带`);
    assert.ok(sc.duration >= 6 && sc.duration <= 30, `${f} 时长 ${sc.duration.toFixed(1)}s：太短像闪一下，太长观众等不到下一个`);
    assert.ok(sc.steps.length >= 3, `${f} 步骤太少`);
  }
});

test('开篇轮播：每个场景在配色模板切换后依然成立（轮播里可随时换配色）', async () => {
  const { PALETTES } = await import('../src/core/palettes.js');
  const { setScenePalette } = await import('../src/app/scene-src.js');
  for (const f of reelFiles) {
    for (const p of PALETTES) {
      const r = compile(setScenePalette(read(`examples/${f}`), p.name));
      assert.ok(r.scene, `${f} / ${p.name} 编译失败`);
      assert.deepEqual(r.diagnostics.filter((d) => d.severity === 'error'), [], `${f} / ${p.name}`);
    }
  }
});

test('开篇轮播：每个场景都从干净的起点开始搭建（t=0 可见对象 ≤ 3，不会一上来就是半成品）', () => {
  // 轮播切到某个场景时，画面从空白开始一步步搭起来；如果 t=0 就铺满了东西，切换时会有“跳”的感觉
  for (const f of reelFiles) {
    const sc = compile(read(`examples/${f}`)).scene;
    const fr = evaluate(sc, 0);
    const visible = sc.entities.filter((e) => !e.internal && e.type !== 'layer' && e.type !== 'map' && !fr.entities[e.index].hidden && fr.entities[e.index].alpha > 0.02);
    assert.ok(visible.length <= 3, `${f} 在 t=0 就有 ${visible.length} 个对象可见：${visible.slice(0, 5).map((e) => e.id).join(',')}`);
  }
});
test('开篇轮播：首页脚本不再依赖 IntersectionObserver 的首次回调开播，也不因“减少动效”停播', () => {
  // 回归：以前开播要等观察器回调，偏偏它在部分环境下迟到或不触发，动画就停在第一帧，用户只能手动点击
  assert.ok(/hero\.visible\s*=\s*inView\(\)/.test(home), '加载时应立即按位置判断可见并开播');
  assert.ok(!/autoplayWhenVisible\(\)/.test(home.slice(home.indexOf('Hero：开篇轮播'), home.indexOf('代码对照'))), '开篇不应再走 autoplayWhenVisible（它在减少动效时只显示海报帧）');
  assert.ok(/player\.on\('end'/.test(home), '一个场景播完要自动换下一个');
});
