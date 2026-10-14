export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) break;
      if (e > 0) hi = t; else lo = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

export const EASINGS = {
  linear: (p) => p,
  in: (p) => p * p * p,
  out: (p) => 1 - Math.pow(1 - p, 3),
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  back: (p) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  },
  spring: (p) => 1 - Math.exp(-6 * p) * Math.cos(11 * p) * (1 - p),
  bounce: (p) => {
    const n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) { p -= 1.5 / d; return n * p * p + 0.75; }
    if (p < 2.5 / d) { p -= 2.25 / d; return n * p * p + 0.9375; }
    p -= 2.625 / d;
    return n * p * p + 0.984375;
  },
  elastic: (p) =>
    p === 0 ? 0 : p === 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

EASINGS.soft = EASINGS.inOut;
EASINGS.snap = EASINGS.out;

// ---- 幂次缓动家族（quad/quart/quint 的 in/out/inOut）----
for (const [name, n] of [['quad', 2], ['quart', 4], ['quint', 5]]) {
  EASINGS[`${name}In`] = (p) => p ** n;
  EASINGS[`${name}Out`] = (p) => 1 - (1 - p) ** n;
  EASINGS[name] = (p) => (p < 0.5 ? 2 ** (n - 1) * p ** n : 1 - (-2 * p + 2) ** n / 2);
}

// ---- 三角 / 指数 / 圆形 ----
EASINGS.sineIn = (p) => 1 - Math.cos((p * Math.PI) / 2);
EASINGS.sineOut = (p) => Math.sin((p * Math.PI) / 2);
EASINGS.sine = (p) => (1 - Math.cos(Math.PI * p)) / 2;
EASINGS.expoIn = (p) => (p === 0 ? 0 : 2 ** (10 * (p - 1)));
EASINGS.expoOut = (p) => (p === 1 ? 1 : 1 - 2 ** (-10 * p));
EASINGS.expo = (p) => (p === 0 ? 0 : p === 1 ? 1 : p < 0.5 ? 2 ** (20 * p - 10) / 2 : (2 - 2 ** (-20 * p + 10)) / 2);
EASINGS.circIn = (p) => 1 - Math.sqrt(1 - p * p);
EASINGS.circOut = (p) => Math.sqrt(1 - (p - 1) ** 2);
EASINGS.circ = (p) => (p < 0.5 ? (1 - Math.sqrt(1 - (2 * p) ** 2)) / 2 : (Math.sqrt(1 - (-2 * p + 2) ** 2) + 1) / 2);

// ---- 反向变体：现有 back / elastic 是 out 方向，补上 in / inOut ----
EASINGS.backOut = EASINGS.back;
EASINGS.backIn = (p) => { const c = 1.70158; return c * p * p * p - c * p * p; };
EASINGS.backInOut = (p) => {
  const c = 1.70158 * 1.525;
  return p < 0.5 ? ((2 * p) ** 2 * ((c + 1) * 2 * p - c)) / 2 : ((2 * p - 2) ** 2 * ((c + 1) * (p * 2 - 2) + c) + 2) / 2;
};
EASINGS.elasticOut = EASINGS.elastic;
EASINGS.elasticIn = (p) => (p === 0 ? 0 : p === 1 ? 1 : -(2 ** (10 * (p - 1))) * Math.sin((p * 10 - 10.75) * ((2 * Math.PI) / 3)));

export const EASE_NAMES = Object.keys(EASINGS);

const CUBIC = /^cubic\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/;

export function resolveEase(spec) {
  if (typeof spec !== 'string') return null;
  const name = spec.trim();
  if (Object.hasOwn(EASINGS, name)) return EASINGS[name];
  const m = CUBIC.exec(name);
  if (m) {
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    if ([x1, y1, x2, y2].every(Number.isFinite) && x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1) {
      return cubicBezier(x1, y1, x2, y2);
    }
  }
  return null;
}
