import { toCss } from '../core/util/color.js';
import { FONT } from './util.js';

/**
 * 地图绘制。所有几何在编译时已换算成画布像素折线（见 core/geo/map-entity.js），这里只负责描线与填色。
 * 层次由下到上：底色填充 → 省的高亮填充 → 省界 → 外轮廓（国界与海岸线）→ 南海诸岛 → 省名。
 *
 * 外轮廓怎么得到：每个省的环都画一遍，但只在“省界”样式下细细地画；再把整张图的并集轮廓用粗线描一次。
 * 并集轮廓靠 evenodd 裁剪得到：把所有省的路径放进同一个 path 里 fill，再用较粗的线描整个 path，
 * 最后用“省界”的细线盖掉内部边——内部公共边会被画两次（相邻省各一次），外边界只画一次。
 * 这里用更直接的办法：先用粗线画所有省的外环，再用底色（fill）的细线……不行，会吃掉底色。
 * 所以采用两遍描边：第一遍用 coast 粗线画所有环，第二遍用“省内部”的形式，把落在公共边上的线段擦回省界样式。
 * 公共边判定见 sharedEdges()：两个省共用的线段在坐标上完全相同（量化后），用端点对做哈希就能找到。
 */

const key = (a, b) => {
  const p = `${Math.round(a[0] * 4)},${Math.round(a[1] * 4)}`, q = `${Math.round(b[0] * 4)},${Math.round(b[1] * 4)}`;
  return p < q ? `${p}|${q}` : `${q}|${p}`;
};

/** 把所有省的环切成线段，按出现次数分成“公共边”（>=2 次，省界）与“外边”（1 次，国界 / 海岸线） */
function splitEdges(provinces) {
  const count = new Map();
  const segs = [];
  for (const p of provinces) {
    for (const ring of p.rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const k = key(ring[i], ring[i + 1]);
        count.set(k, (count.get(k) || 0) + 1);
        segs.push([ring[i], ring[i + 1], k]);
      }
    }
  }
  const inner = [], outer = [];
  for (const [a, b, k] of segs) (count.get(k) >= 2 ? inner : outer).push([a, b]);
  return { inner, outer };
}

const edgeCache = new WeakMap();
function edgesOf(item) {
  let e = edgeCache.get(item.provinces);
  if (!e) { e = splitEdges(item.provinces); edgeCache.set(item.provinces, e); }
  return e;
}

/**
 * 把一堆线段首尾相连成长折线再描：线段两两共享端点时直接 lineTo，不再 moveTo，
 * 所以转角处是一个连续的 lineJoin（圆角），不会出现“一段一段拼起来”的圆头虚线感。
 */
function strokeSegs(ctx, segs) {
  const k = (p) => `${Math.round(p[0] * 4)},${Math.round(p[1] * 4)}`;
  const next = new Map();
  for (let i = 0; i < segs.length; i++) {
    for (const end of [0, 1]) {
      const key = k(segs[i][end]);
      if (!next.has(key)) next.set(key, []);
      next.get(key).push(i);
    }
  }
  const used = new Uint8Array(segs.length);
  ctx.beginPath();
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    let [a, b] = segs[i];
    used[i] = 1;
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    // 向前追：找以 b 为端点、还没用过的线段，接着画
    for (;;) {
      const cand = (next.get(k(b)) || []).find((j) => !used[j]);
      if (cand === undefined) break;
      used[cand] = 1;
      const [p, q] = segs[cand];
      b = k(p) === k(b) ? q : p;
      ctx.lineTo(b[0], b[1]);
    }
  }
  ctx.stroke();
}

function ringPath(ctx, ring) {
  ctx.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
  ctx.closePath();
}

export function drawMap(ctx, item, pr) {
  const st = item.style;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 1. 底色：整个国土一块填充（先画，高亮盖在上面）
  ctx.fillStyle = toCss(item.fill);
  ctx.beginPath();
  for (const p of item.provinces) for (const r of p.rings) ringPath(ctx, r);
  ctx.fill();

  // 2. 高亮省
  const hi = item.provinces.filter((p) => p.hi);
  if (hi.length) {
    ctx.fillStyle = toCss(item.color, 0.35);
    ctx.beginPath();
    for (const p of hi) for (const r of p.rings) ringPath(ctx, r);
    ctx.fill();
  }

  const { inner, outer } = edgesOf(item);

  // 3. 省界（只画公共边）
  if (st.border && st.borderWidth > 0 && inner.length) {
    ctx.strokeStyle = toCss(st.border);
    ctx.lineWidth = st.borderWidth;
    if (st.dash && st.dash.length) ctx.setLineDash(st.dash.map((v) => v * Math.max(1, st.borderWidth)));
    strokeSegs(ctx, inner);
    ctx.setLineDash([]);
  }

  // 4. 外轮廓（国界与海岸线）：只画外边
  if (st.coast && st.coastWidth > 0) {
    ctx.strokeStyle = toCss(st.coast);
    ctx.lineWidth = st.coastWidth;
    strokeSegs(ctx, outer);
  }

  // 5. 南海诸岛 / 九段线：每段是一个闭合细长多边形，填实更清楚
  if (item.islands.length && st.island) {
    if (item.insetBox) {
      const b = item.insetBox;
      ctx.save();
      ctx.strokeStyle = toCss(st.border || st.island, 0.9);
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }
    // 九段线每段只有约 1° 长、很细：加一圈描边让它在小图里仍然看得清
    ctx.fillStyle = toCss(st.island);
    ctx.strokeStyle = toCss(st.island);
    ctx.lineWidth = Math.max(2, st.islandWidth * 1.1);
    for (const r of item.islands) {
      ctx.beginPath();
      ringPath(ctx, r);
      ctx.fill();
      ctx.stroke();
    }
  }

  // 6. 省名
  if (st.names) {
    const base = item.unit * (st.namesSize === 'large' ? 0.3 : st.namesSize === 'small' ? 0.17 : 0.22);
    ctx.fillStyle = toCss(item.color, 0.75);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${base}px ${FONT}`;
    for (const p of item.provinces) if (p.center && p.inRegion && ringsBig(p)) ctx.fillText(p.short, p.center[0], p.center[1]);
  }
}

/** 面积太小的省（港澳、天津……）不写名字，避免挤成一团 */
function ringsBig(p) {
  let best = 0;
  for (const r of p.rings) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    best = Math.max(best, Math.max(x1 - x0, y1 - y0));
  }
  return best > 28;
}
