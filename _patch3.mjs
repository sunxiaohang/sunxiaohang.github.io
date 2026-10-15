import { readFileSync, writeFileSync } from 'node:fs';

function patch(file, fn) {
  let t = readFileSync(file, 'utf8');
  const crlf = t.includes('\r\n');
  t = t.replace(/\r\n/g, '\n');
  const swap = (a, b, all = false) => {
    if (!t.includes(a)) throw new Error(`${file} 找不到：${a.slice(0, 50)}`);
    t = all ? t.split(a).join(b) : t.replace(a, b);
  };
  fn(swap);
  writeFileSync(file, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('已更新', file);
}

// ---- reader：长度对 ----
patch('src/core/lang/reader.js', (swap) => {
  swap(`  pos(name) {
    if (!this.has(name)) return undefined;`, `  /** "dx,dy"：两个长度（像素或 .3c），用于与 size 同单位的偏移 */
  lenPair(name) {
    if (!this.has(name)) return undefined;
    const parts = this.raw(name).trim().split(/[\\s,，;；]+/).filter(Boolean).map((p) => parseLen(p, this.unit));
    if (parts.length !== 2 || parts.some((v) => v === null || !Number.isFinite(v))) {
      this.diag.error('E_BAD_VALUE', \`属性 \${name} 需要两个长度 "dx,dy"（如 0,.3c 或 12,-8），实际是 "\${this.raw(name)}"\`, this.at(name));
      return null;
    }
    return parts;
  }

  pos(name) {
    if (!this.has(name)) return undefined;`);
});

// ---- entities：off 偏移 ----
patch('src/core/compile/entities.js', (swap) => {
  swap(`  if (POSITIONAL.has(type)) {
    [init.x, init.y] = readPlace(r, ctx);`, `  if (POSITIONAL.has(type)) {
    [init.x, init.y] = readPlace(r, ctx);
    // off：在 at 之外再偏移 dx,dy，单位与 size 一致（像素或 .3c）。
    // at 的小数是“格子”单位（随行高列宽变化），而 size 是 c 单位；在卡片里摆文字时请用 off，两者才不会错位。
    const off = r.lenPair('off');
    if (off) { init.x += off[0]; init.y += off[1]; }`);
});

// ---- schema：off 属性 ----
patch('src/core/lang/schema.js', (swap) => {
  swap("export const STATIC_ATTRS = new Set(['id',", "export const STATIC_ATTRS = new Set(['off', 'id',");
  swap("  px: B('位置：像素坐标 \"x,y\"（与 at 二选一）'),", "  px: B('位置：像素坐标 \"x,y\"（与 at 二选一）'),\n  off: B('在 at 的基础上再偏移 \"dx,dy\"，单位与 size 相同（像素或 .3c）。在卡片 / 面板里摆文字请用它，不要给 at 加小数——at 的小数按行高列宽算，和 c 单位对不齐'),");
  swap("const SHAPE = [...BASE, 'at', 'px', 'size',", "const SHAPE = [...BASE, 'at', 'px', 'off', 'size',");
  swap("text: [...BASE, 'at', 'px', 'size',", "text: [...BASE, 'at', 'px', 'off', 'size',");
  swap("icon: [...BASE, 'at', 'px', 'size',", "icon: [...BASE, 'at', 'px', 'off', 'size',");
  swap("ring: [...BASE, 'at', 'px', 'size',", "ring: [...BASE, 'at', 'px', 'off', 'size',");
  swap("note: [...BASE, 'at', 'px', 'size',", "note: [...BASE, 'at', 'px', 'off', 'size',");
});

// ---- ir：label 字号用真实度量按宽度收缩 ----
patch('src/render/ir.js', (swap) => {
  swap("import { FONT, wrapText } from './util.js';", "import { labelFontSize } from '../core/util/label.js';\nimport { FONT, wrapText } from './util.js';");
  swap("        color: L.color, label: L.label, glow: scene.glow,", "        color: L.color, label: L.label, glow: scene.glow,\n        labelFs: L.label ? labelFontSize(e.type, L.w, L.h, L.label, (txt, px) => measure(txt, `700 ${px}px ${FONT}`)) : 0,");
});

// ---- shapes：用 IR 给的 labelFs ----
patch('src/render/shapes.js', (swap) => {
  swap(`    const m = boxed ? Math.min(item.w, item.h) : s;
    const n = [...String(item.label)].length;
    const fit = n > 1 ? Math.min(0.52, 1.1 / n + 0.06) : 0.52;
    ctx.font = \`700 \${Math.max(10, m * fit)}px \${FONT}\`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, 0, m * 0.02);`, `    const m = boxed ? Math.min(item.w, item.h) : s;
    const fs = item.labelFs || m * 0.4;
    ctx.font = \`700 \${fs}px \${FONT}\`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, 0, fs * 0.04);`);
});
