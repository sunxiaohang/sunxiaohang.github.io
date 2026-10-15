import { readFileSync, writeFileSync } from 'node:fs';

function patch(file, fn) {
  let t = readFileSync(file, 'utf8');
  const crlf = t.includes('\r\n');
  t = t.replace(/\r\n/g, '\n');
  const swap = (a, b, all = false) => {
    if (!t.includes(a)) throw new Error(`${file} 找不到：${a.slice(0, 50)}`);
    t = all ? t.split(a).join(b) : t.replace(a, b);
  };
  fn(swap);
  writeFileSync(file, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('已更新', file);
}

patch('src/core/analysis/layout.js', (swap) => {
  swap("        if (a < ta * 1.2 || a > canvasArea * 0.6) continue; // 比文字还小 / 整张背景板：不算容器",
    "        if (a < ta * 0.35 || a > canvasArea * 0.6) continue; // 远小于文字（圆点、角标）/ 整张背景板：不算容器；比文字小但相近的仍要查，那正是“文字撑出容器”");
});

patch('test/layout.test.js', (swap) => {
  // 路径：匀速 —— 用累计弧长对比，避免折线转角处取弦长的误差
  swap(`test('路径：折线与平滑曲线都按弧长匀速（相等的 q 增量 = 相等的走过距离）', () => {
  const pts = [[100, 400], [260, 100], [520, 400], [700, 120]];
  for (const smooth of [false, true]) {
    const p = buildPath(pts, smooth);
    const step = [];
    for (let k = 0; k < 100; k++) step.push(dist(p.at(k / 100), p.at((k + 1) / 100)));
    const avg = step.reduce((a, b) => a + b, 0) / step.length;
    for (const s of step) assert.ok(Math.abs(s - avg) < avg * 0.06, \`smooth=\${smooth} 速度不均：\${s.toFixed(2)} vs \${avg.toFixed(2)}\`);
    near(dist(p.at(0), pts[0]), 0, 1e-6);
    near(dist(p.at(1), pts.at(-1)), 0, 1e-6);
  }
});`, `test('路径：折线与平滑曲线都按弧长参数化（走到 q 时，实际走过的路程 = q × 总长）', () => {
  const pts = [[100, 400], [260, 100], [520, 400], [700, 120]];
  for (const smooth of [false, true]) {
    const p = buildPath(pts, smooth);
    // 用 4000 个细分累计真实弧长，再检查 q = 0.1 … 0.9 处是否在 q × 总长 上
    const N = 4000, cum = [0];
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + dist(p.at((i - 1) / N), p.at(i / N)));
    assert.ok(Math.abs(cum[N] - p.length) < p.length * 0.002, \`smooth=\${smooth} 总长不一致：\${cum[N]} vs \${p.length}\`);
    for (let q = 0.1; q < 0.95; q += 0.1) {
      const walked = cum[Math.round(q * N)];
      assert.ok(Math.abs(walked - q * p.length) < 1.2, \`smooth=\${smooth} q=\${q.toFixed(1)}：走过 \${walked.toFixed(1)}px，应为 \${(q * p.length).toFixed(1)}px\`);
    }
    near(dist(p.at(0), pts[0]), 0, 1e-6);
    near(dist(p.at(1), pts.at(-1)), 0, 1e-6);
  }
});`);

  // 路径：过冲 —— 与旧的“均匀 Catmull-Rom”对比，centripetal 的鼓包必须明显更小
  swap(`  // 悬殊点距下，不能冲出路标包围盒太多（普通 Catmull-Rom 在这里会明显鼓包）
  const minX = Math.min(...pts.map((v) => v[0])), maxX = Math.max(...pts.map((v) => v[0]));
  const minY = Math.min(...pts.map((v) => v[1])), maxY = Math.max(...pts.map((v) => v[1]));
  for (let k = 0; k <= 2000; k++) {
    const [x, y] = p.at(k / 2000);
    assert.ok(x > minX - 25 && x < maxX + 25 && y > minY - 25 && y < maxY + 25, \`过冲：(\${x.toFixed(1)}, \${y.toFixed(1)})\`);
  }`, `  // 曲线偏离“路标折线”的最大距离：悬殊点距下，均匀 Catmull-Rom（旧实现）会明显鼓包，centripetal 应小得多
  const segDist = (q, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2));
    return Math.hypot(q[0] - a[0] - dx * u, q[1] - a[1] - dy * u);
  };
  const dev = (at) => {
    let worst = 0;
    for (let k = 0; k <= 3000; k++) {
      const q = at(k / 3000);
      worst = Math.max(worst, Math.min(...pts.slice(1).map((b, i) => segDist(q, pts[i], b))));
    }
    return worst;
  };
  const uniform = (u0) => {   // 旧实现：均匀 Catmull-Rom，按“第几段”计时
    const n = pts.length - 1, u = u0 * n, i = Math.min(n - 1, Math.floor(u)), t = u - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    const f = (k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
    return [f(0), f(1)];
  };
  const centri = dev(p.at), old = dev(uniform);
  assert.ok(centri < old * 0.75, \`centripetal 偏离 \${centri.toFixed(1)}px，应明显小于均匀 Catmull-Rom 的 \${old.toFixed(1)}px\`);`);

  // id 不能用 k（内置标签）
  swap(`<arrow id="k" from="a" to="b" gap="6"/>`, `<arrow id="ln" from="a" to="b" gap="6"/>`);
  swap(`const L = f.entities[r.scene.byId.get('k').index];`, `const L = f.entities[r.scene.byId.get('ln').index];`);
  swap(`<arrow id="k" from="a" to="b" gap="4"/>`, `<arrow id="ln" from="a" to="b" gap="4"/>`);
  swap(`const k = sc.byId.get('k').index, b = sc.byId.get('b').index;`, `const k = sc.byId.get('ln').index, b = sc.byId.get('b').index;`);
  swap(`<arrow id="k" from="a" to="7,3"/>`, `<arrow id="ln" from="a" to="7,3"/>`);
  swap(`<arrow id="k" from="2.9,3" to="6,3" layer="l"/>`, `<arrow id="ln" from="2.9,3" to="6,3" layer="l"/>`);
  swap(`<arrow id="k" from="2.8,3" to="5.1,3"/>`, `<arrow id="ln" from="2.65,3" to="5.4,3"/>`);
  swap(`<arrow id="k" from="2,3" to="6,3"/>`, `<arrow id="ln" from="2,3" to="6,3"/>`);
});
