import { Scope, evalExpr, ExprError, truthy } from './expr.js';
import { ENTITY_TYPES } from './schema.js';
import { resolveEase } from '../util/ease.js';
import { parsePos } from './reader.js';

const MAX_NODES = 60000;
const MAX_LOOPS = 40000;
const MAX_DEPTH = 40;
const IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const NUM = /^\s*-?(?:\d+\.?\d*|\.\d+)\s*$/;
const RANGE = /^\s*(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)\s*$/;
export const RESERVED_TAGS = new Set([
  ...ENTITY_TYPES, 'scene', 'step', 'layer', 'group', 'let', 'set', 'for', 'if', 'elseif', 'else', 'def', 'anim', 'change', 'k', 'theme', 'import', 'data', 'row', 'column',
]);

/** 流式布局 gap：格子数（纯数字或带 c 后缀，c 等价于格子） */
function parseGap(raw) {
  const m = /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*(c)?\s*$/i.exec(String(raw));
  return m ? parseFloat(m[1]) : null;
}

function makeRng(seed) {
  let a = Math.floor(seed) | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(6)));
export function toStr(v) {
  if (v == null) return '';
  if (typeof v === 'number') return fmt(v);
  if (Array.isArray(v)) return v.map(toStr).join(',');
  return String(v);
}
const autoType = (v) => (typeof v === 'string' && NUM.test(v) ? Number(v) : v);

function findClose(s, from) {
  let depth = 1;
  for (let i = from; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== ch) { if (s[j] === '\\') j++; j++; }
      i = j;
    } else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

/**
 * 展开编程语法（let/set/for/if/def/anim），输出只含 step / 对象 / layer / change 的普通节点树。
 * 所有属性值已完成 {表达式} 插值。
 */
