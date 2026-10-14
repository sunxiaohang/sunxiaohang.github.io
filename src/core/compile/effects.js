import { EASINGS, clamp, lerp } from '../util/ease.js';

/**
 * 叠加型片段的实现（mode:'add'）：只改 ox/oy/sx/sy/orot/ma，结束后回到原状，
 * 因此可以和位置、颜色等补间任意叠加。
 */

export const TA = 0.16;
export const TL = 0.84;
export const jumpWarp = (p) => EASINGS.inOut(clamp((p - TA) / (TL - TA)));

export function jumpFn(h, half) {
  return (L, p) => {
    let sy;
    if (p < TA) {
      sy = 1 - 0.2 * EASINGS.out(p / TA);
    } else if (p < TL) {
      const hq = (p - TA) / (TL - TA);
      L.oy -= h * 4 * hq * (1 - hq);
      sy = lerp(0.8, 1, EASINGS.out(clamp(hq / 0.22))) + 0.1 * Math.sin(Math.PI * hq);
    } else {
      sy = 1 - 0.22 * Math.sin(Math.PI * ((p - TL) / (1 - TL)));
    }
    L.sy *= sy;
    L.sx /= sy;
    L.oy += (1 - sy) * half;
  };
}

export const pulseFn = (amount) => (L, p) => {
  const k = 1 + amount * Math.sin(Math.PI * p);
  L.sx *= k;
  L.sy *= k;
};

export const shakeFn = (amp, freq = 8) => (L, p) => {
  L.ox += amp * Math.sin(p * freq * Math.PI * 2) * (1 - p);
};

/** 闪烁：透明度快速明暗几次，结束回到原状。参数 = 闪烁次数（默认 3） */
export const flashFn = (times = 3) => (L, p) => {
  const k = 0.5 + 0.5 * Math.cos(p * Math.PI * 2 * times);
  L.ma *= 0.3 + 0.7 * k;
};

/** 摆动：绕中心左右摇摆并衰减（像不倒翁）。参数 = 摆角（度，默认 12） */
export const wobbleFn = (deg = 12, freq = 3) => (L, p) => {
  L.orot += ((deg * Math.PI) / 180) * Math.sin(p * Math.PI * 2 * freq) * (1 - p);
};

/** 行走时的一步一跳：与位置补间使用同一条缓动，脚步随位移均匀分布 */
export function hopFn(steps, hop, half, ease) {
  return (L, p) => {
    const k = ease(p) * steps;
    const arc = Math.sin(Math.PI * (k - Math.floor(k + 1e-9)));
    const s = 1 + 0.1 * arc;
    L.oy -= hop * arc;
    L.sy *= s;
    L.sx /= s;
    L.oy += (1 - s) * half;
  };
}

/** 自定义关键帧：相对当前状态叠加；loops 次循环，yoyo 时奇数次反向 */
export function animFn(anim, loops, yoyo, cw, ch) {
  const keys = anim.keys;
  return (L, p) => {
    const x = p * loops;
    const li = Math.min(loops - 1, Math.floor(x));
    let lp = x - li;
    if (yoyo && li % 2 === 1) lp = 1 - lp;
    let j = 0;
    while (j < keys.length - 2 && lp > keys[j + 1].t) j++;
    const a = keys[j], b = keys[j + 1];
    const span = b.t - a.t;
    const e = b.ease(span > 1e-9 ? clamp((lp - a.t) / span) : 1);
    const v = (k) => lerp(a[k], b[k], e);
    L.ox += v('dx') * cw;
    L.oy += v('dy') * ch;
    L.orot += (v('rot') * Math.PI) / 180;
    const s = v('scale');
    L.sx *= s;
    L.sy *= s;
    L.ma *= v('alpha');
  };
}

/** 登场 */
export function introFn(mode, dist) {
  switch (mode) {
    case 'fade':
      return (L, p) => { L.ma *= EASINGS.inOut(p); };
    case 'drop':
      return (L, p) => { L.oy -= dist * (1 - EASINGS.bounce(p)); L.ma *= EASINGS.out(Math.min(1, p * 3)); };
    default: // pop
      return (L, p) => {
        const k = Math.max(0, EASINGS.back(p));
        L.sx *= k;
        L.sy *= k;
        L.ma *= EASINGS.out(Math.min(1, p * 2));
      };
  }
}

/** 退场：结束后保持消失 */
export function outFn(mode) {
  if (mode === 'pop') {
    return (L, p) => {
      const k = Math.max(0, 1 - EASINGS.in(p));
      L.sx *= k;
      L.sy *= k;
      L.ma *= 1 - EASINGS.out(Math.min(1, p * 1.5));
    };
  }
  return (L, p) => { L.ma *= 1 - EASINGS.inOut(p); };
}
