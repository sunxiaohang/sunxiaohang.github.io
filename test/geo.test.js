import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProjection, fitProjection, haversine } from '../src/core/geo/project.js';
import { allProvinces, southSeaIslands, findCity, findProvince, parseLonLat, regionPoints, buildMapGeometry, cityNames } from '../src/core/geo/index.js';
import { near } from './helpers.js';

// =============== 数据 ===============

test('数据：34 个省级行政区齐全，含台湾、香港、澳门；每个省都有闭合的外轮廓', () => {
  const ps = allProvinces();
  assert.equal(ps.length, 34);
  for (const n of ['北京', '上海', '广东', '新疆', '西藏', '内蒙古', '海南', '台湾', '香港', '澳门', '黑龙江']) assert.ok(findProvince(n), `缺少 ${n}`);
  for (const p of ps) {
    assert.ok(p.rings.length >= 1, `${p.name} 没有轮廓`);
    for (const r of p.rings) assert.ok(r.length >= 4, `${p.name} 的环太短`);
  }
});

test('数据：南海诸岛的九段线完整（10 段）', () => {
  assert.equal(southSeaIslands().length, 10, '九段线共 10 段，一段都不能少');
});

test('数据：坐标都在合理的经纬度范围内（没有解码错位）', () => {
  for (const p of allProvinces()) for (const r of p.rings) for (const [lon, lat] of r) {
    assert.ok(lon > 70 && lon < 140 && lat > 3 && lat < 54, `${p.name}: (${lon}, ${lat})`);
  }
});

test('城市：常用城市坐标准确（误差 < 0.1°），支持别名与带“市”的写法', () => {
  const expect = { 北京: [116.4, 39.9], 上海: [121.47, 31.23], 成都: [104.07, 30.66], 拉萨: [91.13, 29.66], 哈尔滨: [126.64, 45.76], 乌鲁木齐: [87.62, 43.79], 三亚: [109.51, 18.25], 台北: [121.56, 25.03], 广州: [113.26, 23.13] };
  for (const [n, [lon, lat]] of Object.entries(expect)) {
    const c = findCity(n);
    assert.ok(c, `找不到 ${n}`);
    assert.ok(Math.abs(c.lon - lon) < 0.1 && Math.abs(c.lat - lat) < 0.1, `${n} 坐标不对：${c.lon},${c.lat}`);
  }
  assert.equal(findCity('北京市').name, '北京');
  assert.equal(findCity('景洪').name, '西双版纳', '别名');
  assert.equal(findCity('不存在的地方'), null);
  assert.ok(cityNames().length > 380);
});

test('城市：同名不会张冠李戴（城市属于哪个省是对的）', () => {
  assert.equal(findCity('成都').prov, '四川');
  assert.equal(findCity('广州').prov, '广东');
  assert.equal(findCity('拉萨').prov, '西藏');
});

test('parseLonLat：经度在前；越界或格式错误返回 null', () => {
  assert.deepEqual(parseLonLat('104.06,30.66'), [104.06, 30.66]);
  assert.deepEqual(parseLonLat('(116.4, 39.9)'), [116.4, 39.9]);
  assert.equal(parseLonLat('30.66'), null);
  assert.equal(parseLonLat('200,10'), null, '经度越界');
  assert.equal(parseLonLat('100,95'), null, '纬度越界');
  assert.equal(parseLonLat('a,b'), null);
});

// =============== 投影 ===============

test('兰伯特投影：中央经线是竖直的；纬线向上弯成弧；北边比南边窄（圆锥）', () => {
  const p = makeProjection('lambert');
  const a = p(105, 20), b = p(105, 50);
  near(a[0], b[0], 1e-9);                       // 中央经线上 x 不变
  assert.ok(b[1] < a[1], '北方在上（y 更小）');
  // 同一纬度：东西两端比中间更靠上（纬线是向上凸起的弧，北半球圆锥）
  const mid = p(105, 35)[1], east = p(125, 35)[1];
  assert.ok(east < mid, '东端应比中央更靠上，说明纬线是弧');
  // 北京和哈尔滨：投影后哈尔滨在北京右上方
  const bj = p(116.4, 39.9), hrb = p(126.6, 45.8);
  assert.ok(hrb[0] > bj[0] && hrb[1] < bj[1]);
});

test('投影：等距柱状、墨卡托也能用；未知投影返回 null', () => {
  assert.ok(makeProjection('equirect') && makeProjection('mercator'));
  assert.equal(makeProjection('nope'), null);
  const m = makeProjection('mercator');
  assert.ok(Math.abs(m(0, 60)[1]) > Math.abs(m(0, 30)[1]) * 1.8, '墨卡托高纬度被放大');
});

test('fitProjection：点集被等比缩放进目标框并居中，不超出', () => {
  const p = makeProjection('lambert');
  const box = { x: 20, y: 30, w: 800, h: 500 };
  const pts = regionPoints('china').pts;
  const { project, scale } = fitProjection(p, pts, box, 10);
  assert.ok(scale > 0);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [lon, lat] of pts) { const [x, y] = project(lon, lat); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  assert.ok(x0 >= box.x + 10 - 0.01 && x1 <= box.x + box.w - 10 + 0.01 && y0 >= box.y + 10 - 0.01 && y1 <= box.y + box.h - 10 + 0.01, '超出了目标框');
  near((x0 + x1) / 2, box.x + box.w / 2, 0.01);
  near((y0 + y1) / 2, box.y + box.h / 2, 0.01);
  // 至少有一个方向贴满（等比缩放）
  assert.ok(Math.abs((x1 - x0) - (box.w - 20)) < 0.5 || Math.abs((y1 - y0) - (box.h - 20)) < 0.5);
});

