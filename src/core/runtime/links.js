import { BOXED } from '../lang/schema.js';

/**
 * 绑定连线：<arrow from="a" to="b"/> 的端点引用对象 id，而不是写死坐标。
 * 每一帧都按两个对象“此刻”的位置、大小重新算端点，并裁到各自的轮廓上（再留出 gap 的间距），所以
 *  - 箭头尖永远贴在目标边缘，不会被目标盖住，也不会悬空；
 *  - 对象移动 / 缩放 / 脉冲时，连线跟着走，不会断开。
 */

const dist = (x, y) => Math.hypot(x, y);

/** 对象在当前帧的凸轮廓：返回 sdf(px,py)，<0 表示在内部（世界坐标，已含缩放与偏移） */
export function shapeSdf(e, L) {
  const cx = L.x + L.ox, cy = L.y + L.oy;
  const sx = L.sx || 1, sy = L.sy || 1;
  if (e.type === 'circle' || e.type === 'ring') {
    const r = (L.size / 2) * Math.max(sx, sy);
    return (px, py) => dist(px - cx, py - cy) - r;
  }
  if (e.type === 'ellipse') {
    const a = Math.max(1e-6, (L.w / 2) * sx), b = Math.max(1e-6, (L.h / 2) * sy);
    // 椭圆的近似距离：对 (x/a, y/b) 的单位圆距离再乘以较小半轴，足够用于求零点
    return (px, py) => (dist((px - cx) / a, (py - cy) / b) - 1) * Math.min(a, b);
  }
  if (e.type === 'rect') {
    const hw = (L.w / 2) * sx, hh = (L.h / 2) * sy;
    const r = Math.min(e.radius >= 0 ? e.radius : Math.min(L.w, L.h) * 0.2, hw, hh);
    return (px, py) => {
      const qx = Math.abs(px - cx) - (hw - r), qy = Math.abs(py - cy) - (hh - r);
      return dist(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    };
  }
  // 三角 / 星形 / 文字 / 图标：取近似外接圆
  const base = BOXED.has(e.type) ? Math.max(L.w, L.h) : L.size;
  const r = (e.type === 'text' || e.type === 'icon' ? base * 0.5 : base * 0.46) * Math.max(sx, sy);
  return (px, py) => dist(px - cx, py - cy) - r;
}

/** 从 (cx,cy) 出发沿单位方向 (dx,dy)，射线穿出轮廓的点（凸形，二分求解） */
function exitPoint(sdf, cx, cy, dx, dy, limit) {
  let lo = 0, hi = Math.max(8, limit);
  while (sdf(cx + dx * hi, cy + dy * hi) < 0 && hi < 1e6) hi *= 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (sdf(cx + dx * mid, cy + dy * mid) < 0) lo = mid; else hi = mid;
  }
  return [cx + dx * hi, cy + dy * hi];
}

/**
 * 求绑定连线的两个端点。a / b 为 { e, L } 或固定点 [x,y]。
 * 端点 = 中心连线与轮廓的交点，再沿连线向外退 gap。
 */
export function linkEndpoints(from, to, gap) {
  const center = (s) => (Array.isArray(s) ? s : [s.L.x + s.L.ox, s.L.y + s.L.oy]);
  const [ax, ay] = center(from), [bx, by] = center(to);
  const len = dist(bx - ax, by - ay);
  if (len < 1e-6) return { x1: ax, y1: ay, x2: bx, y2: by };
  const ux = (bx - ax) / len, uy = (by - ay) / len;
  let p = [ax, ay], q = [bx, by];
  if (!Array.isArray(from)) {
    const sdf = shapeSdf(from.e, from.L);
    if (sdf(ax, ay) < 0) p = exitPoint(sdf, ax, ay, ux, uy, len);
    p = [p[0] + ux * gap, p[1] + uy * gap];
  }
  if (!Array.isArray(to)) {
    const sdf = shapeSdf(to.e, to.L);
    if (sdf(bx, by) < 0) q = exitPoint(sdf, bx, by, -ux, -uy, len);
    q = [q[0] - ux * gap, q[1] - uy * gap];
  }
  return { x1: p[0], y1: p[1], x2: q[0], y2: q[1] };
}

/** evaluate 的后处理：把所有绑定连线的端点写进当前帧 */
export function applyLinks(scene, ents) {
  if (!scene.links?.length) return;
  for (const k of scene.links) {
    const out = ents[k.ent];
    const from = k.from.ref >= 0 ? { e: scene.entities[k.from.ref], L: ents[k.from.ref] } : [out.x1, out.y1];
    const to = k.to.ref >= 0 ? { e: scene.entities[k.to.ref], L: ents[k.to.ref] } : [out.x2, out.y2];
    Object.assign(out, linkEndpoints(from, to, k.gap));
  }
}
