const NAMED = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  red: [255, 69, 58],
  green: [48, 209, 88],
  blue: [10, 132, 255],
  yellow: [255, 214, 10],
  orange: [255, 159, 10],
  pink: [255, 105, 180],
  purple: [175, 82, 222],
  cyan: [64, 224, 255],
  gray: [142, 142, 147],
  grey: [142, 142, 147],
  transparent: [0, 0, 0, 0],
  none: [0, 0, 0, 0],
};

export const COLOR_NAMES = Object.keys(NAMED);

function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  s /= 100;
  l /= 100;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (Object.hasOwn(NAMED, s)) {
    const c = NAMED[s];
    return [c[0], c[1], c[2], c.length > 3 ? c[3] : 1];
  }
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((ch) => ch + ch).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
  if (m) {
    const v = m[2].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    if (v.length < 3 || v.some(Number.isNaN)) return null;
    const a = v.length > 3 ? v[3] : 1;
    return m[1].startsWith('rgb') ? [v[0], v[1], v[2], a] : [...hslToRgb(v[0], v[1], v[2]), a];
  }
  return null;
}

export function toCss(c, alpha = 1) {
  const a = Math.max(0, Math.min(1, c[3] * alpha));
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+a.toFixed(3)})`;
}

export function mix(a, b, t) {
  const ca = a[3] === 0 ? b : a;
  const cb = b[3] === 0 ? a : b;
  return [
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

export function shade(c, amount) {
  return amount >= 0 ? mix(c, [255, 255, 255, c[3]], amount) : mix(c, [0, 0, 0, c[3]], -amount);
}
