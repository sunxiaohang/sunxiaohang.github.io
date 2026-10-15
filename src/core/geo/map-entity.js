import { buildMapGeometry, allProvinces, southSeaIslands, findProvince, provinceNames } from './index.js';
import { suggest } from '../lang/reader.js';

/**
 * <map> 的编译：建立投影、预先把省界与岛屿全部换算成“画布像素折线”，写进 ent.map。
 * 渲染只负责按样式描线填色，不再做任何地理计算。
 *
 * 画哪里：默认占满格子区域（pad 以内）；写 at / w / h 可以放在局部（at 是格子坐标，w/h 是像素或 c）。
 * 南海诸岛：真实位置在海南以南很远，画在海上会把整张图拉得很长。所以默认把它们收进右下角的小图框
 * （inset="corner"），这是地图的通行画法；inset="off" 则按真实位置画。
 */

const TOP_CROP = 0; // 预留

/** 点是否落在矩形内（含外扩 m） */
const inBox = (x, y, b, m = 0) => x >= b.x - m && x <= b.x + b.w + m && y >= b.y - m && y <= b.y + b.h + m;

/**
 * 在地图框里放南海诸岛小图：优先右下角，且绝不能压到任何省的轮廓。
 * 做法：先放在右下角；若与国土相交，就沿“向右、向下”两个方向找一个不相交的位置，
 * 实在放不下就把小图缩小到 70% 再试；仍不行则放在右下角（并由 lint 报警）。
 */
function placeInset(box, provinces) {
  const test = (b) => provinces.every((p) => p.rings.every((r) => r.every(([x, y]) => !inBox(x, y, b, 3))));
  for (const scale of [1, 0.85, 0.7, 0.55, 0.42]) {
    const w = Math.min(box.w * 0.24, box.h * 0.36) * scale, h = w * 1.18;
    // 在整个地图框里按 6px 步长扫一遍候选位置，优先靠近右下角
    const cands = [];
    for (let y = box.y + box.h - h - 4; y >= box.y + 4; y -= 6) {
      for (let x = box.x + box.w - w - 4; x >= box.x + 4; x -= 6) cands.push([x, y]);
    }
    const corner = [box.x + box.w, box.y + box.h];
    cands.sort((p, q) => Math.hypot(p[0] + w / 2 - corner[0], p[1] + h / 2 - corner[1]) - Math.hypot(q[0] + w / 2 - corner[0], q[1] + h / 2 - corner[1]));
    for (const [x, y] of cands) {
      const b = { x, y, w, h };
      if (test(b)) return b;
    }
  }
  const w = Math.min(box.w * 0.2, box.h * 0.3), h = w * 1.18;
  return { x: box.x + box.w - w - 6, y: box.y + box.h - h - 6, w, h, overlaps: true };
}