export function expand(root, diag, dataSources = {}) {
  const seedRaw = root.attrs.seed;
  const seed = seedRaw !== undefined && Number.isFinite(Number(seedRaw)) ? Number(seedRaw) : 1;
  const cx = { rng: makeRng(seed) };
  const budget = { nodes: 0, loops: 0, over: false };
  const defs = new Map();
  const anims = new Map();
  const theme = {};
  const global = new Scope();
  const placed = new Map(); // id → [col, row]，供 after/below 相对定位
  // 数据源（<data>）：作为全局变量注入，供 <for in="{rows}"> 引用
  for (const [k, v] of Object.entries(dataSources)) global.declare(k, v);
  const posOf = (node, name) => (name && node.attrPos?.[name]) || node;

  const overBudget = (node, what) => {
    if (!budget.over) diag.error('E_TOO_BIG', `${what}超过上限，已停止展开`, node, '检查循环范围是否过大或 def 是否在递归调用自己');
    budget.over = true;
  };

  // ---------- 插值 ----------
  function interp(raw, scope, at, typed) {
    if (!raw.includes('{') && !raw.includes('}')) return raw;
    const parts = [];
    let lit = '', i = 0;
    while (i < raw.length) {
      const c = raw[i];
      if (c === '{') {
        if (raw[i + 1] === '{') { lit += '{'; i += 2; continue; }
        const end = findClose(raw, i + 1);
        if (end < 0) { diag.error('E_EXPR', '插值的 { 没有对应的 }', at); return raw; }
        if (lit) { parts.push(lit); lit = ''; }
        parts.push({ expr: raw.slice(i + 1, end) });
        i = end + 1;
      } else if (c === '}') {
        lit += c;
        i += raw[i + 1] === '}' ? 2 : 1;
      } else { lit += c; i++; }
    }
    if (lit) parts.push(lit);
    const run = (p) => {
      try {
        return evalExpr(p.expr, scope, cx);
      } catch (e) {
        if (!(e instanceof ExprError)) throw e;
        diag.error('E_EXPR', `表达式 {${p.expr.trim()}} 出错：${e.message}`, at);
        return '';
      }
    };
    if (typed && parts.length === 1 && typeof parts[0] !== 'string') return run(parts[0]);
    return parts.map((p) => (typeof p === 'string' ? p : toStr(run(p)))).join('');
  }

  const attrsOf = (n, scope) => {
    const out = {};
    for (const [k, v] of Object.entries(n.attrs)) out[k] = toStr(interp(v, scope, posOf(n, k), false));
    return out;
  };

  function evalTest(n, scope) {
    const raw = n.attrs.test;
    if (raw === undefined) { diag.error('E_MISSING_ATTR', `<${n.tag}> 缺少 test="条件"`, n); return false; }
    let src = raw.trim();
    if (src.startsWith('{') && src.endsWith('}')) src = src.slice(1, -1);
    try {
      return truthy(evalExpr(src, scope, cx));
    } catch (e) {
      if (!(e instanceof ExprError)) throw e;
      diag.error('E_EXPR', `条件 ${raw.trim()} 出错：${e.message}`, posOf(n, 'test'), e.message);
      return false;
    }
  }

  const rangeOf = (a, b, step, node) => {
    const out = [], dir = a <= b ? 1 : -1, st = Math.abs(step) || 1;
    if (Math.abs(b - a) / st > MAX_LOOPS) { overBudget(node, '循环次数'); return out; }
    for (let x = a; dir > 0 ? x <= b + 1e-9 : x >= b - 1e-9; x += dir * st) out.push(+x.toFixed(9));
    return out;
  };

  /**
   * 区间两端可以是表达式：in="1..n"、in="0..n-1"、in="1..(total-gone)"。
   * 只在原始写法形如 "左..右"（无 {} 整体包裹、无空白分隔的多词）时生效；
   * 两端都是纯数字时走原来的字面量路径，行为不变。
   */
  function rangeFromSource(raw, n, scope) {
    const s = raw.trim();
    if (RANGE.test(s)) return null; // 纯数字字面区间走原路径
    // 找到 {} 之外的第一个 ".."（避免把表达式内部的内容误切）
    let depth = 0, cut = -1;
    for (let k = 0; k < s.length - 1; k++) {
      const ch = s[k];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (depth === 0 && ch === '.' && s[k + 1] === '.') { cut = k; break; }
    }
    if (cut <= 0 || cut + 2 >= s.length) return null;
    const L = s.slice(0, cut).trim(), R = s.slice(cut + 2).trim();
    if (!L || !R) return null;
    const at = posOf(n, 'in');
    // 每一端：被 {} 整体包住就去掉花括号，否则就是裸表达式（变量、算式）
    const val = (src) => {
      const body = src.startsWith('{') && src.endsWith('}') ? src.slice(1, -1) : src;
      try {
        const v = evalExpr(body, scope, cx);
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new ExprError(`区间端点需要数字，实际是 ${JSON.stringify(v)}`);
        return v;
      } catch (e) {
        if (!(e instanceof ExprError)) throw e;
        diag.error('E_EXPR', `区间 "${s}" 的端点 "${src}" 出错：${e.message}`, at);
        return null;
      }
    };
    const a = val(L), b = val(R);
    if (a === null || b === null) return [];
    const step = n.attrs.step !== undefined ? Number(interp(n.attrs.step, scope, posOf(n, 'step'), false)) : 1;
    return rangeOf(a, b, Number.isFinite(step) ? step : 1, n);
  }

  function toItems(v, n, scope) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'number') return rangeOf(1, Math.floor(v), 1, n);
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s) return [];
      const m = RANGE.exec(s);
      if (m) {
        const step = n.attrs.step !== undefined ? Number(interp(n.attrs.step, scope, posOf(n, 'step'), false)) : 1;
        return rangeOf(Number(m[1]), Number(m[2]), Number.isFinite(step) ? step : 1, n);
      }
      if (NUM.test(s)) return rangeOf(1, Number(s), 1, n);
      return s.split(/\s+/).map(autoType);
    }
    return [v];
  }

  // ---------- 自定义类型 ----------
  function useDef(def, n, scope, out, depth) {
    if (depth > MAX_DEPTH) { overBudget(n, '自定义类型嵌套'); return; }
    if (Object.hasOwn(def.attrs, 'is')) {
      const attrs = {}, attrPos = {};
      for (const [k, v] of Object.entries(def.attrs)) {
        if (k === 'name' || k === 'is') continue;
        attrs[k] = v;
        attrPos[k] = def.attrPos[k];
      }
      Object.assign(attrs, n.attrs);
      Object.assign(attrPos, n.attrPos);
      expandElement({ tag: def.attrs.is, attrs, attrPos, children: n.children, line: n.line, col: n.col }, scope, out, depth + 1);
      return;
    }
    const local = new Scope(global);
    const params = Object.keys(def.attrs).filter((k) => k !== 'name');
    for (const p of params) local.declare(p, autoType(interp(def.attrs[p], global, posOf(def, p), true)));
    for (const [k, v] of Object.entries(n.attrs)) {
      if (!params.includes(k) && k !== 'id') {
        diag.warn('W_UNKNOWN_ATTR', `<${n.tag}> 不认识参数 "${k}"`, posOf(n, k), params.length ? `可用参数：${params.join(', ')}` : '该模板没有参数');
        continue;
      }
      local.declare(k, autoType(interp(v, scope, posOf(n, k), true)));
    }
    if (!local.has('id')) local.declare('id', '');
    expandChildren(def.children, local, out, depth + 1);
  }

  // ---------- 节点展开 ----------
  function expandElement(n, scope, out, depth) {
    const def = defs.get(n.tag);
    if (def) { useDef(def, n, scope, out, depth); return; }
    if (++budget.nodes > MAX_NODES) { overBudget(n, '节点数量'); return; }
    const node = { tag: n.tag, attrs: attrsOf(n, scope), attrPos: n.attrPos, children: [], line: n.line, col: n.col };
    // 相对定位 after/below：以锚点对象的位置为基准
    const anchor = node.attrs.after !== undefined ? node.attrs.after : node.attrs.below;
    if (anchor !== undefined) {
      const pos = placed.get(anchor);
      if (pos) {
        const gap = parseGap(node.attrs.gap ?? '1') ?? 1;
        node.attrs.at = node.attrs.after !== undefined
          ? `${fmt(pos[0] + gap)},${fmt(pos[1])}`
          : `${fmt(pos[0])},${fmt(pos[1] + gap)}`;
        node.attrPos.at = n.attrPos?.after || n.attrPos?.below || n;
      } else {
        diag.error('E_UNDEF_VAR', `after/below 的锚点 "${anchor}" 找不到（锚点要写在前面，且带 id）`, posOf(n, 'after') || posOf(n, 'below'));
      }
    }
    // 记录位置，供后续 after/below 引用
    if (node.attrs.id && node.attrs.at !== undefined) {
      const p = parsePos(node.attrs.at);
      if (p) placed.set(node.attrs.id, p);
    }
    out.push(node);
    const inner = n.tag === 'step' || n.tag === 'layer' ? new Scope(scope) : scope;
    expandChildren(n.children, inner, node.children, depth);
  }

  function expandChildren(children, scope, out, depth) {
    if (budget.over) return;
    let chain = null;
    for (const n of children) {
      if (budget.over) return;
      switch (n.tag) {
        case 'def':
        case 'anim':
        case 'theme':
          if (!n.hoisted) diag.error('E_DEF_PLACE', `<${n.tag}> 只能写在 <scene> 的最外层`, n);
          chain = null;
          break;
        case 'let':
          for (const [k, v] of Object.entries(n.attrs)) {
            if (!IDENT.test(k)) { diag.error('E_BAD_NAME', `变量名 "${k}" 不合法`, posOf(n, k)); continue; }
            scope.declare(k, autoType(interp(v, scope, posOf(n, k), true)));
          }
          chain = null;
          break;
        case 'set':
          for (const [k, v] of Object.entries(n.attrs)) {
            if (!scope.assign(k, autoType(interp(v, scope, posOf(n, k), true)))) {
              diag.error('E_UNDEF_VAR', `变量 "${k}" 还没有声明`, posOf(n, k), '先用 <let> 声明');
            }
          }
          chain = null;
          break;
        case 'for': {
          chain = null;
          const v = n.attrs.var, idx = n.attrs.index;
          if (!v || !IDENT.test(v)) { diag.error('E_MISSING_ATTR', '<for> 需要 var="变量名"', n); break; }
          if (idx !== undefined && !IDENT.test(idx)) { diag.error('E_BAD_NAME', `index 变量名 "${idx}" 不合法`, posOf(n, 'index')); break; }
          if (n.attrs.in === undefined) { diag.error('E_MISSING_ATTR', '<for> 需要 in="1..5"（或列表/数组）', n); break; }
          const items = rangeFromSource(n.attrs.in, n, scope) ?? toItems(interp(n.attrs.in, scope, posOf(n, 'in'), true), n, scope);
          if ((budget.loops += items.length) > MAX_LOOPS) { overBudget(n, '循环次数'); break; }
          items.forEach((item, k) => {
            const s = new Scope(scope);
            s.declare(v, item);
            if (idx) s.declare(idx, k);
            expandChildren(n.children, s, out, depth);
          });
          break;
        }
        case 'if': {
          const ok = evalTest(n, scope);
          chain = { done: ok };
          if (ok) expandChildren(n.children, new Scope(scope), out, depth);
          break;
        }
        case 'elseif':
          if (!chain) { diag.error('E_ELSE_ORPHAN', '<elseif> 必须紧跟在 <if> 或 <elseif> 之后', n); break; }
          if (!chain.done && evalTest(n, scope)) {
            chain.done = true;
            expandChildren(n.children, new Scope(scope), out, depth);
          }
          break;
        case 'else':
          if (!chain) { diag.error('E_ELSE_ORPHAN', '<else> 必须紧跟在 <if> 或 <elseif> 之后', n); break; }
          if (!chain.done) expandChildren(n.children, new Scope(scope), out, depth);
          chain = null;
          break;
        case 'row':
        case 'column': {
          chain = null;
          const atRaw = interp(n.attrs.at ?? '1,1', scope, posOf(n, 'at'), false);
          const at = parsePos(atRaw);
          if (!at) { diag.error('E_BAD_VALUE', `<${n.tag}> 的 at 需要格子坐标 "列,行"，实际是 "${atRaw}"`, posOf(n, 'at')); break; }
          const gapRaw = interp(n.attrs.gap ?? '1', scope, posOf(n, 'gap'), false);
          const gap = parseGap(gapRaw);
          if (gap === null) { diag.error('E_BAD_VALUE', `<${n.tag}> 的 gap 需要格子数（如 1.2 或 0.3c），实际是 "${gapRaw}"`, posOf(n, 'gap')); break; }
          // 等距分布：to + distribute（between/evenly/around）
          let distTo = null, distMode = null;
          if (n.attrs.distribute !== undefined) {
            distMode = n.attrs.distribute;
            if (!['between', 'evenly', 'around'].includes(distMode)) {
              diag.warn('W_BAD_VALUE', `distribute 只能是 between / evenly / around，实际是 "${distMode}"，已改用 evenly`, posOf(n, 'distribute'));
              distMode = 'evenly';
            }
            const toRaw = interp(n.attrs.to ?? atRaw, scope, posOf(n, 'to'), false);
            distTo = parsePos(toRaw);
            if (!distTo) { diag.error('E_BAD_VALUE', `<${n.tag}> 的 to 需要格子坐标，实际是 "${toRaw}"`, posOf(n, 'to')); distTo = null; }
          }
          // 收集子元素（递归展开，子元素里可用 for/def/表达式）
          const items = [];
          expandChildren(n.children, new Scope(scope), items, depth + 1);
          const count = items.length;
          // 流式注入 at：写 at 的子元素保留绝对位置，其余按槽位排布
          let k = 0;
          for (const item of items) {
            if (item.attrs.at === undefined) {
              let col, row;
              if (distMode && distTo) {
                const span = (n.tag === 'row' ? distTo[0] - at[0] : distTo[1] - at[1]);
                const step = distMode === 'between' ? (count > 1 ? span / (count - 1) : 0)
                  : distMode === 'around' ? span / count
                    : span / (count + 1);
                const off = distMode === 'between' ? k * step : distMode === 'around' ? (k + 0.5) * step : (k + 1) * step;
                col = at[0] + (n.tag === 'row' ? off : 0);
                row = at[1] + (n.tag === 'column' ? off : 0);
              } else {
                col = at[0] + (n.tag === 'row' ? k * gap : 0);
                row = at[1] + (n.tag === 'column' ? k * gap : 0);
              }
              item.attrs.at = `${fmt(col)},${fmt(row)}`;
              item.attrPos.at = posOf(n, 'at');
            }
            out.push(item);
            k++;
          }
          break;
        }
        default:
          chain = null;
          expandElement(n, scope, out, depth);
      }
    }
  }

  // ---------- 提升 def / anim ----------
  const keyTime = (raw) => {
    if (raw === undefined) return null;
    const m = /^\s*(\d+(?:\.\d+)?)\s*(%?)\s*$/.exec(raw);
    if (!m) return null;
    const v = m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    return v >= 0 && v <= 1 ? v : null;
  };
  const KEY_PROPS = { dx: 0, dy: 0, rot: 0, scale: 1, alpha: 1 };

  function registerAnim(n) {
    n.hoisted = true;
    const name = (n.attrs.name || '').trim();
    if (!name) { diag.error('E_MISSING_ATTR', '<anim> 需要 name="名字"', n); return; }
    if (anims.has(name)) { diag.error('E_DUP_ID', `关键帧动画 "${name}" 重复定义`, n); return; }
    const dur = n.attrs.dur === undefined ? 0.6 : Number(n.attrs.dur);
    if (!Number.isFinite(dur) || dur <= 0) { diag.error('E_BAD_VALUE', '<anim> 的 dur 需要正数', n.attrPos.dur || n); return; }
    const raw = [];
    for (const k of n.children) {
      if (k.tag !== 'k') { diag.error('E_ANIM', `<anim> 里只能写 <k at="…">，不能写 <${k.tag}>`, k); continue; }
      const t = keyTime(k.attrs.at);
      if (t === null) { diag.error('E_BAD_VALUE', '<k> 需要 at="0%~100%"', k.attrPos.at || k); continue; }
      const key = { t, ease: resolveEase(k.attrs.ease || 'soft') };
      if (!key.ease) { diag.warn('W_BAD_EASE', `未知缓动 "${k.attrs.ease}"`, k.attrPos.ease || k); key.ease = resolveEase('soft'); }
      for (const p of Object.keys(KEY_PROPS)) {
        if (k.attrs[p] === undefined) continue;
        const v = Number(k.attrs[p]);
        if (Number.isFinite(v)) key[p] = v;
        else diag.error('E_BAD_VALUE', `<k> 的 ${p} 需要数字`, k.attrPos[p] || k);
      }
      for (const a of Object.keys(k.attrs)) {
        if (a !== 'at' && a !== 'ease' && !(a in KEY_PROPS)) diag.warn('W_UNKNOWN_ATTR', `<k> 不认识属性 "${a}"`, k.attrPos[a] || k, '可用：at dx dy rot scale alpha ease');
      }
      raw.push(key);
    }
    raw.sort((a, b) => a.t - b.t);
    const rest = { ease: resolveEase('soft'), ...KEY_PROPS };
    const keys = [{ t: 0, ...rest }];
    for (const k of raw) {
      const prev = keys[keys.length - 1];
      const full = { t: k.t, ease: k.ease };
      for (const p of Object.keys(KEY_PROPS)) full[p] = k[p] ?? prev[p];
      if (k.t === 0) keys[0] = full; else keys.push(full);
    }
    if (keys[keys.length - 1].t < 1) keys.push({ t: 1, ...rest });
    else Object.assign(keys[keys.length - 1], { ...KEY_PROPS, t: 1 });
    anims.set(name, { name, dur, keys });
  }

  function registerDef(n) {
    n.hoisted = true;
    const name = (n.attrs.name || '').trim();
    if (!name) { diag.error('E_MISSING_ATTR', '<def> 需要 name="名字"', n); return; }
    if (RESERVED_TAGS.has(name)) { diag.error('E_BAD_ID', `"${name}" 是内置标签，不能作为自定义名字`, n.attrPos.name || n); return; }
    if (defs.has(name)) { diag.error('E_DUP_ID', `自定义类型 "${name}" 重复定义`, n); return; }
    if (n.attrs.is === undefined && n.children.length === 0) {
      diag.error('E_DEF', `<def name="${name}"> 需要 is="类型"（简写），或写子节点（模板）`, n);
      return;
    }
    defs.set(name, n);
  }

  for (const n of root.children) {
    if (n.tag === 'def') registerDef(n);
    else if (n.tag === 'anim') registerAnim(n);
    else if (n.tag === 'theme') {
      n.hoisted = true;
      for (const [k, v] of Object.entries(n.attrs)) {
        if (k === 'name') continue; // name 仅作文档标注，非语义色
        theme[k] = toStr(interp(v, global, posOf(n, k), false));
      }
    }
  }

  const out = { tag: 'scene', attrs: {}, attrPos: root.attrPos, children: [], line: root.line, col: root.col };
  for (const [k, v] of Object.entries(root.attrs)) out.attrs[k] = toStr(interp(v, global, posOf(root, k), false));
  expandChildren(root.children, global, out.children, 0);
  return { root: out, anims, defNames: [...defs.keys()], theme };
}
