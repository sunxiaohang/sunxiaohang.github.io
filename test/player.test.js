import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/core/index.js';
import { Player, frameTimes } from '../src/player/player.js';
import { near } from './helpers.js';

const scene = (extra = '') => compile(
  `<scene width="800" height="600" grid="3x3" hold="0.5" ${extra}>
     <circle id="a" at="1,1"/>
     <step say="一" dur="1"><a at="2,1"/></step>
     <step say="二" dur="1"><a at="3,1"/></step>
     <step say="三" dur="1"><a at="3,3"/></step>
   </scene>`,
).scene;

test('tick：未播放时不推进；播放时按速度推进；单次 dt 被限制，防止切后台后瞬移', () => {
  const p = new Player(scene());
  assert.equal(p.tick(0.1), false);
  assert.equal(p.time, 0);
  p.play();
  p.tick(0.05);
  near(p.time, 0.05);
  p.speed = 2;
  p.tick(0.05);
  near(p.time, 0.15);
  p.tick(10);
  near(p.time, 0.35, 1e-9);
});

test('循环：到结尾回绕且仍在播放；不循环：停在结尾并触发 end', () => {
  const sc = scene();
  const p = new Player(sc);
  const log = [];
  p.on('end', () => log.push('end'));
  p.on('pause', () => log.push('pause'));
  p.play();
  p.seek(sc.duration - 0.01);
  p.tick(0.05);
  assert.ok(p.playing && p.time < 0.1, '循环模式应回绕到开头附近');
  assert.deepEqual(log, []);

  p.loop = false;
  p.seek(sc.duration - 0.01);
  p.tick(0.05);
  assert.equal(p.playing, false);
  near(p.time, sc.duration);
  assert.deepEqual(log, ['pause', 'end']);
});

test('play：在结尾处再点播放会从头开始；seek 会被夹在 [0, duration]', () => {
  const sc = scene();
  const p = new Player(sc);
  p.seek(999);
  near(p.time, sc.duration);
  p.play();
  near(p.time, 0);
  p.seek(-5);
  near(p.time, 0);
});

test('事件：frame / play / pause / scene；取消订阅后不再触发', () => {
  const p = new Player(scene());
  const seen = [];
  const off = p.on('frame', (t) => seen.push(+t.toFixed(2)));
  p.play();
  p.tick(0.1);
  p.seek(0.5);
  off();
  p.seek(0.7);
  assert.deepEqual(seen, [0.1, 0.5]);
  let scenes = 0;
  p.on('scene', () => scenes++);
  p.setScene(scene());
  assert.equal(scenes, 1);
});

test('setScene：默认保留时间但夹在新时长内；keepTime=false 回到 0', () => {
  const p = new Player(scene());
  p.seek(3);
  p.setScene(compile('<scene><circle id="a"/><step say="x" dur="0.5"><a pulse/></step></scene>').scene);
  assert.ok(p.time <= p.duration);
  p.seek(1);
  p.setScene(scene(), { keepTime: false });
  assert.equal(p.time, 0);
});

test('步骤导航：next 先跳到当前步的静帧，再进入下一步；prev 回到上一步静帧；跳转会暂停', () => {
  const sc = scene();
  const p = new Player(sc);
  p.play();
  assert.equal(p.stepIndex, 0);

  p.next();
  assert.equal(p.playing, false, '步骤跳转应暂停');
  near(p.time, sc.steps[0].freeze);
  assert.equal(p.stepIndex, 0);

  p.next();
  near(p.time, sc.steps[1].freeze);
  assert.equal(p.stepIndex, 1);

  p.next();
  p.next();
  near(p.time, sc.steps[2].freeze, 1e-9);
  assert.equal(p.stepIndex, 2, '最后一步之后 next 停在最后一步');

  p.prev();
  near(p.time, sc.steps[1].freeze);
  p.prev();
  p.prev();
  near(p.time, 0);
});

test('stepIndex：时间在第一步开始之前为 -1；边界时刻属于新的一步', () => {
  const sc = compile('<scene><circle id="a"/><wait/></scene>').scene;
  assert.equal(new Player(sc).stepIndex, -1, '没有任何步骤');
  const s3 = scene();
  const p = new Player(s3);
  p.seek(s3.steps[1].t0);
  assert.equal(p.stepIndex, 1);
  p.seek(s3.steps[1].t0 - 0.001);
  assert.equal(p.stepIndex, 0);
});

test('没有场景时所有操作都是安全的空操作', () => {
  const p = new Player();
  assert.doesNotThrow(() => { p.play(); p.tick(1); p.next(); p.prev(); p.goStep(3); p.seek(5); });
  assert.equal(p.playing, false);
  assert.equal(p.duration, 0);
});

test('frameTimes：均匀采样，覆盖 0 与 duration，帧数 = round(duration*fps)+1', () => {
  const t = [...frameTimes(2, 30)];
  assert.equal(t.length, 61);
  assert.equal(t[0], 0);
  near(t.at(-1), 2);
  near(t[1] - t[0], 1 / 30, 1e-9);
  assert.deepEqual([...frameTimes(0.001, 30)], [0, 0.001], '极短场景至少 2 帧');
});
