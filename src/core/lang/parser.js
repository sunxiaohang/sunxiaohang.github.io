class ParseError extends Error {
  constructor(message, line, col) {
    super(message);
    this.line = line;
    this.col = col;
  }
}

const RE_NAME = /[\p{L}_][\p{L}\p{N}_:.-]*/uy;
const RE_CLOSE = /<\/([\p{L}_][\p{L}\p{N}_:.-]*)\s*>/uy;
const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };
const decode = (s) => s.replace(/&(lt|gt|amp|quot|apos);/g, (m) => ENTITIES[m]);

function sticky(re, src, at) {
  re.lastIndex = at;
  return re.exec(src);
}

/**
 * 轻量 XML 解析：每个节点和属性都带 line/col，用于精确报错。
 * 返回 { root, diagnostics }；语法错误时 root 为 null。
 */
export function parseXML(src) {
  const lineStarts = [0];
  for (let k = 0; k < src.length; k++) if (src[k] === '\n') lineStarts.push(k + 1);
  const pos = (index) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, col: index - lineStarts[lo] + 1 };
  };

  const diagnostics = [];
  const warn = (code, message, index) =>
    diagnostics.push({ severity: 'warning', code, message, ...pos(index) });

  let i = 0;
  const n = src.length;
  const fail = (message, at = i) => {
    const p = pos(at);
    throw new ParseError(message, p.line, p.col);
  };
  const skipWs = () => {
    while (i < n && /\s/.test(src[i])) i++;
  };

  const stack = [];
  let root = null;

  try {
    while (i < n) {
      const lt = src.indexOf('<', i);
      if (lt < 0) {
        if (src.slice(i).trim()) warn('W_TEXT', '节点之外的文本会被忽略', i);
        i = n;
        break;
      }
      if (lt > i && src.slice(i, lt).trim()) {
        // 收集节点内文本（<data> 的内联数据依赖它）；根节点之外的文本仍告警
        if (stack.length) stack[stack.length - 1].text = (stack[stack.length - 1].text ?? '') + decode(src.slice(i, lt));
        else warn('W_TEXT', '节点之外的文本会被忽略', i);
      }
      i = lt;

      if (src.startsWith('<!--', i)) {
        const e = src.indexOf('-->', i + 4);
        if (e < 0) fail('注释没有以 --> 结束');
        i = e + 3;
        continue;
      }
      if (src.startsWith('<?', i)) {
        const e = src.indexOf('?>', i + 2);
        if (e < 0) fail('声明没有以 ?> 结束');
        i = e + 2;
        continue;
      }
      if (src.startsWith('</', i)) {
        const m = sticky(RE_CLOSE, src, i);
        if (!m) fail('结束标签格式不正确，应为 </标签名>');
        const top = stack.pop();
        if (!top) fail(`多余的结束标签 </${m[1]}>`);
        if (top.tag !== m[1]) fail(`期望 </${top.tag}>（对应第 ${top.line} 行的 <${top.tag}>），实际是 </${m[1]}>`);
        top.end = pos(i);
        i += m[0].length;
        continue;
      }

      const tagAt = i;
      i++;
      const nameM = sticky(RE_NAME, src, i);
      if (!nameM) fail('标签名无效');
      const node = { tag: nameM[0], attrs: {}, attrPos: {}, children: [], ...pos(tagAt) };
      i += nameM[0].length;

      let selfClose = false;
      for (;;) {
        skipWs();
        if (i >= n) fail(`<${node.tag}> 没有闭合，缺少 > 或 />`, tagAt);
        if (src.startsWith('/>', i)) { selfClose = true; i += 2; break; }
        if (src[i] === '>') { i++; break; }
        const attrAt = i;
        const am = sticky(RE_NAME, src, i);
        if (!am) fail(`<${node.tag}> 中出现无法识别的字符 "${src[i]}"`);
        const name = am[0];
        i += name.length;
        skipWs();
        if (src[i] !== '=') {
          // 缺省属性（如 <a pulse/>、<grid labels/>）：等价于值为空串
          if (Object.hasOwn(node.attrs, name)) warn('W_DUP_ATTR', `属性 "${name}" 重复，后者生效`, attrAt);
          node.attrs[name] = '';
          node.attrPos[name] = pos(attrAt);
          continue;
        }
        i++;
        skipWs();
        const q = src[i];
        if (q !== '"' && q !== "'") fail(`属性 "${name}" 的值必须用引号包住`);
        const close = src.indexOf(q, i + 1);
        if (close < 0) fail(`属性 "${name}" 的字符串没有结束引号`, i);
        if (Object.hasOwn(node.attrs, name)) warn('W_DUP_ATTR', `属性 "${name}" 重复，后者生效`, attrAt);
        node.attrs[name] = decode(src.slice(i + 1, close));
        node.attrPos[name] = pos(attrAt);
        i = close + 1;
      }

      if (stack.length === 0) {
        if (root) fail('只能有一个根节点 <scene>', tagAt);
        root = node;
      } else {
        stack[stack.length - 1].children.push(node);
      }
      if (selfClose) node.end = pos(i);
      else stack.push(node);
    }

    if (stack.length) {
      const top = stack[stack.length - 1];
      fail(`<${top.tag}> 没有闭合`, lineStarts[top.line - 1] + top.col - 1);
    }
    if (!root) fail('没有找到根节点 <scene>', 0);
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    diagnostics.unshift({ severity: 'error', code: 'E_SYNTAX', message: e.message, line: e.line, col: e.col });
    return { root: null, diagnostics };
  }
  return { root, diagnostics };
}