export function compileMap(r, ctx, init, ent, scene) {
  const { diag } = ctx;
  const U = scene.unit;

  ent.projection = r.str('projection', 'lambert').trim().toLowerCase();
  const regionRaw = r.str('region', 'china').trim() || 'china';
  const region = regionRaw === 'china' || regionRaw === '中国' ? 'china' : regionRaw;
  ent.regionName = region;

  // ---- 画布范围 ----
  const full = { x: scene.ax, y: scene.ay, w: scene.cols * scene.cw, h: scene.rows * scene.ch };
  let box = full;
  if (r.has('w') || r.has('h') || r.has('at')) {
    const w = r.len('w', full.w, { min: 20 }), h = r.len('h', full.h, { min: 20 });
    const at = r.pos('at');
    const cx = at ? scene.ax + (at[0] - 0.5) * scene.cw : full.x + full.w / 2;
    const cy = at ? scene.ay + (at[1] - 0.5) * scene.ch : full.y + full.h / 2;
    box = { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  // 底部留给南海小图的位置：全国范围且 inset=corner 时，小图叠在右下角，不额外占用地图空间
  const inset = r.str('inset', region === 'china' ? 'corner' : 'off').trim().toLowerCase();
  if (!['corner', 'off', 'none'].includes(inset)) diag.warn('W_BAD_VALUE', `inset 只能是 corner / off / none，实际是 "${inset}"，已改用 corner`, r.at('inset'));
  ent.inset = ['corner', 'off', 'none'].includes(inset) ? inset : 'corner';

  const pad = Math.max(6, U * 0.1);
  const geo = buildMapGeometry({ projection: ent.projection, region, box, pad });
  if (geo.error) {
    diag.error('E_BAD_VALUE', geo.error, r.at(geo.error.startsWith('projection') ? 'projection' : 'region'), geo.error.startsWith('region') ? `可用：china、省名（${provinceNames().slice(0, 8).join('、')}…）或 "经度min,纬度min,经度max,纬度max"` : undefined);
    return false;
  }
  if (geo.badRegions) {
    for (const bad of geo.badRegions) {
      const s = suggest(bad, provinceNames());
      diag.warn('W_BAD_VALUE', `region 里的 "${bad}" 不是省名，已忽略`, r.at('region'), s ? `是不是想写 "${s}"？` : undefined);
    }
  }
  scene.geo = { project: geo.project, scale: geo.scale, box, projection: ent.projection, region };

  // ---- 哪些省 ----
  const provSpec = r.str('provinces', '').trim();
  const regionProvs = region === 'china' ? null : new Set(region.split(/\s+/).map((n) => findProvince(n)?.name).filter(Boolean));
  const wanted = provSpec === 'none' ? new Set() : provSpec ? new Set(provSpec.split(/\s+/).map((n) => findProvince(n)?.name).filter(Boolean)) : null;
  const highlight = new Set(r.str('highlight', '').split(/\s+/).filter(Boolean).map((n) => {
    const p = findProvince(n);
    if (!p) {
      const s = suggest(n, provinceNames());
      diag.warn('W_BAD_VALUE', `highlight 里的 "${n}" 不是省名，已忽略`, r.at('highlight'), s ? `是不是想写 "${s}"？` : undefined);
    }
    return p?.name;
  }).filter(Boolean));

  const provinces = [];
  for (const p of allProvinces()) {
    if (wanted && !wanted.has(p.name)) continue;
    // 局部区域：只画与 region 有关的省，以及落在画面里的邻省（保持地图完整感）
    const rings = p.rings.map((ring) => ring.map(([lon, lat]) => geo.project(lon, lat)));
    provinces.push({ name: p.name, short: p.short, rings, center: p.center ? geo.project(p.center[0], p.center[1]) : null, hi: highlight.has(p.name), inRegion: !regionProvs || regionProvs.has(p.name) });
  }
  ent.provinces = provinces;

  // ---- 南海诸岛 ----
  ent.islands = [];
  if (ent.inset !== 'none') {
    const raw = southSeaIslands();
    if (ent.inset === 'off') {
      ent.islands = raw.map((ring) => ring.map(([lon, lat]) => geo.project(lon, lat)));
    } else if (region === 'china') {
      // 小图框：把岛屿的经纬度范围铺进框里（用等距柱状，范围小，变形可忽略）
      const ib = placeInset(box, provinces);
      if (ib.overlaps) diag.warn('W_INSET_OVERLAP', '南海诸岛小图没有找到不压住国土的位置', r.at('inset'), '把 <map> 放大一点（w / h），或写 inset="none" 不画小图');
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const ring of raw) for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const k = Math.min((ib.w - 16) / (x1 - x0), (ib.h - 16) / (y1 - y0));
      const ox = ib.x + ib.w / 2 - ((x0 + x1) / 2) * k, oy = ib.y + ib.h / 2 + ((y0 + y1) / 2) * k;
      ent.islands = raw.map((ring) => ring.map(([lon, lat]) => [lon * k + ox, -lat * k + oy]));
      ent.insetBox = ib;
    }
  }

  // ---- 线条样式：省界 / 外轮廓 / 南海诸岛，各自可改色、粗细、虚实 ----
  const theme = scene.theme;
  const text = theme.text || [232, 234, 246, 1];
  const sub = theme.sub || [154, 163, 199, 1];
  const a = (c, k) => [c[0], c[1], c[2], c[3] * k];
  ent.style = {
    border: r.has('border') && r.raw('border').trim().toLowerCase() === 'none' ? null : r.color('border', a(sub, 0.55)),
    borderWidth: r.len('borderWidth', 1.2, { min: 0 }),
    coast: r.has('coast') && r.raw('coast').trim().toLowerCase() === 'none' ? null : r.color('coast', a(text, 0.85)),
    coastWidth: r.len('coastWidth', 2, { min: 0 }),
    island: r.has('island') && r.raw('island').trim().toLowerCase() === 'none' ? null : r.color('island', null),
    islandWidth: r.len('islandWidth', -1),
    dash: r.has('dash') ? (r.raw('dash').trim() || '4 3').split(/[\s,]+/).map(Number).filter((v) => Number.isFinite(v) && v >= 0) : null,
    names: r.has('names'),
    namesSize: r.has('names') ? r.raw('names').trim().toLowerCase() : '',
  };
  // 没写 island 才跟外轮廓同色；明确写了 none 就是不画（null 不能被默认值覆盖）
  if (!r.has('island')) ent.style.island = ent.style.coast;
  if (ent.style.islandWidth < 0) ent.style.islandWidth = ent.style.coastWidth;

  // 底色：fill 填充整个国土；stroke 不用（线条用上面的几组）
  init.fill = r.color('fill', theme.bg2 ? a(theme.bg2, 1) : [27, 31, 42, 1]);
  init.stroke = [0, 0, 0, 0];
  init.color = r.color('color', a(sub, 1));
  init.width = 0;
  ent.mapBox = box;
  return true;
}
