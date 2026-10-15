import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/core/compile/targets.js';
let t = readFileSync(file, 'utf8');
const crlf = t.includes('\r\n');
t = t.replace(/\r\n/g, '\n');

const cut = (from, to, replacement) => {
  const i = t.indexOf(from), j = t.indexOf(to);
  if (i < 0 || j < 0 || j < i) throw new Error(`找不到区间：${from.slice(0, 20)} … ${to.slice(0, 20)}`);
  t = t.slice(0, i) + replacement + t.slice(j);
};
const swap = (a, b) => {
  if (!t.includes(a)) throw new Error(`找不到：${a.slice(0, 40)}`);
  t = t.replace(a, b);
};

// 1) 旧的 polyLen / makePath 整段删除
cut('// ---------------- 路径 ----------------', 'const halfOf =',
  '// ---------------- 路径 ----------------\n// 路径与尾迹统一用 util/path.js 的“按弧长参数化”实现：圆心与尾迹笔尖用同一个参数，永远重合。\n\n');

swap("import { mix } from '../util/color.js';", "import { mix } from '../util/color.js';\nimport { buildPath, trailSamples } from '../util/path.js';");

// 2) 尾迹
cut('function makeTrail(', '// ---------------- 登场 ----------------', `function makeTrail(ctx, ent, node, path, dur, start, ease, r) {
  const { scene } = ctx;
  const st = ctx.state.get(ent.id);
  const color = r.has('trail') && r.raw('trail').trim() ? r.color('trail', st.fill) : st.fill;
  // 采样点按弧长均匀分布、间距约 2px：折线本身已是光滑曲线，draw 进度 = 弧长比例 = 圆心位置
  const pts = path.sample(trailSamples(path.length));
  const id = \`\${ent.id}~trail\${++ctx.auto}\`;
  const trace = {
    index: scene.entities.length, id, type: 'trace', line: node.line, col: node.col,
    layer: ent.layer, groups: [], birth: start, death: Infinity, pts, internal: true, owner: ent.index,
    init: {
      x: 0, y: 0, size: 0, w: 0, h: 0, rot: 0, fill: [0, 0, 0, 0], stroke: color,
      width: Math.max(3, Math.min(ent.init.size * 0.1, 8)), color: [255, 255, 255, 1],
      draw: 0, x1: 0, y1: 0, x2: 0, y2: 0, text: '', label: '', alpha: 0.6, z: (ent.init.z ?? 0) - 1,
    },
  };
  scene.entities.push(trace);
  scene.byId.set(id, trace);
  ctx.state.set(id, { ...trace.init });
  seg(ctx, trace, {
    t0: start, dur, kind: 'move', props: ['draw'], tag: node.tag, line: node.line, col: node.col, internal: true,
    fn: (L, p) => { L.draw = ease(p); },
  });
}

`);

// 3) orbit 尾迹
swap(`        if (r.has('trail')) {
          makeTrail(ctx, ent, node, (q) => {
            const a = fromAngle + turns * Math.PI * 2 * q;
            return [acx + rad * Math.cos(a), acy + rad * Math.sin(a)];
          }, dur, start, ease, r);
        }`, `        if (r.has('trail')) {
          const arc = {
            length: Math.abs(turns) * Math.PI * 2 * rad,
            at: (q) => { const a = fromAngle + turns * Math.PI * 2 * q; return [acx + rad * Math.cos(a), acy + rad * Math.sin(a)]; },
          };
          arc.sample = (n) => Array.from({ length: n + 1 }, (_, i) => arc.at(i / n));
          makeTrail(ctx, ent, node, arc, dur, start, ease, r);
        }`);

// 4) 移动
swap(`      const fn = makePath(pts, r.flag('smooth'));
      const total = polyLen(pts);`, `      const path = buildPath(pts, r.flag('smooth'));
      const fn = path.at;
      const total = path.length;`);
swap("if (r.has('trail')) makeTrail(ctx, ent, node, fn, mdur, start, ease, r);", "if (r.has('trail')) makeTrail(ctx, ent, node, path, mdur, start, ease, r);");

writeFileSync(file, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('targets.js 已更新');
