import { clamp, EASINGS } from '../util/ease.js';
import { applyLinks } from './links.js';

export function createLive(e) {
  return { ...e.init, id: e.id, type: e.type, hidden: false, ox: 0, oy: 0, sx: 1, sy: 1, orot: 0, ma: 1 };
}

/**
 * 纯函数：给定时间 t 求出所有对象的状态与当前字幕。
 * 任意顺序调用结果一致，可随意拖动进度、逐帧导出。
 */
export function evaluate(scene, t) {
  const ents = scene.entities.map(createLive);
  for (let i = 0; i < ents.length; i++) {
    const e = scene.entities[i];
    ents[i].hidden = t < e.birth || t >= e.death;
  }
  for (const s of scene.segments) {
    if (t < s.t0) break;
    s.fn(ents[s.ent], s.dur > 0 ? clamp((t - s.t0) / s.dur) : 1);
  }
  applyLinks(scene, ents); // 绑定连线：端点按对象此刻的位置重新算

  const steps = scene.steps;
  let step = -1;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].t0 <= t) step = i;
    else break;
  }
  const captions = [];
  if (scene.caption && step >= 0) {
    const cur = steps[step], prev = steps[step - 1];
    const k = EASINGS.out(clamp((t - cur.t0) / 0.3));
    const same = prev && prev.say === cur.say;
    if (cur.say) captions.push({ text: cur.say, k: same ? 1 : k });
    if (prev && prev.say && !same && k < 1) captions.push({ text: prev.say, k: 1 - k });
  }
  return { t, entities: ents, captions, step };
}
