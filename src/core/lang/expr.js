import { resolveEase } from '../util/ease.js';

export class ExprError extends Error {
  constructor(message, index = 0) {
    super(message);
    this.index = index;
  }
}

export class Scope {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
  }
  has(n) { for (let s = this; s; s = s.parent) if (s.vars.has(n)) return true; return false; }
  get(n) { for (let s = this; s; s = s.parent) if (s.vars.has(n)) return s.vars.get(n); return undefined; }
  declare(n, v) { this.vars.set(n, v); }
  assign(n, v) {
    for (let s = this; s; s = s.parent) if (s.vars.has(n)) { s.vars.set(n, v); return true; }
    return false;
  }
}

export const truthy = (v) =>
  !(v === false || v === 0 || v === '' || v == null || v === 'false' || (Array.isArray(v) && v.length === 0));

// ---------------- 词法 ----------------
const TWO = ['**', '&&', '||', '==', '!=', '<=', '>='];
const ONE = '+-*/%<>!?:()[],.';

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const rest = src.slice(i);
    let m;
    if ((m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest))) {
      out.push({ t: 'num', v: parseFloat(m[0]), i });
      i += m[0].length;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\' && j + 1 < src.length) { const n = src[j + 1]; s += n === 'n' ? '\n' : n; j += 2; }
        else s += src[j++];
      }
      if (j >= src.length) throw new ExprError('字符串缺少结束引号', i);
      out.push({ t: 'str', v: s, i });
      i = j + 1;
      continue;
    }
    if ((m = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(rest))) {
      const w = m[0];
      const kw = w === 'and' ? '&&' : w === 'or' ? '||' : w === 'not' ? '!' : null;
      out.push(kw ? { t: 'op', v: kw, i } : { t: 'id', v: w, i });
      i += w.length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO.includes(two)) { out.push({ t: 'op', v: two, i }); i += 2; continue; }
    if (ch === '=') throw new ExprError('比较请用 ==；给变量赋值请用 <set>', i);
    if (ONE.includes(ch)) { out.push({ t: 'op', v: ch, i }); i++; continue; }
    throw new ExprError(`无法识别的字符 "${ch}"`, i);
  }
  return out;
}

// ---------------- 语法 ----------------
function parse(src) {
  const toks = tokenize(src);
  if (!toks.length) throw new ExprError('表达式为空');
  let p = 0;
  const isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;
  const eatOp = (v) => (isOp(v) ? (p++, true) : false);
  const need = (v) => { if (!eatOp(v)) throw new ExprError(`缺少 "${v}"`, toks[p]?.i ?? src.length); };
  const bin = (next, ops) => () => {
    let a = next();
    while (toks[p] && toks[p].t === 'op' && ops.includes(toks[p].v)) {
      const op = toks[p++].v;
      a = { t: 'bin', op, a, b: next() };
    }
    return a;
  };

  const ternary = () => {
    const c = or();
    if (eatOp('?')) {
      const a = ternary();
      need(':');
      return { t: 'cond', c, a, b: ternary() };
    }
    return c;
  };
  const primary = () => {
    const tok = toks[p++];
    if (!tok) throw new ExprError('表达式不完整', src.length);
    if (tok.t === 'num' || tok.t === 'str') return { t: 'lit', v: tok.v };
    if (tok.t === 'id') {
      if (tok.v === 'true') return { t: 'lit', v: true };
      if (tok.v === 'false') return { t: 'lit', v: false };
      if (tok.v === 'null') return { t: 'lit', v: null };
      return { t: 'id', v: tok.v, i: tok.i };
    }
    if (tok.v === '(') { const e = ternary(); need(')'); return e; }
    if (tok.v === '[') {
      const items = [];
      if (!isOp(']')) do { items.push(ternary()); } while (eatOp(','));
      need(']');
      return { t: 'arr', items };
    }
    throw new ExprError(`意外的 "${tok.v}"`, tok.i);
  };
  const postfix = () => {
    let n = primary();
    for (;;) {
      if (isOp('(')) {
        if (n.t !== 'id') throw new ExprError('只能调用内置函数', toks[p].i);
        p++;
        const args = [];
        if (!isOp(')')) do { args.push(ternary()); } while (eatOp(','));
        need(')');
        n = { t: 'call', name: n.v, args, i: n.i };
      } else if (isOp('[')) {
        p++;
        const idx = ternary();
        need(']');
        n = { t: 'idx', a: n, idx };
      } else if (isOp('.')) {
        p++;
        const t = toks[p++];
        if (!t || t.t !== 'id') throw new ExprError('"." 后面需要属性名', t?.i ?? src.length);
        n = { t: 'mem', a: n, name: t.v, i: t.i };
      } else return n;
    }
  };
  const pow = () => {
    const base = postfix();
    return eatOp('**') ? { t: 'bin', op: '**', a: base, b: unary() } : base;
  };
  const unary = () => {
    if (isOp('!') || isOp('-')) {
      const op = toks[p++].v;
      return { t: 'un', op, a: unary() };
    }
    return pow();
  };
  const mul = bin(unary, ['*', '/', '%']);
  const add = bin(mul, ['+', '-']);
  const cmp = bin(add, ['<', '<=', '>', '>=']);
  const eq = bin(cmp, ['==', '!=']);
  const and = bin(eq, ['&&']);
  const or = bin(and, ['||']);

  const ast = ternary();
  if (p < toks.length) throw new ExprError(`多余的内容 "${toks[p].v}"`, toks[p].i);
  return ast;
}

