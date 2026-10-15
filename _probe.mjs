import { readFileSync } from 'node:fs';
import { compile, evaluate } from './src/core/index.js';
import { tracePoints } from './src/core/util/path.js';

const load = (f) => compile(readFileSync(new URL(`./examples/${f}`, import.meta.url), 'utf8')).scene;

// 1) 拖尾头 vs 圆心
{
  const sc = load('site/path.xml');
  const trace = sc.entities.find((e) => e.type === 'trace');
  const owner = sc.byId.get('a');
  const seg = sc.segments.find((s) => s.ent === trace.index);
  let worst = 0, worstT = 0;
  for (let k = 0; k <= 60; k++) {
    const t = seg.t0 + (seg.dur * k) / 60;
    const f = evaluate(sc, t);
    const L = f.entities[trace.index], O = f.entities[owner.index];
    const part = tracePoints(trace.pts, L.draw);
    const [hx, hy] = part.length ? part.at(-1) : trace.pts[0];
    const d = Math.hypot(hx - (O.x + O.ox), hy - (O.y + O.oy));
    if (d > worst) { worst = d; worstT = t; }
  }
  console.log('path.xml 拖尾头与圆心最大偏差 px =', worst.toFixed(2), '@t=', worstT.toFixed(2), ' 采样点数 =', trace.pts.length);
  // 折角：相邻采样段方向变化
  const pts = trace.pts;
  let maxTurn = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
    maxTurn = Math.max(maxTurn, d);
  }
  console.log('  尾迹折线最大相邻转角 (度) =', (maxTurn * 180 / Math.PI).toFixed(1));
  // 速度均匀度
  const mv = sc.segments.find((s) => s.ent === owner.index && s.kind === 'move');
  const sp = [];
  for (let k = 0; k < 40; k++) {
    const t1 = mv.t0 + mv.dur * k / 40, t2 = mv.t0 + mv.dur * (k + 1) / 40;
    const A = evaluate(sc, t1).entities[owner.index], B = evaluate(sc, t2).entities[owner.index];
    sp.push(Math.hypot(B.x - A.x, B.y - A.y));
  }
  console.log('  匀速段位移比 max/min (soft 缓动两头慢属正常，只看中段) =', (Math.max(...sp.slice(10, 30)) / Math.min(...sp.slice(10, 30))).toFixed(2));
}

// 2) 流程图连线端点是否落在节点边界
{
  const sc = load('product/request-flow.xml');
  const f = evaluate(sc, sc.steps[4].freeze);
  const get = (id) => { const e = sc.byId.get(id); return [e, f.entities[e.index]]; };
  for (let i = 0; i < 3; i++) {
    const [ea, la] = get(`a${i}`);
    const [, nA] = get(`n${i}`); const [, nB] = get(`n${i + 1}`);
    const rightA = nA.x + nA.w / 2, leftB = nB.x - nB.w / 2;
    console.log(`连线 a${i}: from x=${la.x1.toFixed(1)} to x=${la.x2.toFixed(1)} | 左节点右边缘=${rightA.toFixed(1)} 右节点左边缘=${leftB.toFixed(1)} | 起点离边缘=${(la.x1 - rightA).toFixed(1)} 终点相对右节点左边缘=${(la.x2 - leftB).toFixed(1)}`);
  }
}

// 3) 识字：卡片内边距
{
  const sc = load('kids/literacy.xml');
  const f = evaluate(sc, sc.steps[0].freeze);
  const g = (id) => f.entities[sc.byId.get(id).index];
  const bg = g('k0_bg'), ch = g('k0_ch'), py = g('k0_py');
  const top = bg.y - bg.h / 2, bot = bg.y + bg.h / 2;
  console.log(`识字卡片 h=${bg.h.toFixed(0)} | 汉字字号=${ch.size.toFixed(0)} 中心偏移=${(ch.y - bg.y).toFixed(0)} | 拼音字号=${py.size.toFixed(0)} 中心偏移=${(py.y - bg.y).toFixed(0)}`);
  console.log(`  汉字上边距=${(ch.y - ch.size / 2 - top).toFixed(1)} 汉字与拼音间距=${(py.y - py.size / 2 - (ch.y + ch.size / 2)).toFixed(1)} 拼音下边距=${(bot - (py.y + py.size / 2)).toFixed(1)}`);
}
