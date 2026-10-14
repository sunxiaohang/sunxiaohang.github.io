import { EPS } from './scene.js';

/**
 * 同一个对象的同一个属性，在时间上重叠的两个"设置型"片段会互相覆盖，
 * 通常是写错了（该分步骤却写进了同一步）。
 */
export function detectConflicts(segs, diag) {
  const groups = new Map();
  for (const s of segs) {
    if (s.mode !== 'set' || s.internal || !(s.dur > 0)) continue;
    for (const p of s.props) {
      const k = `${s.id}:${p}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push([p, s]);
    }
  }
  for (const list of groups.values()) {
    let prev = null, prevEnd = -Infinity;
    for (const [prop, s] of list) {
      if (prev && s.t0 < prevEnd - EPS) {
        diag.warn('W_CONFLICT',
          `<${prev.tag}> 与 <${s.tag}> 在 ${s.t0.toFixed(2)}s 同时修改 ${s.id}.${prop}，后开始的会覆盖前者`,
          { line: s.line, col: s.col }, '拆到不同步骤，或让它们改不同的属性');
      }
      if (s.t0 + s.dur > prevEnd) { prev = s; prevEnd = s.t0 + s.dur; }
    }
  }
}
