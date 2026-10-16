import { evaluate } from '../runtime/evaluate.js';
import { SOLID, POSITIONAL, BOXED, BACKDROP } from '../lang/schema.js';
import { checkLayout } from './layout.js';

const r2 = (v) => Math.round(v * 100) / 100;
const effAlpha = (L) => L.alpha * L.ma;

const isCJK = (ch) => /[\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uffef]/.test(ch);

/** 估算文本宽度：中文方块字 ≈ 1 个字号，拉丁/数字 ≈ 0.56 个字号 */
function textWidth(text, size) {
  let w = 0;
  for (const ch of String(text ?? '')) w += (isCJK(ch) ? 1 : 0.56) * size;
  return w;
}

/** 实体的真实包围盒（世界坐标，含缩放）。text 用估算宽度，形状用 w/h/size；三角/星形按实际几何而非外接正方形。 */
export function aabb(e, L) {
  const x = L.x + L.ox, y = L.y + L.oy;
  let w, h;
  if (e.type === 'text') { w = textWidth(e.init.text, L.size); h = L.size; }
  else if (BOXED.has(e.type)) { w = L.w; h = L.h; }
  else if (e.type === 'triangle') { w = L.size * 0.92; h = L.size * 0.8; }
  else if (e.type === 'star') { w = L.size * 0.92; h = L.size * 0.92; }
  else { w = L.size; h = L.size; } // circle
  const hw = (w * L.sx) / 2, hh = (h * L.sy) / 2;
  return { l: x - hw, r: x + hw, t: y - hh, b: y + hh };
}

const offscreen = (scene, e, L) => {
  const b = aabb(e, L);
  return b.r < 0 || b.l > scene.width || b.b < 0 || b.t > scene.height;
};

/** 参与重叠检测的类型：实心图形 + 文字 + 图标 */
const OVERLAPPABLE = new Set([...SOLID, 'text', 'icon']);

/**
 * 采样检查：
 *  - 对象"跑出画布并留在外面"：出界后直到结束（或下一次回到画布）都还可见才报。
 *    飞出去并最终淡出 / 退场，是明确的退场意图，不报。
 *  - 每一步"冻结画面"里，同一图层、不同分组的实心图形 / 文字互相重叠（用真实包围盒）
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
    if (!POSITIONAL.has(e.type) || e.type === 'camera' || e.type === 'emitter') return;
    let first = -1;
    for (let k = 0; k < frames.length; k++) {
      const L = frames[k].f.entities[i];
      if (!L.hidden && effAlpha(L) >= 0.02 && offscreen(scene, e, L)) { first = k; break; }
    }
    if (first < 0) return;
    for (let k = first; k < frames.length; k++) {
      const L = frames[k].f.entities[i];
      const stillOut = !L.hidden && effAlpha(L) >= 0.02 && offscreen(scene, e, L);
      if (!stillOut) return;
    }
    const L = frames[first].f.entities[i];
    out.push({
      severity: 'warning', code: 'W_OFFSCREEN', line: e.line, col: e.col, id: e.id,
      message: `对象 "${e.id}" 在 ${r2(frames[first].t)}s 时跑出了画布并一直留在外面 (${Math.round(L.x + L.ox)}, ${Math.round(L.y + L.oy)})`,
    });
  });

  // ---- 静帧检查时刻：每一步的 freeze；没有 step 时也检查 t=0 ----
  const checks = scene.steps.length ? scene.steps.map((s) => s.freeze) : [0];

  // ---- 超框：静帧里元素包围盒明显超出画布边界 ----
  {
    const seen = new Set();
    for (const t of checks) {
      const frame = evaluate(scene, t);
      for (const e of scene.entities) {
        if (!POSITIONAL.has(e.type) || e.type === 'camera' || e.type === 'emitter') continue;
        const L = frame.entities[e.index];
        if (L.hidden || effAlpha(L) < 0.02) continue;
        const b = aabb(e, L);
        const M = 4; // 容差：贴边不算
        if (b.l < -M || b.r > scene.width + M || b.t < -M || b.b > scene.height + M) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          out.push({
            severity: 'warning', code: 'W_OVERFLOW', line: e.line, col: e.col, id: e.id,
            message: `对象 "${e.id}" 超出了画布边界（包围盒 [${Math.round(b.l)},${Math.round(b.t)}]~[${Math.round(b.r)},${Math.round(b.b)}]，画布 ${scene.width}×${scene.height}）`,
          });
        }
      }
    }
  }

  // ---- 重叠：同一图层、不同分组的实心图形 / 文字互相重叠（真实包围盒） ----
  const items = scene.entities.filter((e) => OVERLAPPABLE.has(e.type));
  if (scene.overlapCheck && items.length && items.length <= 400) {
    const seen = new Set();
    for (const t of checks) {
      const frame = evaluate(scene, t);
      const vis = items
        .map((e) => ({ e, L: frame.entities[e.index], b: aabb(e, frame.entities[e.index]) }))
        .filter(({ L }) => !L.hidden && effAlpha(L) > 0.5);
      for (let a = 0; a < vis.length; a++) {
        for (let b = a + 1; b < vis.length; b++) {
          const A = vis[a], B = vis[b];
          if (A.e.layer !== B.e.layer) continue;
          if (A.e.groups.some((g) => B.e.groups.includes(g))) continue;
          const key = `${A.e.id}|${B.e.id}`;
          if (seen.has(key)) continue;
          // 相交深度须超过较小边长的 25%，视为"明显重叠"（贴边/轻微接触不算）
          const dx = Math.min(A.b.r, B.b.r) - Math.max(A.b.l, B.b.l);
          const dy = Math.min(A.b.b, B.b.b) - Math.max(A.b.t, B.b.t);
          const minW = Math.min(A.b.r - A.b.l, B.b.r - B.b.l);
          const minH = Math.min(A.b.b - A.b.t, B.b.b - B.b.t);
          if (dx > minW * 0.25 && dy > minH * 0.25) {
            seen.add(key);
            out.push({
              severity: 'warning', code: 'W_OVERLAP', line: B.e.line, col: B.e.col, ids: [A.e.id, B.e.id],
              message: `"${A.e.id}" 与 "${B.e.id}" 重叠了（在 ${r2(t)}s 的画面里）`,
            });
          }
        }
      }
    }
  }
  out.push(...checkLayout(scene, checks, evaluate));
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
