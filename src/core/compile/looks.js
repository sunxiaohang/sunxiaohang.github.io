import { toNum } from '../lang/reader.js';
import { suggest } from '../lang/reader.js';
import { GRADABLE, BLEND_MODES, EMIT_MODES } from '../lang/schema.js';
import { col } from './scene.js';

/**
 * 「外观类」属性的读取：渐变、混合、裁剪、文字格式、粒子发射器。
 *
 * 为什么单独成文件：这些都是"把节点上的几个属性翻译成对象字段"的纯函数，
 * 和实体的几何/定位无关。放在 entities.js 里会让那个文件越过 400 行的红线，
 * 也会把"一个实体的构造"和"一类属性的解析"混在一起。
 * 这里的函数都接收 (Reader, 承载对象, 初始化字段)，不碰编译上下文以外的状态。
 */

/** 渐变方式：gradient="linear" / "linear 135"（角度）/ "radial"。返回 { kind, angle } */
function readGradient(r) {
  if (!r.has('gradient')) return { kind: 'linear', angle: 135 };
  const toks = r.raw('gradient').trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
  const kind = toks[0] === 'radial' ? 'radial' : 'linear';
  return { kind, angle: toNum(toks[1]) ?? 135 };
}

/** 读取渐变填充：写了 fill2 才生效，挂到 ent.grad = { radial, angle } 并把第二色放进 init.fill2 */
export function readGradFill(r, ent, init) {
  if (!GRADABLE.has(ent.type) || !r.has('fill2')) return;
  const c2 = r.color('fill2', null);
  if (!c2) return;
  init.fill2 = c2;
  const g = readGradient(r);
  ent.grad = { radial: g.kind === 'radial', angle: g.angle };
}

/** 通用视觉修饰：blur（可动画，入 init）/ blend（静态，入 ent）/ clip（容器 id，入 ent，稍后解析） */
export function readLook(r, ent, ctx, init) {
  const { diag } = ctx;
  if (r.has('blur')) init.blur = r.len('blur', 0, { min: 0 });
  if (r.has('blend')) {
    const v = r.raw('blend').trim().toLowerCase();
    if (BLEND_MODES.includes(v)) { if (v !== 'normal') ent.blend = v; }
    else {
      const s = suggest(v, BLEND_MODES);
      diag.error('E_BAD_VALUE', `未知混合模式 "${v}"`, r.at('blend'), s ? `是不是想写 "${s}"？` : `可用：${BLEND_MODES.join(' / ')}`);
    }
  }
  if (r.has('clip')) ent.clipRef = r.raw('clip').trim(); // 延迟到全部对象建好后解析成 index
}

/** 文字显现进度：reveal 0~1。存进 init.reveal */
export function readReveal(r, init) {
  if (r.has('reveal')) init.reveal = r.num('reveal', 1, { min: 0, max: 1 });
}

/**
 * 数字格式：fmt 用 # 代表数值（避开 {} 插值）。整数部分自动加千分位；
 * #.0 / #.00 控制小数位。如 fmt="# 人" → "1,280 人"，fmt="¥#.00" → "¥1,280.00"，fmt="#%" → "87%"。
 * 返回 (val) => 字符串。没写 # 时按整数显示。
 */
export function makeFormatter(fmt) {
  const f = fmt && fmt.includes('#') ? fmt : '#';
  return (val) => f.replace(/#(\.0+)?/g, (_, dot) => {
    const digits = dot ? dot.length - 1 : 0;
    const [int, dec] = Number(val).toFixed(digits).split('.');
    const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return dec ? `${g}.${dec}` : g;
  });
}

/** 数字滚动：count 目标值 + fmt 格式。记在 ent 上。创建时直接显示目标值，滚动发生在步骤里改 count 时 */
export function readCount(r, ent, init) {
  const fmt = makeFormatter(r.str('fmt', ''));
  ent.count = { fmt };
  if (r.has('count')) {
    const to = r.num('count', 0);
    if (Number.isFinite(to)) { init.cv = to; init.text = fmt(to); return; }
  }
  // 只写了 fmt、没写 count：把已有的数字 text 套上格式
  const cur = toNum(init.text);
  if (r.has('fmt') && cur !== null) { init.cv = cur; init.text = fmt(cur); }
}

