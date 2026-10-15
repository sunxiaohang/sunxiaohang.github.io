import { parseColor, shade, luminance } from '../util/color.js';
import { Reader, checkAttrs } from '../lang/reader.js';
import { SCENE_ATTRS, CAPTION_STYLES, CAPTION_SIZES } from '../lang/schema.js';
import { resolvePlace } from '../geo/place.js';

export const EPS = 1e-6;
export const MAX_SEGMENTS = 60000;
export const NONE = [0, 0, 0, 0];
export const col = (s) => parseColor(s);

const cssBox = (v) =>
  v.length === 1 ? [v[0], v[0], v[0], v[0]]
    : v.length === 2 ? [v[0], v[1], v[0], v[1]]
      : v.length === 3 ? [v[0], v[1], v[2], v[1]] : v;

/** 字幕设置：caption（开关或样式名）、caption-size（预设或像素）、caption-pos */
function readCaption(r, diag, width) {
  let on = true, style = 'soft';
  if (r.has('caption')) {
    const v = r.raw('caption').trim().toLowerCase();
    if (['false', '0', 'no', 'off', 'none'].includes(v)) on = false;
    else if (['', 'true', '1', 'yes', 'on'].includes(v)) { /* 默认样式 */ }
    else if (CAPTION_STYLES.includes(v)) style = v;
    else diag.error('E_BAD_VALUE', `caption 需要 false 或样式名，实际是 "${r.raw('caption')}"`, r.at('caption'), `可用：${CAPTION_STYLES.join(' / ')}`);
  }
  let fs = Math.max(11, width * CAPTION_SIZES.medium);
  if (r.has('caption-size')) {
    const v = r.raw('caption-size').trim().toLowerCase();
    if (Object.hasOwn(CAPTION_SIZES, v)) fs = Math.max(11, width * CAPTION_SIZES[v]);
    else if (v !== '' && Number.isFinite(Number(v))) fs = Math.min(120, Math.max(10, Number(v)));
    else if (v !== '') diag.error('E_BAD_VALUE', `caption-size 需要字号预设或像素数，实际是 "${r.raw('caption-size')}"`, r.at('caption-size'), `可用：${Object.keys(CAPTION_SIZES).join(' / ')} 或 22 这样的数字`);
  }
  let pos = 'bottom';
  if (r.has('caption-pos')) {
    const v = r.raw('caption-pos').trim().toLowerCase();
    if (v === 'top' || v === 'bottom') pos = v;
    else diag.error('E_BAD_VALUE', `caption-pos 只能是 top 或 bottom，实际是 "${r.raw('caption-pos')}"`, r.at('caption-pos'));
  }
  return { on, style, fs, pos };
}
/** 场景：画布尺寸、格子、留白、背景、全局开关 */
export function buildScene(root, diag, themeRaw) {
  // 语义色表：<theme accent="#…"> → { accent: [r,g,b,a] }，对象里 fill="accent" 引用
  const theme = {};
  if (themeRaw) {
    for (const [k, v] of Object.entries(themeRaw)) {
      const c = parseColor(String(v));
      if (c) theme[k] = c;
      else diag.warn('W_BAD_VALUE', `<theme> 的 "${k}" 不是合法颜色："${v}"`, root);
    }
  }
  const r = new Reader(root, diag, undefined, theme);
  checkAttrs(root, Object.keys(SCENE_ATTRS), diag);
  const width = r.num('width', 800, { min: 50, max: 8000 });
  const height = r.num('height', 600, { min: 50, max: 8000 });

  let cols = 3, rows = 3;
  if (r.has('grid')) {
    const m = /^\s*(\d+)\s*[x×*]\s*(\d+)\s*$/i.exec(r.raw('grid'));
    if (m && +m[1] > 0 && +m[2] > 0 && +m[1] <= 64 && +m[2] <= 64) { cols = +m[1]; rows = +m[2]; }
    else diag.error('E_BAD_VALUE', `grid 应写成 "列x行"（1~64），如 15x15，实际是 "${r.raw('grid')}"`, r.at('grid'));
  }

  let pad = [0, 0, 0, 0];
  if (r.has('pad')) {
    const v = r.raw('pad').split(/[\s,，]+/).filter(Boolean).map(Number);
    if (v.length >= 1 && v.length <= 4 && v.every((x) => Number.isFinite(x) && x >= 0)) pad = cssBox(v);
    else diag.error('E_BAD_VALUE', `pad 需要 1~4 个非负数（上 右 下 左），实际是 "${r.raw('pad')}"`, r.at('pad'));
  }
  let aw = width - pad[1] - pad[3], ah = height - pad[0] - pad[2];
  if (aw < 10 || ah < 10) {
    diag.error('E_BAD_VALUE', 'pad 太大，格子区域已经没有空间', r.at('pad'));
    pad = [0, 0, 0, 0];
    aw = width;
    ah = height;
  }

  // 背景：显式写的优先，其次取配色 / 主题里的 bg、bg2，最后才是内置深色
  const bg = r.color('bg', theme.bg || col('#0f1020'));
  const bg2 = r.color('bg2', null) || (r.has('bg') ? null : theme.bg2) || shade(bg, 0.07);
  const series = [];
  for (let i = 1; theme[`c${i}`]; i++) series.push(theme[`c${i}`]);
  const cw = aw / cols, ch = ah / rows;
  const cap = readCaption(r, diag, width);
  return {
    width, height, cols, rows, pad, ax: pad[3], ay: pad[0], cw, ch, unit: Math.min(cw, ch),
    bg, bg2,
    // 套用了配色 / 主题：图形默认色、文字色、标签对比度改由主题决定
    themed: Object.keys(theme).length > 0, series, dark: luminance(bg) < 0.4,
    shadow: r.bool('shadow', true), glow: r.bool('glow', true),
    caption: cap.on, captionStyle: cap.style, captionFs: cap.fs, captionPos: cap.pos,
    hold: r.num('hold', 0.6, { min: 0.05 }),
    read: r.num('read', 0, { min: 0, max: 30 }),
    overlapCheck: r.bool('overlap', true),
    poster: Math.round(r.num('poster', 0, { min: -999, max: 999 })),
    theme,
    links: [], entities: [], byId: new Map(), groups: new Map(), segments: [], steps: [], anims: new Map(), sounds: [], duration: 0.1,
  };
}

