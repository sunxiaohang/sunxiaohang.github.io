export const FONT = '"Inter","Microsoft YaHei UI","PingFang SC","Segoe UI",system-ui,sans-serif';

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 按宽度逐字折行（兼容中文）；| 与 \n 表示强制换行 */
export function wrapText(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split(/\\n|\|/)) {
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; }
      else line += ch;
    }
    out.push(line);
  }
  return out;
}