/** 确定性小随机：mulberry32，种子来自 scene.seed + emitter 序号，保证每次结果一致 */
export function makeRng(seed) {
  let a = Math.floor(seed) | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 粒子发射器：编译期用 seeded RNG 预生成每颗粒子的"出生参数"（相位、角度、初速、尺寸抖动），
 * 运行时（渲染合成）按绝对时间算出每颗粒子此刻的位置与透明度。
 * 整组粒子是一个 IR 节点，不是 N 个实体。
 */
export function compileEmitter(r, ctx, init, ent, scene) {
  const { diag } = ctx;
  const U = scene.unit;
  const mode = r.str('mode', 'burst');
  if (!EMIT_MODES.includes(mode)) {
    diag.error('E_BAD_VALUE', `mode 只能是 ${EMIT_MODES.join(' / ')}，实际是 "${mode}"`, r.at('mode'));
    ent.emit = null;
    return;
  }
  const count = Math.round(r.num('count', 40, { min: 1, max: 2000 }));
  const spread = r.len('spread', 0, { min: 0 });
  const life = r.num('life', 1.4, { min: 0.1, max: 60 });
  const speed = r.len('speed', U * 1.2, { min: 0 });     // 初速度（像素/秒）
  const gravity = r.num('gravity', 0) * U;               // 格/秒² → 像素/秒²
  const wind = r.num('wind', 0) * U;
  init.size = r.len('size', Math.max(4, U * 0.12), { min: 0.5 });
  init.fill = r.color('fill', scene.theme.accent || scene.series[0] || col('#7c6cff'));
  if (r.has('fill2')) { const c2 = r.color('fill2', null); if (c2) init.fill2 = c2; }
  const loop = mode !== 'burst'; // burst 一次性（粒子一轮后消失）；其余模式连续循环

  const rng = makeRng(scene.seed * 2654435761 + ent.index * 40503 + 7);
  const rand = (a, b) => a + (b - a) * rng();
  const particles = [];
  for (let i = 0; i < count; i++) {
    // phase：循环模式下错开出生时间，让粒子流连续；burst 时都从 0 出生（略微抖动避免整齐划一）
    const phase = loop ? rng() : rand(0, 0.06);
    const a = rng() * Math.PI * 2;      // 发射角 / 位置角
    const rr = Math.sqrt(rng());         // 源半径均匀分布
    let vx = 0, vy = 0, ox = Math.cos(a) * spread * rr, oy = Math.sin(a) * spread * rr;
    switch (mode) {
      case 'burst': vx = Math.cos(a) * speed * rand(0.4, 1); vy = Math.sin(a) * speed * rand(0.4, 1); break;
      case 'fountain': { const dir = -Math.PI / 2 + rand(-0.5, 0.5); const s = speed * rand(0.7, 1); vx = Math.cos(dir) * s; vy = Math.sin(dir) * s; break; }
      case 'rise': vy = -speed * rand(0.6, 1); vx = rand(-0.2, 0.2) * speed; ox = rand(-spread, spread); oy = rand(-0.3, 0.3) * spread; break;
      case 'fall': vy = speed * rand(0.6, 1); vx = rand(-0.1, 0.1) * speed; ox = rand(-spread, spread); oy = rand(-spread, spread); break;
      case 'snow': vy = speed * rand(0.3, 0.7); vx = rand(-0.3, 0.3) * speed; ox = rand(-spread, spread); oy = rand(-spread, spread); break;
    }
    particles.push({ phase, ox, oy, vx, vy, s: rand(0.6, 1.3), sway: rand(0, Math.PI * 2) });
  }
  ent.emit = { mode, loop, life, gravity, wind, particles };
}
