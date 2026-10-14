import { evaluate } from '../runtime/evaluate.js';
import { SOLID, POSITIONAL, BOXED } from '../lang/schema.js';

const r2 = (v) => Math.round(v * 100) / 100;
const radius = (e, L) => (BOXED.has(e.type) ? Math.min(L.w, L.h) : L.size) / 2;
const effAlpha = (L) => L.alpha * L.ma;

const offscreen = (scene, L) => {
  const x = L.x + L.ox, y = L.y + L.oy, m = (L.size || 0) * 0.5;
  return x < -m || x > scene.width + m || y < -m || y > scene.height + m;
};

/**
 * 采样检查：
 *  - 对象"跑出画布并留在外面"：出界后直到结束（或下一次回到画布）都还可见才报。
 *    飞出去并最终淡出 / 退场，是明确的退场意图，不报。
 *  - 每一步"冻结画面"里，同一图层的实心图形互相重叠（教程画面会因此失真）
 */
export function lint(scene, step = 0.1) {
  const out = [];
  const n = Math.ceil(scene.duration / step);
  const frames = [];
  for (let k = 0; k <= n; k++) {
    const t = Math.min(scene.duration, k * step);
    frames.push({ t, f: evaluate(scene, t) });
  }
  scene.entities.forEach((e, i) => {
    if (!POSITIONAL.has(e.type)) return;
    // 找到第一次"出界且可见"的时刻，再确认之后是否一直留在界外并保持可见到某个静帧/结束
    let first = -1;
    for (let k = 0; k < frames.length; k++) {
      const L = frames[k].f.entities[i];
      if (!L.hidden && effAlpha(L) >= 0.02 && offscreen(scene, L)) { first = k; break; }
    }
    if (first < 0) return;
    for (let k = first; k < frames.length; k++) {
      const L = frames[k].f.entities[i];
      const stillOut = !L.hidden && effAlpha(L) >= 0.02 && offscreen(scene, L);
      if (!stillOut) return; // 之后消失或回到画布：属于"飞出去再退场"，不报
    }
    const L = frames[first].f.entities[i];
    out.push({
      severity: 'warning', code: 'W_OFFSCREEN', line: e.line, col: e.col,
      message: `对象 "${e.id}" 在 ${r2(frames[first].t)}s 时跑出了画布并一直留在外面 (${Math.round(L.x + L.ox)}, ${Math.round(L.y + L.oy)})`,
    });
  });

  const solids = scene.entities.filter((e) => SOLID.has(e.type));
  if (scene.overlapCheck && solids.length && solids.length <= 400) {
    const seen = new Set();
    for (const s of scene.steps) {
      const frame = evaluate(scene, s.freeze);
      const vis = solids
        .map((e) => ({ e, L: frame.entities[e.index] }))
        .filter(({ L }) => !L.hidden && effAlpha(L) > 0.5);
      for (let a = 0; a < vis.length; a++) {
        for (let b = a + 1; b < vis.length; b++) {
          const A = vis[a], B = vis[b];
          if (A.e.layer !== B.e.layer) continue;
          // 同属一个分组的图形是"拼在一起"的整体（如用几何拼成的房子），重叠是故意的
          if (A.e.groups.some((g) => B.e.groups.includes(g))) continue;
          const key = `${A.e.id}|${B.e.id}`;
          if (seen.has(key)) continue;
          const d = Math.hypot(A.L.x + A.L.ox - (B.L.x + B.L.ox), A.L.y + A.L.oy - (B.L.y + B.L.oy));
          if (d < (radius(A.e, A.L) + radius(B.e, B.L)) * 0.6) {
            seen.add(key);
            out.push({
              severity: 'warning', code: 'W_OVERLAP', line: B.e.line, col: B.e.col,
              message: `第 ${s.index + 1} 步的画面里，"${A.e.id}" 与 "${B.e.id}" 重叠了`,
            });
          }
        }
      }
    }
  }
  return out;
}

/** 给程序/AI 读的场景摘要：画布、对象、分组、每一步说了什么、动了谁。 */
export function describe(scene) {
  const touches = new Map();
  for (const s of scene.segments) {
    if (s.step < 0) continue;
    if (!touches.has(s.step)) touches.set(s.step, new Set());
    touches.get(s.step).add(s.id);
  }
  return {
    canvas: { width: scene.width, height: scene.height, cols: scene.cols, rows: scene.rows },
    duration: r2(scene.duration),
    entities: scene.entities
      .filter((e) => e.type !== 'layer' && !e.internal)
      .map((e) => ({
        id: e.id, type: e.type,
        ...(e.layer >= 0 && { layer: scene.entities[e.layer].id }),
        ...(e.groups?.length && { groups: e.groups }),
        ...(POSITIONAL.has(e.type) && {
          cell: [r2((e.init.x - scene.ax) / scene.cw + 0.5), r2((e.init.y - scene.ay) / scene.ch + 0.5)],
        }),
        ...(e.birth > 0 && { appearsAt: r2(e.birth) }),
      })),
    groups: Object.fromEntries([...scene.groups].map(([k, g]) => [k, g.members.map((i) => scene.entities[i].id)])),
    steps: scene.steps.map((s) => ({
      n: s.index + 1, say: s.say, from: r2(s.t0), to: r2(s.t1), freeze: r2(s.freeze),
      touches: [...(touches.get(s.index) || [])],
    })),
  };
}
