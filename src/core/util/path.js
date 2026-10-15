/**
 * 路径：按弧长参数化的折线 / 平滑曲线。
 *
 * 为什么必须按弧长：
 *  - 圆沿路径走、尾迹随之“长出来”，两者必须用同一个参数，圆心才永远在尾迹的笔尖上；
 *  - 样条若按“第几段”计时，段长不同速度就不同，路标处还会突变（看起来“不顺滑”）。
 *
 * 平滑曲线用 centripetal Catmull-Rom（alpha = 0.5）：点距悬殊也不会出现环、尖角或过冲。
 */

const EPS = 1e-6;
const SEG_SAMPLES = 40; // 每段曲线用于建立弧长表的细分数

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * 给每一段加弧度：在相邻两点的中点向连线的左侧（行进方向的左手边）凸出 bulge × 段长，
 * 返回新的点列（含原点与插入的中点）。bulge 为负则向右凸；0 不变。
 * 常用 0.12~0.25：旅行飞线微微弯一点，像大圆航线。
 */
export function bulgePoints(pts, bulge) {
  if (!bulge || pts.length < 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      // 左手边法线（画布 y 向下时，行进方向 (dx,dy) 的左侧是 (dy,-dx)）
      out.push([(a[0] + b[0]) / 2 + (dy / len) * len * bulge, (a[1] + b[1]) / 2 - (dx / len) * len * bulge]);
    }
    out.push(b);
  }
  return out;
}

/** 去掉连续重复点（距离 < 0.01px）。起点与首个路标重合是最常见的情况 */
export function dedupe(pts) {
  const out = [];
  for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > 0.01) out.push(p);
  return out;
}