test('haversine：北京—上海约 1068km，北京—乌鲁木齐约 2400km', () => {
  const d1 = haversine([116.4, 39.9], [121.47, 31.23]);
  assert.ok(d1 > 1040 && d1 < 1100, `北京—上海 ${d1}`);
  const d2 = haversine([116.4, 39.9], [87.62, 43.79]);
  assert.ok(d2 > 2300 && d2 < 2500, `北京—乌鲁木齐 ${d2}`);
});

// =============== 区域 ===============

test('region：china / 省名（可多个）/ 经纬度范围；未知省名给出错误列表', () => {
  assert.ok(regionPoints('china').pts.length > 1000);
  assert.ok(regionPoints('四川 重庆').pts.length > 100);
  assert.equal(regionPoints('100,20,120,40').pts.length, 4);
  const bad = regionPoints('四川 火星');
  assert.deepEqual(bad.error, ['火星']);
  assert.ok(bad.pts.length > 0, '已识别的省仍然参与适配');
});

test('buildMapGeometry：缩放到哪里，城市就落在哪里（北京在四川东北方）', () => {
  const g = buildMapGeometry({ projection: 'lambert', region: 'china', box: { x: 0, y: 0, w: 900, h: 600 }, pad: 20 });
  assert.ok(!g.error);
  const bj = findCity('北京'), cd = findCity('成都');
  const [bx, by] = g.project(bj.lon, bj.lat), [cx, cy] = g.project(cd.lon, cd.lat);
  assert.ok(bx > cx && by < cy, '北京应在成都的右上方');
  const bad = buildMapGeometry({ projection: 'x', region: 'china', box: { x: 0, y: 0, w: 10, h: 10 } });
  assert.ok(bad.error.includes('projection'));
  const bad2 = buildMapGeometry({ region: '火星', box: { x: 0, y: 0, w: 10, h: 10 } });
  assert.ok(bad2.error.includes('region'));
});

// =============== 城市数据质量护栏 ===============

import { cities as CITY_ROWS } from '../src/core/geo/data/china.js';

const inRing = (x, y, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const distToRing = (x, y, ring) => {
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * u, y - ay - dy * u));
  }
  return best;
};

test('城市表质量：每个城市都落在它声明的省份边界内（或离边界 < 0.25°），没有手滑的坐标', () => {
  const byShort = new Map(allProvinces().map((p) => [p.short, p]));
  const bad = [];
  for (const [name, lon, lat, prov] of CITY_ROWS) {
    if (name === '三沙') continue; // 南海岛礁行政中心，不在主图的海南岛边界内
    const p = byShort.get(prov);
    if (!p) { bad.push(`${name}: 未知省份 ${prov}`); continue; }
    if (p.rings.some((r) => inRing(lon, lat, r))) continue;
    const d = Math.min(...p.rings.map((r) => distToRing(lon, lat, r)));
    if (d > 0.25) bad.push(`${name}(${lon},${lat}) 声明在 ${prov}，离边界 ${d.toFixed(2)}°`);
  }
  assert.deepEqual(bad, []);
});

test('城市表质量：名称与别名不冲突（同一个名字不指向两个不同的地方）', () => {
  const seen = new Map();
  const clash = [];
  for (const [name, lon, lat, prov, ...alias] of CITY_ROWS) {
    for (const key of [name, ...alias]) {
      const prev = seen.get(key);
      if (prev && (Math.abs(prev.lon - lon) > 0.01 || Math.abs(prev.lat - lat) > 0.01)) clash.push(`${key}: ${prev.prov}${prev.name} vs ${prov}${name}`);
      else seen.set(key, { lon, lat, prov, name });
    }
  }
  assert.deepEqual(clash, []);
});

test('城市表覆盖：128 个热门旅游目的地（景区与县级城市）全部能查到', () => {
  const wanted = '故宫 长城 颐和园 北戴河 山海关 平遥 五台山 额济纳 延吉 雪乡 周庄 乌镇 普陀山 千岛湖 宏村 九华山 武夷山 鼓浪屿 庐山 井冈山 婺源 泰山 曲阜 登封 恩施 凤凰 韶山 黄龙 都江堰 稻城 康定 泸沽湖 腾冲 黄果树 纳木错 青海湖 茶卡盐湖 伊犁 禾木 那拉提 北京 天津 石家庄 秦皇岛 承德 大同 太原 呼和浩特 呼伦贝尔 阿拉善 鄂尔多斯 沈阳 大连 丹东 长春 吉林 长白山 哈尔滨 漠河 齐齐哈尔 上海 南京 苏州 无锡 扬州 杭州 宁波 舟山 黄山 合肥 福州 厦门 泉州 南昌 景德镇 济南 青岛 烟台 威海 郑州 洛阳 开封 武汉 宜昌 神农架 长沙 张家界 岳阳 广州 深圳 珠海 桂林 阳朔 北海 南宁 海口 三亚 重庆 成都 九寨沟 峨眉山 乐山 丽江 大理 昆明 香格里拉 西双版纳 贵阳 拉萨 日喀则 林芝 西安 延安 兰州 敦煌 嘉峪关 张掖 西宁 银川 乌鲁木齐 吐鲁番 喀什 香港 澳门 台北 高雄'.split(/\s+/);
  const miss = wanted.filter((n) => !findCity(n));
  assert.deepEqual(miss, []);
});
