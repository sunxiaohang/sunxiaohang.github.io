import { parseXML } from './lang/parser.js';
import { Diagnostics } from './lang/reader.js';
import { parseData } from './lang/csv.js';
import { compileRoot } from './compile/index.js';

/**
 * 解析 <import src="…" as="…"/> 依赖图：把外部库文件里的 <def>/<anim>/<theme>
 * 注入主场景（带命名空间时给 def/anim 名字加 "as." 前缀），再交给 compileRoot。
 */
async function hoistImports(root, loader, diag, stack) {
  const children = [];
  for (const node of root.children) {
    if (node.tag !== 'import') { children.push(node); continue; }
    const src = (node.attrs.src || '').trim();
    if (!src) { diag.error('E_MISSING_ATTR', '<import> 需要 src="文件路径"', node); continue; }
    if (stack.has(src)) { diag.error('E_IMPORT_LOOP', `import 循环依赖："${src}"`, node); continue; }

    let text;
    try {
      text = await loader(src);
    } catch (e) {
      diag.error('E_IMPORT', `无法加载 "${src}"：${e?.message || e}`, node);
      continue;
    }

    const { root: depRoot, diagnostics } = parseXML(String(text));
    for (const d of diagnostics) diag.add(d.severity, d.code, `${src}: ${d.message}`, d, d.hint);
    if (!depRoot) continue;

    // 递归展开依赖内部的 import
    await hoistImports(depRoot, loader, diag, new Set(stack).add(src));

    const ns = (node.attrs.as || '').trim();
    for (const dep of depRoot.children) {
      if (dep.tag !== 'def' && dep.tag !== 'anim' && dep.tag !== 'theme') continue;
      const copy = { ...dep, attrs: { ...dep.attrs } };
      if (ns && copy.attrs.name) copy.attrs.name = `${ns}.${copy.attrs.name}`;
      children.push(copy);
    }
  }
  root.children = children;
}

/**
 * 编译脚本（支持 <import>）：loader(path) => Promise<string> 负责按 import 的 src 加载文件。
 * 返回结构与 compile() 一致：{ ok, scene, diagnostics }。
 */
export async function compileWithImports(src, loader) {
  const diag = new Diagnostics();
  const { root, diagnostics } = parseXML(String(src ?? ''));
  for (const d of diagnostics) diag.add(d.severity, d.code, d.message, d, d.hint);
  if (!root) return { ok: false, scene: null, diagnostics: diag.list };
  await hoistImports(root, loader, diag, new Set());

  // 预加载 <data src>（外部数据文件）；内联 <data> 由 compileRoot 同步处理
  const dataSources = {};
  const children = [];
  for (const n of root.children) {
    if (n.tag === 'data' && n.attrs.src) {
      const name = (n.attrs.name || '').trim();
      const format = (n.attrs.format || 'csv').toLowerCase();
      try {
        const text = await loader(n.attrs.src);
        if (name) dataSources[name] = parseData(text, format);
      } catch (e) {
        diag.error('E_DATA', `无法加载数据 "${n.attrs.src}"：${e?.message || e}`, n);
      }
    } else children.push(n);
  }
  root.children = children;

  // 预加载 <audio src>：loader 若能返回二进制（ArrayBuffer）就按 src 存一张表，供导出混音直接解码；
  // 失败不阻断编译——宿主（浏览器播放）仍可按 src 自行加载。用表传入，避免 expand 克隆节点时丢失数据。
  const audioData = {};
  for (const n of root.children) {
    if (n.tag !== 'audio' || !n.attrs.src) continue;
    try {
      const d = await loader(n.attrs.src, { binary: true });
      if (d) audioData[n.attrs.src] = d;
    } catch { /* 加载失败：保留 src，交给宿主 */ }
  }

  return compileRoot(root, diag, dataSources, audioData);
}