/** Barry–Goldman 递推：给定 4 个控制点与节点值，求参数 t 处的点 */
function centripetal(p0, p1, p2, p3, t) {
  const k = (a, b) => Math.sqrt(dist(a, b)) || EPS;
  const t0 = 0, t1 = t0 + k(p0, p1), t2 = t1 + k(p1, p2), t3 = t2 + k(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const lerp2 = (a, b, ta, tb) => [0, 1].map((i) => a[i] * ((tb - tt) / (tb - ta)) + b[i] * ((tt - ta) / (tb - ta)));
  const a1 = lerp2(p0, p1, t0, t1), a2 = lerp2(p1, p2, t1, t2), a3 = lerp2(p2, p3, t2, t3);
  const b1 = lerp2(a1, a2, t0, t2), b2 = lerp2(a2, a3, t1, t3);
  return lerp2(b1, b2, t1, t2);
}

/**
 * @param {number[][]} input 路径点（像素坐标）
 * @param {boolean} smooth 是否平滑成曲线
 * @returns {{ at:(q:number)=>number[], length:number, sample:(n:number)=>number[][] }}
 *   at(q)：q 为弧长比例，0=起点 1=终点；q 越界时沿端点切线外推（让 back / spring 等过冲缓动真的冲出去）
 */
export function buildPath(input, smooth = false) {
  const pts = dedupe(input.map((p) => [p[0], p[1]]));
  if (pts.length < 2) {
    const p = pts[0] || [0, 0];
    return { at: () => [p[0], p[1]], length: 0, sample: (n) => Array.from({ length: n + 1 }, () => [p[0], p[1]]) };
  }

  // ---- 折线 ----
  if (!smooth || pts.length === 2) {
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + dist(pts[i - 1], pts[i]));
    const total = lens[lens.length - 1];
    const at = (q) => {
      const d = q * total;
      let i = 1;
      while (i < pts.length - 1 && d > lens[i]) i++;
      const span = lens[i] - lens[i - 1];
      let u = (d - lens[i - 1]) / span;
      if (i > 1 && u < 0) u = 0;               // 只有首段允许 u < 0（起点之前外推）
      if (i < pts.length - 1 && u > 1) u = 1;   // 只有末段允许 u > 1（终点之后外推）
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
    };
    return { at, length: total, sample: (n) => Array.from({ length: n + 1 }, (_, i) => at(i / n)) };
  }

  // ---- 平滑曲线：端点用反射的“幽灵点”，避免端点处切线被压平 ----
  const n = pts.length;
  const ghost0 = [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
  const ghost1 = [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]];
  const P = [ghost0, ...pts, ghost1];
  const segPoint = (i, t) => centripetal(P[i], P[i + 1], P[i + 2], P[i + 3], t);

  // 弧长表：table[k] = { seg, t, len }，覆盖整条曲线
  const table = [{ seg: 0, t: 0, len: 0 }];
  let prev = pts[0], total = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let s = 1; s <= SEG_SAMPLES; s++) {
      const t = s / SEG_SAMPLES;
      const p = segPoint(i, t);
      total += dist(prev, p);
      table.push({ seg: i, t, len: total });
      prev = p;
    }
  }

  const pointAtLen = (d) => {
    // 二分查找所在细分区间，区间内按长度线性插参数，再回到样条上求精确点
    let lo = 0, hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid].len < d) lo = mid; else hi = mid;
    }
    const a = table[lo], b = table[hi];
    const span = b.len - a.len;
    const f = span > EPS ? (d - a.len) / span : 0;
    // a、b 可能跨段边界（a.t=1 与 b 属于下一段 t 从 0 开始）：统一换算成 b 所在段内的参数
    const seg = b.seg;
    const ta = a.seg === seg ? a.t : 0;
    return segPoint(seg, ta + (b.t - ta) * f);
  };

  const at = (q) => {
    const d = q * total;
    if (d > 0 && d < total) return pointAtLen(d);
    // 越界：沿端点切线外推（切线取端点附近 1px 的弦方向）
    const start = d <= 0;
    const edge = start ? pts[0] : pts[n - 1];
    const near = pointAtLen(start ? Math.min(total, 1) : Math.max(0, total - 1));
    const len = dist(edge, near) || 1;
    const dir = start ? [(near[0] - edge[0]) / len, (near[1] - edge[1]) / len] : [(edge[0] - near[0]) / len, (edge[1] - near[1]) / len];
    const over = start ? d : d - total; // 起点前为负，终点后为正
    return [edge[0] + dir[0] * over, edge[1] + dir[1] * over];
  };
  return { at, length: total, sample: (m) => Array.from({ length: m + 1 }, (_, i) => at(i / m)) };
}

/**
 * 路径在比例 q 处的行进方向（弧度，x 轴正向为 0，y 向下为正，和画布一致）。
 * 取前后各 span 像素的弦方向，转弯处比逐点切线平顺；路径长度为 0 时返回 null（保持原朝向）。
 */
export function headingAt(path, q, span = 8) {
  if (!(path.length > 1e-6)) return null;
  const d = span / path.length;
  const a = path.at(Math.max(0, q - d)), b = path.at(Math.min(1, q + d));
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.hypot(dx, dy) < 1e-6 ? null : Math.atan2(dy, dx);
}

/** 两个角度之间走最短弧（避免 179° → -179° 这种瞬间转大半圈） */
export function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}

/** 一条尾迹需要多少采样点：约每 2px 一个，保证放大后也是光滑曲线，不出现折线棱角 */
export const trailSamples = (length) => Math.max(48, Math.min(900, Math.ceil(length / 2)));

/**
 * 尾迹按进度 draw（0~1）“长出来”：返回已画出的折线（最后一个点就是笔尖）。
 * 采样点沿弧长均匀分布，所以进度直接对应点序号——渲染器与测试共用这一个实现，笔尖位置只有一个答案。
 */
export function tracePoints(pts, draw) {
  const n = pts.length - 1;
  if (n < 1 || !(draw > 0)) return [];
  const u = Math.min(1, draw) * n;
  const i = Math.min(n - 1, Math.floor(u));
  const f = u - i;
  const out = pts.slice(0, i + 1);
  out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]);
  return out;
}
