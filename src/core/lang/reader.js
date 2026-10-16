import { resolveEase, EASE_NAMES } from '../util/ease.js';
import { parseColor } from '../util/color.js';

export class Diagnostics {
  constructor() {
    this.list = [];
    this.seen = new Set();
  }

  add(severity, code, message, at, hint) {
    const line = at?.line ?? 0, col = at?.col ?? 0;
    const key = `${severity}|${code}|${line}|${col}|${message}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.list.push({ severity, code, message, line, col, ...(hint ? { hint } : {}) });
  }

  error(code, message, at, hint) { this.add('error', code, message, at, hint); }
  warn(code, message, at, hint) { this.add('warning', code, message, at, hint); }
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function suggest(word, candidates) {
  let best = null, bd = Infinity;
  for (const c of candidates) {
    const d = levenshtein(String(word).toLowerCase(), String(c).toLowerCase());
    if (d < bd) { bd = d; best = c; }
  }
  return best !== null && bd <= Math.max(1, Math.floor(String(word).length / 3)) ? best : null;
}

export function parsePair(raw) {
  const parts = String(raw).replace(/[()（）[\]]/g, ' ').split(/[\s,，;；]+/).filter(Boolean).map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) ? parts : null;
}

/** "3,4" 或棋类写法 "H8"（字母=列，数字=行） */
export function parsePos(raw) {
  const s = String(raw).trim();
  const m = /^([A-Za-z])\s*(\d+)$/.exec(s);
  if (m) return [m[1].toUpperCase().charCodeAt(0) - 64, +m[2]];
  return parsePair(s);
}

/** 长度：数字=像素；1.5c=1.5 个格子 */
export function parseLen(raw, unit) {
  const m = /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*(c|px)?\s*$/i.exec(String(raw));
  if (!m) return null;
  const v = parseFloat(m[1]);
  return m[2] && m[2].toLowerCase() === 'c' ? v * unit : v;
}

/**
 * 唯一的手工数字解析入口：整个 core 里需要把"一串文本"变成数字时都走这里，
 * 不要各文件自己 parseFloat / Number(...)。空串与非法值都返回 null。
 */
export function toNum(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

export function checkAttrs(node, allowed, diag) {
  const names = [...allowed];
  const set = new Set(names);
  for (const name of Object.keys(node.attrs)) {
    if (set.has(name)) continue;
    const m = /^(.+)\.ease$/.exec(name);
    if (m && set.has(m[1])) continue;
    const s = suggest(name, names);
    diag.warn(
      'W_UNKNOWN_ATTR',
      `<${node.tag}> 不认识属性 "${name}"`,
      node.attrPos[name],
      s ? `是不是想写 "${s}"？` : `可用属性：${names.join(', ')}`,
    );
  }
}

/** 读取节点属性并做类型校验；出错时写入诊断并回退到默认值。 */
export class Reader {
  constructor(node, diag, unit = 1, theme = null) {
    this.node = node;
    this.diag = diag;
    this.unit = unit;
    this.theme = theme; // 语义色表 { accent: [r,g,b,a], ... }
  }

  at(name) { return this.node.attrPos[name] || this.node; }
  has(name) { return Object.hasOwn(this.node.attrs, name); }
  raw(name) { return this.node.attrs[name]; }
  str(name, def) { return this.has(name) ? this.raw(name) : def; }
  flag(name) { return this.has(name) && this.raw(name).trim().toLowerCase() !== 'false'; }

  bool(name, def) {
    if (!this.has(name)) return def;
    const v = this.raw(name).trim().toLowerCase();
    if (v === '' || ['true', '1', 'yes', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'off'].includes(v)) return false;
    this.diag.error('E_BAD_VALUE', `属性 ${name} 需要 true/false，实际是 "${this.raw(name)}"`, this.at(name));
    return def;
  }

  num(name, def, { min = -Infinity, max = Infinity } = {}) {
    if (!this.has(name)) return def;
    const text = this.raw(name).trim();
    const v = text === '' ? NaN : Number(text);
    if (!Number.isFinite(v)) {
      this.diag.error('E_BAD_VALUE', `属性 ${name} 需要数字，实际是 "${this.raw(name)}"`, this.at(name));
      return def;
    }
    if (v < min || v > max) {
      this.diag.warn('W_RANGE', `属性 ${name}=${v} 超出范围 [${min}, ${max}]，已修正`, this.at(name));
      return Math.min(max, Math.max(min, v));
    }
    return v;
  }

  /** 缺省属性（值为空）取 def，否则解析数字 */
  numOr(name, def, range) {
    return this.raw(name).trim() === '' ? def : this.num(name, def, range);
  }

  /**
   * 可选数字：属性不存在或不是数字时返回 def，且**不报诊断**。
   * 用于"这一段文本里有个可选数字"的场合（如 gradient="linear 45" 的 45），
   * 让这类解析也统一走 reader，而不是各处自己 Number()。
   */
  optNum(name, def) {
    const v = toNum(this.raw(name));
    return v === null ? def : v;
  }

  len(name, def, range) {
    if (!this.has(name)) return def;
    const v = parseLen(this.raw(name), this.unit);
    if (v === null || !Number.isFinite(v)) {
      this.diag.error('E_BAD_VALUE', `属性 ${name} 需要长度（如 40 或 1.5c），实际是 "${this.raw(name)}"`, this.at(name));
      return def;
    }
    if (range && v < (range.min ?? -Infinity)) {
      this.diag.warn('W_RANGE', `属性 ${name}=${v} 小于下限 ${range.min}，已修正`, this.at(name));
      return range.min;
    }
    return v;
  }

  lenOr(name, def, range) {
    return this.raw(name).trim() === '' ? def : this.len(name, def, range);
  }

  pair(name) {
    if (!this.has(name)) return undefined;
    const p = parsePair(this.raw(name));
    if (!p) {
      this.diag.error('E_BAD_VALUE', `属性 ${name} 需要两个数字 "x,y"，实际是 "${this.raw(name)}"`, this.at(name));
      return null;
    }
    return p;
  }

  /** "dx,dy"：两个长度（像素或 .3c），用于与 size 同单位的偏移 */
  lenPair(name) {
    if (!this.has(name)) return undefined;
    const parts = this.raw(name).trim().split(/[\s,，;；]+/).filter(Boolean).map((p) => parseLen(p, this.unit));
    if (parts.length !== 2 || parts.some((v) => v === null || !Number.isFinite(v))) {
      this.diag.error('E_BAD_VALUE', `属性 ${name} 需要两个长度 "dx,dy"（如 0,.3c 或 12,-8），实际是 "${this.raw(name)}"`, this.at(name));
      return null;
    }
    return parts;
  }

  pos(name) {
    if (!this.has(name)) return undefined;
    const p = parsePos(this.raw(name));
    if (!p) {
      this.diag.error('E_BAD_VALUE', `属性 ${name} 需要格子坐标 "列,行" 或 H8，实际是 "${this.raw(name)}"`, this.at(name));
      return null;
    }
    return p;
  }

  posList(name) {
    if (!this.has(name)) return undefined;
    const out = [];
    for (const tok of this.raw(name).trim().split(/\s+/).filter(Boolean)) {
      const p = parsePos(tok);
      if (!p) {
        this.diag.error('E_BAD_VALUE', `属性 ${name} 中的 "${tok}" 不是格子坐标`, this.at(name));
        return null;
      }
      out.push(p);
    }
    return out;
  }

  color(name, def) {
    if (!this.has(name)) return def;
    const raw = this.raw(name).trim();
    // 语义色优先：fill="accent" 命中 theme 里声明的 accent
    if (this.theme && Object.hasOwn(this.theme, raw)) return this.theme[raw];
    const c = parseColor(raw);
    if (!c) {
      this.diag.error('E_BAD_COLOR', `无法识别的颜色 "${this.raw(name)}"`, this.at(name), '支持 #rgb / #rrggbb / rgb() / hsl() / 常用色名 / none / 语义色');
      return def;
    }
    return c;
  }

  ease(name, def) {
    const raw = this.has(name) ? this.raw(name) : def;
    const fn = resolveEase(raw);
    if (fn) return fn;
    this.diag.warn('W_BAD_EASE', `未知缓动 "${raw}"，已改用 ${def}`, this.at(name), `可用：${EASE_NAMES.join(', ')} 或 cubic(x1,y1,x2,y2)`);
    return resolveEase(def);
  }
}
