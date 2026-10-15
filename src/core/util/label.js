/**
 * 图形里 label 的字号：先按图形高度取（单字最大 0.52 倍），再按“文字实际宽度”缩到装得下为止。
 * 渲染（真实度量）与 lint（估算度量）共用这一个实现，所以“标签会不会溢出 / 被压得太小”两边答案一致。
 *
 * measure(text, fontSizePx) → 宽度。
 */

const isCJK = (ch) => /[\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uffef]/.test(ch);

/** 无画布时的估算：中文方块字 ≈ 1em，拉丁/数字 ≈ 0.6em（粗体），空格 ≈ 0.3em */
export function estimateWidth(text, fs) {
  let w = 0;
  for (const ch of String(text ?? '')) w += (isCJK(ch) ? 1 : ch === ' ' ? 0.3 : 0.6) * fs;
  return w;
}

/** 文字可用的宽度占图形的比例：矩形/椭圆较宽，圆内接较窄，三角/星形更窄 */
const FIT = { rect: 0.86, ellipse: 0.78, circle: 0.74, triangle: 0.5, star: 0.5 };

export function labelFontSize(shape, w, h, label, measure = estimateWidth) {
  const text = String(label ?? '');
  if (!text) return 0;
  const boxed = shape === 'rect' || shape === 'ellipse';
  const m = boxed ? Math.min(w, h) : Math.max(w, h);
  const avail = (boxed ? w : m) * (FIT[shape] ?? 0.74);
  const perEm = Math.max(0.2, measure(text, 100) / 100);
  return Math.max(6, Math.min(m * 0.52, avail / perEm));
}

/** 低于这个字号读不清：lint 会提醒“标签太长” */
export const MIN_READABLE_LABEL = 9;
