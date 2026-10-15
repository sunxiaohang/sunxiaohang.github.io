/**
 * 内置矢量图标（交通工具）。每个图标画在 [-0.5, 0.5] 的单位方框里，“车头”朝右（+x）。
 * 不依赖字体或图片：纯路径，所以颜色跟随 fill、任意缩放不糊，导出视频也和预览一致。
 *
 * 路径指令（数组）：
 *   ['M', x, y]  ['L', x, y]  ['Q', cx, cy, x, y]  ['Z']
 * 每个图标是 { paths: [{ d: […], fill?: 'body'|'glass'|'dark' }] }，body 用图形的 fill，
 * glass 是与 fill 对比的浅色，dark 是半透明深色，让一个图标也有层次。
 */

const rr = (x, y, w, h, r) => [
  ['M', x + r, y], ['L', x + w - r, y], ['Q', x + w, y, x + w, y + r], ['L', x + w, y + h - r],
  ['Q', x + w, y + h, x + w - r, y + h], ['L', x + r, y + h], ['Q', x, y + h, x, y + h - r], ['L', x, y + r], ['Q', x, y, x + r, y], ['Z'],
];

export const GLYPHS = {
  /** 小汽车（俯视）：圆角车身 + 前后挡风玻璃 + 车顶 */
  car: {
    label: '小汽车',
    paths: [
      { d: rr(-0.5, -0.27, 1, 0.54, 0.2), fill: 'body' },
      { d: rr(0.12, -0.2, 0.2, 0.4, 0.07), fill: 'glass' },
      { d: rr(-0.33, -0.2, 0.14, 0.4, 0.05), fill: 'glass' },
      { d: rr(-0.17, -0.19, 0.27, 0.38, 0.06), fill: 'dark' },
    ],
  },
  /** 公交车（俯视）：长车身 + 一排车窗 */
  bus: {
    label: '公交车',
    paths: [
      { d: rr(-0.5, -0.24, 1, 0.48, 0.12), fill: 'body' },
      ...[-0.38, -0.22, -0.06, 0.1].map((x) => ({ d: rr(x, -0.17, 0.12, 0.34, 0.03), fill: 'glass' })),
      { d: rr(0.27, -0.18, 0.15, 0.36, 0.05), fill: 'glass' },
    ],
  },
  /** 火车（俯视）：流线形车头 + 车厢，一排车窗，车头有前窗 */
  train: {
    label: '火车',
    paths: [
      { d: [['M', -0.5, -0.25], ['L', 0.02, -0.25], ['Q', 0.5, -0.25, 0.5, 0], ['Q', 0.5, 0.25, 0.02, 0.25], ['L', -0.5, 0.25], ['Z']], fill: 'body' },
      // 车头前窗（梯形）
      { d: [['M', 0.2, -0.17], ['Q', 0.38, -0.12, 0.42, 0], ['Q', 0.38, 0.12, 0.2, 0.17], ['Z']], fill: 'glass' },
      // 车厢侧窗：四扇，等距
      ...[-0.42, -0.26, -0.1, 0.06].map((x) => ({ d: rr(x, -0.15, 0.1, 0.3, 0.025), fill: 'glass' })),
    ],
  },
  /** 飞机（俯视）：机身 + 后掠机翼 + 尾翼 */
  plane: {
    label: '飞机',
    paths: [
      { d: [['M', 0.5, 0], ['L', 0.28, -0.05], ['L', 0.06, -0.46], ['L', -0.06, -0.46], ['L', -0.02, -0.06], ['L', -0.32, -0.04], ['L', -0.42, -0.2], ['L', -0.5, -0.2], ['L', -0.46, 0], ['L', -0.5, 0.2], ['L', -0.42, 0.2], ['L', -0.32, 0.04], ['L', -0.02, 0.06], ['L', -0.06, 0.46], ['L', 0.06, 0.46], ['L', 0.28, 0.05], ['Z']], fill: 'body' },
    ],
  },
  /** 船（俯视）：尖船头 + 驾驶舱 */
  ship: {
    label: '船',
    paths: [
      { d: [['M', 0.5, 0], ['Q', 0.3, -0.26, 0, -0.26], ['L', -0.5, -0.26], ['L', -0.5, 0.26], ['L', 0, 0.26], ['Q', 0.3, 0.26, 0.5, 0], ['Z']], fill: 'body' },
      { d: rr(-0.22, -0.13, 0.3, 0.26, 0.06), fill: 'glass' },
    ],
  },
};

export const GLYPH_NAMES = Object.keys(GLYPHS);

/** 在以原点为中心、边长 size 的方框里画一个图标。body / glass / dark 三种填充由调用方给色 */
export function drawGlyph(ctx, name, size, colors) {
  const g = GLYPHS[name];
  if (!g) return false;
  ctx.save();
  ctx.scale(size, size);
  for (const p of g.paths) {
    ctx.beginPath();
    for (const [op, ...a] of p.d) {
      if (op === 'M') ctx.moveTo(a[0], a[1]);
      else if (op === 'L') ctx.lineTo(a[0], a[1]);
      else if (op === 'Q') ctx.quadraticCurveTo(a[0], a[1], a[2], a[3]);
      else ctx.closePath();
    }
    ctx.fillStyle = colors[p.fill] || colors.body;
    ctx.fill();
  }
  ctx.restore();
  return true;
}
