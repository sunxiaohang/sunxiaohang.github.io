import { provinces, islands, cities, SCALE } from './data/china.js';
import { makeProjection, fitProjection, PROJECTIONS } from './project.js';

export { PROJECTIONS, haversine } from './project.js';

/** 差分编码折线 → [[lon,lat], …] */
export function decodeRing(flat) {
  const out = [];
  let x = flat[0], y = flat[1];
  out.push([x / SCALE, y / SCALE]);
  for (let i = 2; i < flat.length; i += 2) {
    x += flat[i];
    y += flat[i + 1];
    out.push([x / SCALE, y / SCALE]);
  }
  return out;
}

/** 环的外接框 [x0,y0,x1,y1] 与中心 */
const boxOf = (ring) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};

/**
 * 远海岛礁：海南省的数据里带着南沙、西沙的岛礁环，它们在海南岛以南上千公里。
 * 画在主图里会把整张地图的纬度范围拉长、把大陆压小，所以主图排除它们（南海诸岛有专门的小图）。
 * 判定：环很小（< 1.2°）且整体在 18° 以南的海上。海南岛本身（最南约 18.1°，宽 > 1.5°）不受影响。
 */
const isRemoteReef = (ring) => {
  const [x0, y0, x1, y1] = boxOf(ring);
  return Math.max(x1 - x0, y1 - y0) < 1.2 && y1 < 18;
};

let cache = null;
function load() {
  if (cache) return cache;
  const prov = provinces.map((p) => ({ ...p, rings: p.rings.map(decodeRing).filter((r) => !isRemoteReef(r)) }));
  const byName = new Map();
  for (const p of prov) { byName.set(p.name, p); byName.set(p.short, p); }
  const city = new Map();
  const add = (key, c) => { if (!city.has(key)) city.set(key, c); };
  for (const [name, lon, lat, prv, ...alias] of cities) {
    const c = { name, lon, lat, prov: prv };
    add(name, c);
    for (const a of alias) add(a, c);
  }
  cache = { prov, byName, city, islands: islands.map(decodeRing) };
  return cache;
}

export const allProvinces = () => load().prov;
export const southSeaIslands = () => load().islands;

/** 按名称查城市：先精确，再去掉“市”等后缀 */
export function findCity(name) {
  const { city } = load();
  const key = String(name ?? '').trim();
  return city.get(key) || city.get(key.replace(/(市|地区|自治州|盟)$/, '')) || null;
}

export function findProvince(name) {
  const { byName } = load();
  const key = String(name ?? '').trim();
  return byName.get(key) || byName.get(key.replace(/(省|市|自治区|特别行政区)$/, '')) || null;
}

/** 给“是不是想写……”用：所有可用的城市与别名 */
export const cityNames = () => [...load().city.keys()];
export const provinceNames = () => load().prov.map((p) => p.short);

/** 解析 "lon,lat"（经度在前）。返回 [lon, lat] 或 null */
export function parseLonLat(raw) {
  const parts = String(raw ?? '').replace(/[()（）[\]]/g, ' ').split(/[\s,，;；]+/).filter(Boolean).map(Number);
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
  const [lon, lat] = parts;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  return [lon, lat];
}

/**
 * 区域：region 可以是 "china"、省名（可多个，空格分隔）、或 "经度min,纬度min,经度max,纬度max"。
 * 返回用于适配投影的经纬度点集。
 */
export function regionPoints(spec) {
  const { prov } = load();
  const raw = String(spec ?? 'china').trim();
  if (!raw || raw === 'china' || raw === '中国') {
    const pts = [];
    for (const p of prov) for (const r of p.rings) for (let i = 0; i < r.length; i += 3) pts.push(r[i]);
    return { pts, error: null };
  }
  const box = raw.split(/[\s,，;；]+/).map(Number);
  if (box.length === 4 && box.every(Number.isFinite)) {
    const [a, b, c, d] = box;
    return { pts: [[a, b], [c, d], [a, d], [c, b]], error: null };
  }
  const pts = [];
  const bad = [];
  for (const name of raw.split(/\s+/).filter(Boolean)) {
    const p = findProvince(name);
    if (!p) { bad.push(name); continue; }
    for (const r of p.rings) for (const q of r) pts.push(q);
  }
  return { pts, error: bad.length ? bad : null };
}

/** 创建一张地图的几何：投影 + 适配后的变换 */
export function buildMapGeometry({ projection = 'lambert', region = 'china', box, pad = 0 }) {
  const proj = makeProjection(projection);
  if (!proj) return { error: `projection 只能是 ${PROJECTIONS.join(' / ')}，实际是 "${projection}"` };
  const { pts, error } = regionPoints(region);
  if (!pts.length) return { error: `region 找不到：${(error || [region]).join('、')}` };
  const fit = fitProjection(proj, pts, box, pad);
  return { project: fit.project, scale: fit.scale, badRegions: error };
}
