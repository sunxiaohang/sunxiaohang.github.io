import { parseColor, shade } from '../util/color.js';
import { Reader, checkAttrs } from '../lang/reader.js';
import { SCENE_ATTRS } from '../lang/schema.js';

export const EPS = 1e-6;
export const MAX_SEGMENTS = 60000;
export const NONE = [0, 0, 0, 0];
export const col = (s) => parseColor(s);

const cssBox = (v) =>
  v.length === 1 ? [v[0], v[0], v[0], v[0]]
    : v.length === 2 ? [v[0], v[1], v[0], v[1]]
      : v.length === 3 ? [v[0], v[1], v[2], v[1]] : v;

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

  const bg = r.color('bg', col('#0f1020'));
  const cw = aw / cols, ch = ah / rows;
  return {
    width, height, cols, rows, pad, ax: pad[3], ay: pad[0], cw, ch, unit: Math.min(cw, ch),
    bg, bg2: r.color('bg2', null) || shade(bg, 0.07),
    shadow: r.bool('shadow', true), glow: r.bool('glow', true), caption: r.bool('caption', true),
    hold: r.num('hold', 0.6, { min: 0.05 }),
    read: r.num('read', 0, { min: 0, max: 30 }),
    overlapCheck: r.bool('overlap', true),
    theme,
    entities: [], byId: new Map(), groups: new Map(), segments: [], steps: [], anims: new Map(), sounds: [], duration: 0.1,
  };
}

export const cellToXY = (sc, [c, r]) => [sc.ax + (c - 0.5) * sc.cw, sc.ay + (r - 0.5) * sc.ch];

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
