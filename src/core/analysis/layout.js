import { SOLID, POSITIONAL, SEGMENTED } from '../lang/schema.js';
import { shapeSdf } from '../runtime/links.js';
import { labelFontSize, MIN_READABLE_LABEL } from '../util/label.js';
import { aabb } from './lint.js';

/**
 * 版式检查：这一类问题肉眼一看就“不对劲”，但只靠“有没有重叠 / 出没出界”抓不到——
 *  1. 文字压着容器边缘或溢出容器（卡片里的字、面板标题）
 *  2. 连线的端点被别的图形盖住 / 离目标图形还有一段空隙（箭头断连）
 *  3. 图形里的 label 太长，被压得小到看不清
 * 全部在“每一步的静帧”上检查。lint() 会调用 checkLayout() 并合并结果。
 */

const r1 = (v) => Math.round(v * 10) / 10;
const effAlpha = (L) => L.alpha * L.ma;
const CONTAINERS = new Set(['rect', 'ellipse', 'circle']);

/** 与 render/ir.js 同样的绘制次序：图层 z → 层内 z → 声明顺序 */
function orderKey(scene, frame, e) {
  const L = frame.entities[e.index];
  const lz = e.layer >= 0 ? frame.entities[e.layer].z : 0;
  return [lz, L.z, e.index];
}
const above = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

const areaOf = (e, L) => {
  const b = aabb(e, L);
  return (b.r - b.l) * (b.b - b.t);
};

/** 文字包围盒的 8 个关键点（四角 + 四边中点）在容器内的最小深度；<0 表示有部分在容器外 */
function insetOf(sdf, b) {
  const xs = [b.l, (b.l + b.r) / 2, b.r], ys = [b.t, (b.t + b.b) / 2, b.b];
  let depth = Infinity;
  for (const x of xs) for (const y of ys) if (!(x === xs[1] && y === ys[1])) depth = Math.min(depth, -sdf(x, y));
  return depth;
}