// ---------------- 内置函数 ----------------
const N = (x, who) => {
  if (typeof x === 'number') return x;
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x);
  throw new ExprError(`${who} 需要数字，实际是 ${JSON.stringify(x)}`);
};
const arr = (x, who) => { if (!Array.isArray(x)) throw new ExprError(`${who} 需要数组`); return x; };
const fmt = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(6)));

const defs = {
  min: ['min(a, b, …)', '最小值', (cx, a) => Math.min(...a.map((x) => N(x, 'min')))],
  max: ['max(a, b, …)', '最大值', (cx, a) => Math.max(...a.map((x) => N(x, 'max')))],
  abs: ['abs(x)', '绝对值', (cx, [x]) => Math.abs(N(x, 'abs'))],
  floor: ['floor(x)', '向下取整', (cx, [x]) => Math.floor(N(x, 'floor'))],
  ceil: ['ceil(x)', '向上取整', (cx, [x]) => Math.ceil(N(x, 'ceil'))],
  round: ['round(x)', '四舍五入', (cx, [x]) => Math.round(N(x, 'round'))],
  sqrt: ['sqrt(x)', '平方根', (cx, [x]) => Math.sqrt(N(x, 'sqrt'))],
  sign: ['sign(x)', '符号 -1/0/1', (cx, [x]) => Math.sign(N(x, 'sign'))],
  sin: ['sin(x)', '正弦（弧度）', (cx, [x]) => Math.sin(N(x, 'sin'))],
  cos: ['cos(x)', '余弦（弧度）', (cx, [x]) => Math.cos(N(x, 'cos'))],
  tan: ['tan(x)', '正切（弧度）', (cx, [x]) => Math.tan(N(x, 'tan'))],
  atan2: ['atan2(y, x)', '反正切', (cx, [y, x]) => Math.atan2(N(y, 'atan2'), N(x, 'atan2'))],
  pow: ['pow(a, b)', '乘方', (cx, [a, b]) => Math.pow(N(a, 'pow'), N(b, 'pow'))],
  log: ['log(x)', '自然对数', (cx, [x]) => Math.log(N(x, 'log'))],
  exp: ['exp(x)', 'e 的幂', (cx, [x]) => Math.exp(N(x, 'exp'))],
  rad: ['rad(deg)', '角度转弧度', (cx, [d]) => (N(d, 'rad') * Math.PI) / 180],
  deg: ['deg(rad)', '弧度转角度', (cx, [r]) => (N(r, 'deg') * 180) / Math.PI],
  clamp: ['clamp(v, lo, hi)', '限制范围', (cx, [v, a, b]) => Math.min(N(b, 'clamp'), Math.max(N(a, 'clamp'), N(v, 'clamp')))],
  lerp: ['lerp(a, b, t)', '线性插值', (cx, [a, b, t]) => N(a, 'lerp') + (N(b, 'lerp') - N(a, 'lerp')) * N(t, 'lerp')],
  mod: ['mod(a, n)', '非负取余', (cx, [a, n]) => ((N(a, 'mod') % N(n, 'mod')) + N(n, 'mod')) % N(n, 'mod')],
  rand: ['rand() / rand(a, b)', '随机数（由 seed 决定，可复现）', (cx, a) => (a.length >= 2 ? N(a[0], 'rand') + cx.rng() * (N(a[1], 'rand') - N(a[0], 'rand')) : cx.rng())],
  randint: ['randint(a, b)', '随机整数（含两端）', (cx, [a, b]) => Math.floor(N(a, 'randint') + cx.rng() * (N(b, 'randint') - N(a, 'randint') + 1))],
  pick: ['pick(list)', '随机取一项', (cx, [l]) => { const x = arr(l, 'pick'); return x[Math.floor(cx.rng() * x.length)]; }],
  len: ['len(x)', '数组或字符串长度', (cx, [x]) => (Array.isArray(x) || typeof x === 'string' ? x.length : 0)],
  range: ['range(a, b, step)', '生成数组 a..b（含两端）', (cx, [a, b, s]) => {
    const from = N(a, 'range'), to = N(b, 'range'), st = Math.abs(s === undefined ? 1 : N(s, 'range')) || 1;
    if (Math.abs(to - from) / st > 5000) throw new ExprError('range 太长（上限 5000）');
    const out = [], dir = from <= to ? 1 : -1;
    for (let x = from; dir > 0 ? x <= to + 1e-9 : x >= to - 1e-9; x += dir * st) out.push(+x.toFixed(9));
    return out;
  }],
  split: ['split(text, sep)', '按分隔符拆成数组（默认按空白）', (cx, [t, s]) => {
    const str = String(t ?? '');
    return (s === undefined ? str.trim().split(/\s+/) : str.split(String(s))).filter((x) => x !== '');
  }],
  join: ['join(list, sep)', '数组拼成字符串', (cx, [l, s]) => arr(l, 'join').map(String).join(s === undefined ? ',' : String(s))],
  str: ['str(x)', '转字符串', (cx, [x]) => (typeof x === 'number' ? fmt(x) : String(x ?? ''))],
  num: ['num(x)', '转数字', (cx, [x]) => N(x, 'num')],
  upper: ['upper(s)', '转大写', (cx, [s]) => String(s ?? '').toUpperCase()],
  lower: ['lower(s)', '转小写', (cx, [s]) => String(s ?? '').toLowerCase()],
  letter: ['letter(n)', '1→A, 2→B …', (cx, [n]) => String.fromCharCode(64 + N(n, 'letter'))],
  col: ['col(ch)', 'A→1, B→2 …（与 letter 互逆）', (cx, [c]) => String(c ?? '').toUpperCase().charCodeAt(0) - 64],
  ease: ['ease(name, t)', '缓动函数求值：t 为 0~1，返回缓动后的进度。可用来沿任意曲线布点，如把缓动曲线画出来', (cx, [name, t]) => {
    const fn = resolveEase(String(name));
    if (!fn) throw new ExprError(`未知缓动 "${name}"`);
    return fn(Math.min(1, Math.max(0, N(t, 'ease'))));
  }],
  hsl: ['hsl(h, s, l)', '生成颜色字符串，s/l 为 0~100', (cx, [h, s, l]) => `hsl(${fmt(N(h, 'hsl'))},${fmt(N(s, 'hsl'))}%,${fmt(N(l, 'hsl'))}%)`],
  rgb: ['rgb(r, g, b)', '生成颜色字符串', (cx, [r, g, b]) => `rgb(${fmt(N(r, 'rgb'))},${fmt(N(g, 'rgb'))},${fmt(N(b, 'rgb'))})`],
};