export const cellToXY = (sc, [c, r]) => [sc.ax + (c - 0.5) * sc.cw, sc.ay + (r - 0.5) * sc.ch];

/**
 * 把一个地点写法换算成像素。token 可以是城市名、"经度,纬度"。
 * 返回 [x, y]；出错时写入诊断并返回 null。必须先写 <map>（它决定投影）。
 */
export function placeToXY(ctx, token, at) {
  const { scene, diag } = ctx;
  if (!scene.geo) {
    diag.error('E_NO_MAP', '写了地名或经纬度，但场景里还没有 <map>', at, '先在最前面写一个 <map region="china"/>，之后的对象才能用 city="成都" 这样定位');
    return null;
  }
  const p = resolvePlace(token);
  if (p.error) { diag.error('E_BAD_PLACE', p.error, at, p.hint); return null; }
  return scene.geo.project(p.lon, p.lat);
}

export function warnOutside(ctx, [c, r], at) {
  const { cols, rows } = ctx.scene;
  if (c < 0.5 || c > cols + 0.5 || r < 0.5 || r > rows + 0.5)
    ctx.diag.warn('W_OUT_OF_GRID', `(${c},${r}) 超出 ${cols}x${rows} 网格`, at);
}

/** 追加一个动画片段；超出上限时只报一次错 */
export function seg(ctx, ent, o) {
  if (ctx.segs.length >= MAX_SEGMENTS) {
    if (!ctx.tooMany) ctx.diag.error('E_TOO_MANY', `动作数量超过上限 ${MAX_SEGMENTS}`, o);
    ctx.tooMany = true;
    return;
  }
  ctx.segs.push({ ent: ent.index, id: ent.id, order: ctx.segs.length, step: ctx.curStep, mode: 'set', props: [], ...o });
}

export function register(ctx, ent) {
  ctx.scene.entities.push(ent);
  ctx.scene.byId.set(ent.id, ent);
  ctx.state.set(ent.id, { ...ent.init });
}
