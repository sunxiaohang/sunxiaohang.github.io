#!/usr/bin/env node
/**
 * 构建内置地图数据：把行政区划 GeoJSON 简化、量化，输出成 src/core/geo/data/china.js。
 *
 * 数据来源（需自行下载到 .geo/，不进仓库）：
 *   .geo/100000_full.json          全国省级边界，含 100000_JD（南海诸岛与九段线）
 *   .geo/<省代码>_full.json         各省的地级市边界与中心点
 * 下载地址：https://geo.datav.aliyun.com/areas_v3/bound/<adcode>_full.json
 *
 * 输出的数据是纯 JS 模块（同步 import，编译地图不用异步加载）：
 *   provinces  省界：每省一个 { code, name, short, center, rings: [量化折线…] }
 *   islands    南海诸岛 / 九段线
 *   cities     城市：[名称, 经度, 纬度, 省简称]，名称含别名
 *   outline    全国外轮廓（把各省的公共边去掉后剩下的边，用来画国界线）
 *
 * 量化：经纬度 × 1000 取整（≈ 110 米），再做 Douglas–Peucker 简化（容差 0.02°≈2km）。
 * 用法：node tools/build-geo.mjs [--tolerance 0.02]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const TOL = arg('--tolerance', 0.02);
const Q = 1000;

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
if (!existsSync('.geo/100000_full.json')) {
  console.error('缺少 .geo/100000_full.json，请先按文件头注释下载数据');
  process.exit(1);
}

/** Douglas–Peucker 折线简化（闭合环按首尾相接处理） */
function simplify(pts, tol) {
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1, wi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d2;
      if (l2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        d2 = (px - ax - dx * u) ** 2 + (py - ay - dy * u) ** 2;
      }
      if (d2 > worst) { worst = d2; wi = i; }
    }
    if (worst > t2) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** 小岛屿：外接框小于此值（度）的环直接丢弃，但保留海南、台湾、舟山这类大岛。
 *  例外：一个省最大的那块（主体）永远保留，所以澳门、香港这种很小的行政区不会消失。 */
const MIN_SPAN = 0.12;
const span = (ring) => {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return Math.max(x1 - x0, y1 - y0);
};

const quant = (ring) => {
  const out = [];
  let px = null, py = null;
  for (const [lon, lat] of ring) {
    const x = Math.round(lon * Q), y = Math.round(lat * Q);
    if (x === px && y === py) continue;
    out.push([x, y]);
    px = x; py = y;
  }
  return out;
};

/** 差分编码：[x0,y0, dx1,dy1, …] 展平成一维数组，体积更小 */
const delta = (ring) => {
  const flat = [ring[0][0], ring[0][1]];
  for (let i = 1; i < ring.length; i++) flat.push(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
  return flat;
};

const ringsOf = (g) => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]).flatMap((poly) => poly.slice(0, 1)); // 只取外环，不画内洞

const SHORT = { 内蒙古自治区: '内蒙古', 广西壮族自治区: '广西', 西藏自治区: '西藏', 宁夏回族自治区: '宁夏', 新疆维吾尔自治区: '新疆', 香港特别行政区: '香港', 澳门特别行政区: '澳门' };
const shortOf = (n) => SHORT[n] || n.replace(/(省|市)$/, '');

const top = read('.geo/100000_full.json');
const provinces = [];
let islands = [];
let rawPts = 0, outPts = 0;

for (const f of top.features) {
  const { adcode, name, center } = f.properties;
  if (String(adcode) === '100000_JD') {
    // 南海诸岛的九段线：10 段细长闭合多边形。一段都不能丢，用更小的简化容差保持形状。
    islands = ringsOf(f.geometry).map((r) => quant(simplify(r, TOL / 4))).filter((r) => r.length >= 4).map(delta);
    continue;
  }
  const all = ringsOf(f.geometry);
  const biggest = all.reduce((a, b) => (span(b) > span(a) ? b : a), all[0]);
  const rings = all.filter((r) => r === biggest || span(r) >= MIN_SPAN || r.length > 40);
  rawPts += rings.reduce((n, r) => n + r.length, 0);
  // 小行政区（澳门这类）简化容差按自身大小缩小，避免被压成一个点
  const tol = Math.min(TOL, span(biggest) / 12);
  const simp = rings.map((r) => quant(simplify(r, tol))).filter((r) => r.length >= 4);
  outPts += simp.reduce((n, r) => n + r.length, 0);
  provinces.push({ code: Number(adcode), name, short: shortOf(name), center: center ? center.map((v) => Math.round(v * Q) / Q) : null, rings: simp.map(delta) });
}

// ---- 城市 ----
const cities = [];
const seen = new Set();
const push = (name, lon, lat, prov, alias = []) => {
  const key = `${name}|${prov}`;
  if (seen.has(key)) return;
  seen.add(key);
  cities.push([name, Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000, prov, ...alias]);
};
const stripCity = (n) => n.replace(/(特别行政区|市|地区|自治州|盟|林区)$/, '').replace(/(土家族苗族|苗族侗族|布依族苗族|藏族羌族|藏族|彝族|哈尼族彝族|傣族景颇族|白族|傈僳族|壮族苗族|回族|蒙古族|哈萨克|柯尔克孜|蒙古)+自治州$/, '');

for (const p of top.features) {
  const code = String(p.properties.adcode);
  if (!/^\d{6}$/.test(code)) continue;
  const file = `.geo/${code}_full.json`;
  const pname = shortOf(p.properties.name);
  if (!existsSync(file)) continue;
  for (const c of read(file).features) {
    if (!c.properties.center) continue;
    const [lon, lat] = c.properties.center;
    if (c.properties.level === 'city') push(stripCity(c.properties.name), lon, lat, pname);
  }
}

const extra = JSON.parse(readFileSync('tools/geo-extra.json', 'utf8'));
for (const [name, lon, lat, prov, ...alias] of extra.cities) push(name, lon, lat, prov, alias);

mkdirSync('src/core/geo/data', { recursive: true });
const js = `// 由 tools/build-geo.mjs 生成，请勿手改。
// 省界：行政区划边界，经纬度 ×1000 取整后差分编码（[x0,y0,dx,dy,…]）；容差 ${TOL}°。
// 数据来源：阿里云 DataV.GeoAtlas（行政区划边界）。
export const SCALE = ${Q};
export const provinces = ${JSON.stringify(provinces)};
export const islands = ${JSON.stringify(islands)};
export const cities = ${JSON.stringify(cities)};
`;
writeFileSync('src/core/geo/data/china.js', js);
console.log(`省级 ${provinces.length} 个 | 点数 ${rawPts} → ${outPts} | 南海诸岛 ${islands.length} 块 | 城市 ${cities.length} 个 | 输出 ${(js.length / 1024).toFixed(0)} KB`);