const FUNCS = Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v[2]]));
export const FUNCTION_DOCS = Object.entries(defs).map(([name, [sig, doc]]) => ({ name, sig, doc }));
const CONSTS = { PI: Math.PI, TAU: Math.PI * 2, E: Math.E };
export const CONST_NAMES = Object.keys(CONSTS);

// ---------------- 求值 ----------------
const looseEq = (a, b) => a === b || (typeof a !== typeof b && String(a) === String(b));

function ev(n, sc, cx) {
  switch (n.t) {
    case 'lit': return n.v;
    case 'id':
      if (sc.has(n.v)) return sc.get(n.v);
      if (Object.hasOwn(CONSTS, n.v)) return CONSTS[n.v];
      throw new ExprError(`未定义的变量 "${n.v}"`, n.i);
    case 'arr': return n.items.map((x) => ev(x, sc, cx));
    case 'un': {
      const v = ev(n.a, sc, cx);
      return n.op === '!' ? !truthy(v) : -N(v, '负号');
    }
    case 'cond': return truthy(ev(n.c, sc, cx)) ? ev(n.a, sc, cx) : ev(n.b, sc, cx);
    case 'bin': {
      if (n.op === '&&') { const a = ev(n.a, sc, cx); return truthy(a) ? ev(n.b, sc, cx) : a; }
      if (n.op === '||') { const a = ev(n.a, sc, cx); return truthy(a) ? a : ev(n.b, sc, cx); }
      const a = ev(n.a, sc, cx), b = ev(n.b, sc, cx);
      switch (n.op) {
        case '+':
          if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
          if (typeof a === 'string' || typeof b === 'string') {
            const sa = typeof a === 'number' ? fmt(a) : String(a), sb = typeof b === 'number' ? fmt(b) : String(b);
            return sa + sb;
          }
          return N(a, '+') + N(b, '+');
        case '-': return N(a, '-') - N(b, '-');
        case '*': return N(a, '*') * N(b, '*');
        case '/': return N(a, '/') / N(b, '/');
        case '%': return N(a, '%') % N(b, '%');
        case '**': return Math.pow(N(a, '**'), N(b, '**'));
        case '==': return looseEq(a, b);
        case '!=': return !looseEq(a, b);
        default: {
          const x = typeof a === 'string' && typeof b === 'string' ? a : N(a, n.op);
          const y = typeof a === 'string' && typeof b === 'string' ? b : N(b, n.op);
          return n.op === '<' ? x < y : n.op === '<=' ? x <= y : n.op === '>' ? x > y : x >= y;
        }
      }
    }
    case 'call': {
      if (!Object.hasOwn(FUNCS, n.name)) throw new ExprError(`未知函数 "${n.name}"`, n.i);
      return FUNCS[n.name](cx, n.args.map((x) => ev(x, sc, cx)));
    }
    case 'idx': {
      const base = ev(n.a, sc, cx), i = N(ev(n.idx, sc, cx), '下标');
      if (!Array.isArray(base) && typeof base !== 'string') throw new ExprError('只有数组和字符串可以用 [下标]');
      if (!Number.isInteger(i) || i < 0 || i >= base.length) throw new ExprError(`下标 ${i} 越界（长度 ${base.length}，从 0 开始）`);
      return base[i];
    }
    case 'mem': {
      const base = ev(n.a, sc, cx);
      if (n.name === 'length' && (Array.isArray(base) || typeof base === 'string')) return base.length;
      throw new ExprError(`不支持 .${n.name}`, n.i);
    }
  }
  throw new ExprError('无法求值');
}

const cache = new Map();
export function parseExpr(src) {
  if (src.length > 2000) throw new ExprError('表达式过长（上限 2000 字符）');
  let ast = cache.get(src);
  if (!ast) {
    ast = parse(src);
    if (cache.size > 500) cache.clear();
    cache.set(src, ast);
  }
  return ast;
}

export function evalExpr(src, scope, cx) {
  return ev(parseExpr(src), scope, cx);
}
