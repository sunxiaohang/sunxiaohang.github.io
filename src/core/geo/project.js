/**
 * 地图投影：经纬度（度）→ 平面坐标（无单位，随后由 fitProjection 缩放平移到画布像素）。
 *
 * - lambert：兰伯特等角圆锥，国内地图的标准投影（国家测绘常用 25°N / 47°N 双标准纬线，中央经线 105°E）。
 *   形状不变形、纬线是弧线，看起来就是我们熟悉的“中国地图”；
 * - equirect：等距柱状，经纬度直接当坐标，最简单，适合小范围；
 * - mercator：Web 墨卡托，熟悉的网络地图样子（高纬度放大）。
 */

const D2R = Math.PI / 180;

const makers = {
  equirect: () => (lon, lat) => [lon, -lat],

  mercator: () => (lon, lat) => {
    const la = Math.max(-85, Math.min(85, lat)) * D2R;
    return [lon * D2R, -Math.log(Math.tan(Math.PI / 4 + la / 2))];
  },

  lambert: ({ lon0 = 105, lat1 = 25, lat2 = 47, lat0 = 0 } = {}) => {
    const p1 = lat1 * D2R, p2 = lat2 * D2R;
    const n = Math.log(Math.cos(p1) / Math.cos(p2)) / Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2));
    const F = (Math.cos(p1) * Math.tan(Math.PI / 4 + p1 / 2) ** n) / n;
    const rho = (lat) => F / Math.tan(Math.PI / 4 + (lat * D2R) / 2) ** n;
    const rho0 = rho(lat0);
    return (lon, lat) => {
      const r = rho(lat), th = n * (lon - lon0) * D2R;
      return [r * Math.sin(th), -(rho0 - r * Math.cos(th))];
    };
  },
};

export const PROJECTIONS = Object.keys(makers);

export function makeProjection(name, opts) {
  const make = makers[name];
  return make ? make(opts) : null;
}

/**
 * 求一个把 bounds 内的点（经纬度）铺满 box 的变换：返回 { project(lon,lat)->[px,py], scale }。
 * pts：参与适配的 [lon,lat] 列表；box：{ x, y, w, h }（画布像素）；pad：额外留白（像素）。
 * 先把点投到平面，再取包围盒，等比缩放到 box 内并居中——所以弧形纬线、变形都已经算进去了。
 */
export function fitProjection(proj, pts, box, pad = 0) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [lon, lat] of pts) {
    const [x, y] = proj(lon, lat);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const w = Math.max(1e-9, x1 - x0), h = Math.max(1e-9, y1 - y0);
  const aw = Math.max(1, box.w - pad * 2), ah = Math.max(1, box.h - pad * 2);
  const scale = Math.min(aw / w, ah / h);
  const ox = box.x + box.w / 2 - ((x0 + x1) / 2) * scale;
  const oy = box.y + box.h / 2 - ((y0 + y1) / 2) * scale;
  return { project: (lon, lat) => { const [x, y] = proj(lon, lat); return [x * scale + ox, y * scale + oy]; }, scale };
}

/** 球面两点之间的大圆距离（公里），用于显示里程 */
export function haversine(a, b) {
  const [lo1, la1] = a, [lo2, la2] = b;
  const dla = (la2 - la1) * D2R, dlo = (lo2 - lo1) * D2R;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1 * D2R) * Math.cos(la2 * D2R) * Math.sin(dlo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
