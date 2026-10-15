import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/core/analysis/layout.js';
let t = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const i = t.indexOf('    // ---- 2. 连线端点 ----');
const j = t.indexOf('    // ---- 3. 图形里的 label');
if (i < 0 || j < 0) throw new Error('找不到区间');

const block = `    // ---- 2. 连线端点：只检查“连接两个图形的连线” ----
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
        push(\`cv|\${ln.id}\`, {
          severity: 'warning', code: 'W_LINE_COVERED', line: ln.line, col: ln.col, id: ln.id, ids: [ln.id, tip.s.id],
          message: \`箭头 "\${ln.id}" 的尖端钻进了 "\${tip.s.id}" 里 \${r1(-tip.d)}px，被它盖住了，看起来像断开\`,
          hint: \`用对象 id 绑定：<arrow from="…" to="\${tip.s.id}"/>，箭头会自动停在边缘上\`,
        });
      }

      // 没接上：连接两个不同图形的连线，有一端离边缘太远
      const connector = info.every((h) => h && h.d >= -2 && h.d <= near) && info[0].s !== info[1].s;
      if (connector) {
        info.forEach((hit, k) => {
          if (hit.d > standoff) {
            push(\`gp|\${ln.id}|\${k}\`, {
              severity: 'warning', code: 'W_LINE_GAP', line: ln.line, col: ln.col, id: ln.id, ids: [ln.id, hit.s.id],
              message: \`连线 "\${ln.id}" 的\${k === 0 ? '起点' : '终点'}离 "\${hit.s.id}" 的边缘还有 \${r1(hit.d)}px，没有接上\`,
              hint: \`用对象 id 绑定：<\${ln.type} from="\${info[0].s.id}" to="\${info[1].s.id}"/>，端点会自动贴在边缘上\`,
            });
          }
        });
      }
    }

`;
t = t.slice(0, i) + block + t.slice(j);
writeFileSync(file, t, 'utf8');
console.log('layout.js 已收紧');
