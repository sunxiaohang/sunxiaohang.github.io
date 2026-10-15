import { findCity, parseLonLat, cityNames } from './index.js';
import { suggest } from '../lang/reader.js';

/**
 * 地理位置的统一解析：属性里写地点，换算成画布像素。
 *   city="成都"            城市名（含别名），可以是 "成都"、"成都市"
 *   lonlat="104.06,30.66"  经度,纬度（经度在前）
 *   at="成都"              at 里直接写城市名也行（at 不是数字坐标时，当作城市）
 *
 * 必须先有 <map>（它决定投影）。没有时返回 { error } 并给出提示。
 */

/** 一个“地点”写法 → { lon, lat, label } 或 { error, hint } */
export function resolvePlace(token) {
  const raw = String(token ?? '').trim();
  if (!raw) return { error: '地点是空的' };
  const ll = parseLonLat(raw);
  if (ll) return { lon: ll[0], lat: ll[1], label: '' };
  const c = findCity(raw);
  if (c) return { lon: c.lon, lat: c.lat, label: c.name };
  const near = suggest(raw, cityNames());
  return { error: `找不到城市 "${raw}"`, hint: near ? `是不是想写 "${near}"？` : '也可以直接写经纬度，如 lonlat="104.06,30.66"（经度在前）' };
}

/** 判断一个 at / path 里的 token 是不是“地名”：含非数字字符，且不是 H8 这样的棋类写法 */
export function looksLikePlace(token) {
  const s = String(token ?? '').trim();
  if (!s) return false;
  if (/^[A-Za-z]\s*\d+$/.test(s)) return false;        // H8
  return /[^\d\s.,，;；()（）\-+eE]/.test(s);             // 含数字以外的字符（汉字、字母）
}

/** 经纬度 → 画布像素；没有地图时返回 null */
export function projectPlace(scene, p) {
  if (!scene.geo) return null;
  return scene.geo.project(p.lon, p.lat);
}
