import { ENTITY_TYPES } from '../core/lang/schema.js';
// 注：editor/ 下的模块只依赖 core 的语法定义，不依赖渲染、播放器或导出

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls, s) => `<span class="${cls}">${esc(s)}</span>`;

const STRUCT = new Set(['scene', 'step', 'layer']);
const PROG = new Set(['let', 'set', 'for', 'if', 'elseif', 'else', 'def', 'anim', 'k']);
const TYPES = new Set(ENTITY_TYPES);

const NAME = '[\\p{L}_][\\p{L}\\p{N}_:.-]*';
const OPEN = new RegExp(`^<\\/?(${NAME})`, 'u');
const ATTR_VAL = new RegExp(`^(${NAME})(\\s*=\\s*)("[^"]*"?|'[^']*'?)`, 'u');
const BARE = new RegExp(`^${NAME}`, 'u');

/** known = { ids:Set, defs:Set }，用于把用户自己的 id / 自定义类型标成不同颜色 */
export function highlightLines(src, known = { ids: new Set(), defs: new Set() }) {
  let inComment = false, inTag = false;
  const tagClass = (name) =>
    STRUCT.has(name) ? 'tk-g'
      : PROG.has(name) ? 'tk-k'
        : TYPES.has(name) ? 'tk-o'
          : name === 'change' ? 'tk-m'
            : known.defs.has(name) ? 'tk-d'
              : known.ids.has(name) ? 'tk-i'
                : 'tk-a';

  return src.split('\n').map((line) => {
    let html = '', plain = '', i = 0;
    const flush = () => { if (plain) { html += esc(plain); plain = ''; } };
    while (i < line.length) {
      if (inComment) {
        const e = line.indexOf('-->', i);
        flush();
        if (e < 0) { html += span('tk-c', line.slice(i)); i = line.length; }
        else { html += span('tk-c', line.slice(i, e + 3)); i = e + 3; inComment = false; }
        continue;
      }
      const rest = line.slice(i);
      if (!inTag) {
        if (rest.startsWith('<!--')) { flush(); inComment = true; html += span('tk-c', '<!--'); i += 4; continue; }
        const m = OPEN.exec(rest);
        if (m) {
          flush();
          html += span('tk-p', rest.startsWith('</') ? '</' : '<') + span(tagClass(m[1]), m[1]);
          i += m[0].length;
          inTag = true;
          continue;
        }
        plain += line[i++];
        continue;
      }
      if (rest.startsWith('/>')) { flush(); html += span('tk-p', '/>'); i += 2; inTag = false; continue; }
      if (rest[0] === '>') { flush(); html += span('tk-p', '>'); i++; inTag = false; continue; }
      let m = ATTR_VAL.exec(rest);
      if (m) {
        flush();
        html += span('tk-a', m[1]) + span('tk-p', m[2]) + span('tk-s', m[3]);
        i += m[0].length;
        continue;
      }
      m = BARE.exec(rest);
      if (m) { flush(); html += span('tk-a', m[0]); i += m[0].length; continue; }
      plain += line[i++];
    }
    flush();
    return html;
  });
}