export function checkLayout(scene, checks, evaluate) {
  const out = [];
  const seen = new Set();
  const U = scene.unit;
  const canvasArea = scene.width * scene.height;
  const push = (key, d) => { if (!seen.has(key)) { seen.add(key); out.push(d); } };

  for (const t of checks) {
    const frame = evaluate(scene, t);
    const vis = (e) => {
      const L = frame.entities[e.index];
      return !L.hidden && effAlpha(L) > 0.5;
    };

    // ---- 1. 文字 vs 容器 ----
    const texts = scene.entities.filter((e) => (e.type === 'text' || e.type === 'icon') && !e.internal && vis(e));
    const boxes = scene.entities.filter((e) => CONTAINERS.has(e.type) && vis(e));
    for (const tx of texts) {
      const Lt = frame.entities[tx.index];
      const tb = aabb(tx, Lt);
      const cx = (tb.l + tb.r) / 2, cy = (tb.t + tb.b) / 2;
      const ta = (tb.r - tb.l) * (tb.b - tb.t);
      let best = null;
      for (const c of boxes) {
        const Lc = frame.entities[c.index];
        const a = areaOf(c, Lc);
        if (a < ta * 0.35 || a > canvasArea * 0.6) continue; // 远小于文字（圆点、角标）/ 整张背景板：不算容器；比文字小但相近的仍要查，那正是“文字撑出容器”
        const sdf = shapeSdf(c, Lc);
        if (sdf(cx, cy) >= 0) continue;                      // 文字中心不在里面：与它无关
        if (!best || a < best.a) best = { c, a, sdf };
      }
      if (!best) continue;
      const need = Math.max(4, Lt.size * 0.18);
      const inset = insetOf(best.sdf, tb);
      if (inset < 0) {
        push(`ov|${tx.id}|${best.c.id}`, {
          severity: 'warning', code: 'W_TEXT_OVERFLOW', line: tx.line, col: tx.col, id: tx.id, ids: [tx.id, best.c.id],
          message: `文字 "${tx.id}" 超出了容器 "${best.c.id}" 的边缘 ${r1(-inset)}px（在 ${r1(t)}s 的画面里）`,
          hint: '缩小字号、放大容器，或用 off="dx,dy" 调整位置（at 的小数按行高列宽算，和 .3c 这种 c 单位对不齐）',
        });
      } else if (inset < need) {
        push(`tt|${tx.id}|${best.c.id}`, {
          severity: 'warning', code: 'W_TEXT_TIGHT', line: tx.line, col: tx.col, id: tx.id, ids: [tx.id, best.c.id],
          message: `文字 "${tx.id}" 离容器 "${best.c.id}" 的边缘只有 ${r1(inset)}px，没有留出边距（至少 ${r1(need)}px，约字号的 18%）`,
          hint: '给卡片留出内边距：容器放大一点，或字号 / 位置收一收',
        });
      }
    }

    // ---- 2. 连线端点：只检查“连接两个图形的连线” ----
    // 判定为“连接线”：两端各自贴近（near 以内）一个不同的图形，且两端都在图形外面或边缘上。
    // 棋盘线（端点藏在棋子下）、从棋子中心出发的标注箭头、井字棋的叉，端点在图形内部，所以不会被误判。
    const solids = scene.entities.filter((e) => SOLID.has(e.type) && vis(e));
    const lines = scene.entities.filter((e) => SEGMENTED.has(e.type) && !e.internal && vis(e) && frame.entities[e.index].draw > 0.99);
    const near = Math.min(Math.max(U * 0.3, 24), 48);   // 离图形边缘这么近，才认为这一端“想连到”它
    const standoff = Math.max(U * 0.08, 8);              // 此距离内的空隙算“有意留的间距”
    for (const ln of lines) {
      const L = frame.entities[ln.index];
      const lineKey = orderKey(scene, frame, ln);
      const ends = [[L.x1 + L.ox, L.y1 + L.oy], [L.x2 + L.ox, L.y2 + L.oy]];
      const info = ends.map(([px, py]) => {
        let best = null;
        for (const s of solids) {
          const Ls = frame.entities[s.index];
          if (areaOf(s, Ls) > canvasArea * 0.25) continue;  // 背景板不算连线目标
          const d = shapeSdf(s, Ls)(px, py);                  // <0 在内部，>0 在外部
          if (!best || Math.abs(d) < Math.abs(best.d)) best = { s, d };
        }
        return best;
      });

      // 箭头尖被盖住：终点钻进了一个画在箭头上面的图形里，箭头头部看不见，像是没连上
      const tip = info[1];
      if (ln.type === 'arrow' && tip && tip.d < -2 && above(orderKey(scene, frame, tip.s), lineKey) > 0) {
        push(`cv|${ln.id}`, {
          severity: 'warning', code: 'W_LINE_COVERED', line: ln.line, col: ln.col, id: ln.id, ids: [ln.id, tip.s.id],
          message: `箭头 "${ln.id}" 的尖端钻进了 "${tip.s.id}" 里 ${r1(-tip.d)}px，被它盖住了，看起来像断开`,
          hint: `用对象 id 绑定：<arrow from="…" to="${tip.s.id}"/>，箭头会自动停在边缘上`,
        });
      }

      // 没接上：连接两个不同图形的连线，有一端离边缘太远
      const connector = info.every((h) => h && h.d >= -2 && h.d <= near) && info[0].s !== info[1].s;
      if (connector) {
        info.forEach((hit, k) => {
          if (hit.d > standoff) {
            push(`gp|${ln.id}|${k}`, {
              severity: 'warning', code: 'W_LINE_GAP', line: ln.line, col: ln.col, id: ln.id, ids: [ln.id, hit.s.id],
              message: `连线 "${ln.id}" 的${k === 0 ? '起点' : '终点'}离 "${hit.s.id}" 的边缘还有 ${r1(hit.d)}px，没有接上`,
              hint: `用对象 id 绑定：<${ln.type} from="${info[0].s.id}" to="${info[1].s.id}"/>，端点会自动贴在边缘上`,
            });
          }
        });
      }
    }

    // ---- 3. 图形里的 label 被压得太小 ----
    for (const e of solids) {
      const L = frame.entities[e.index];
      if (!L.label) continue;
      const fs = labelFontSize(e.type, L.w, L.h, L.label) * Math.max(L.sx, L.sy);
      if (fs < MIN_READABLE_LABEL) {
        push(`lb|${e.id}`, {
          severity: 'warning', code: 'W_LABEL_SMALL', line: e.line, col: e.col, id: e.id,
          message: `"${e.id}" 的 label "${L.label}" 太长，被压到 ${r1(fs)}px，看不清`,
          hint: '加大图形、缩短文字，或把文字改成单独的 <text>',
        });
      }
    }
  }
  return out;
}
