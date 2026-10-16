import { parseXML } from '../lang/parser.js';
import { expand, RESERVED_TAGS } from '../lang/expand.js';
import { Diagnostics, suggest, Reader, checkAttrs, toNum } from '../lang/reader.js';
import { ENTITY_TYPES, SOLID } from '../lang/schema.js';
import { parseData } from '../lang/csv.js';
import { buildScene, MAX_SEGMENTS } from './scene.js';
import { createEntity, createLayer, createGroup } from './entities.js';
import { compileStep } from './steps.js';
import { detectConflicts } from './conflicts.js';

export { MAX_SEGMENTS };

const TOP_TAGS = [...ENTITY_TYPES, 'layer', 'group', 'step', 'audio'];

/**
 * <audio src="旁白.mp3" at="2" volume=".8" loop/>：外部音频（旁白 / BGM）。
 * 这是整套语言里唯一需要外部文件的能力。编译只记录播放线索；at 可写秒数，或 <step mark> 的标记名（延迟解析）。
 * src 的实际字节由 compileWithImports 预加载后挂到 node.audioData。
 */
function compileAudio(n, ctx) {
  const { scene, diag } = ctx;
  const r = new Reader(n, diag, scene.unit, scene.theme);
  checkAttrs(n, ['src', 'at', 'volume', 'loop', 'fadein', 'fadeout'], diag);
  const src = r.str('src', '').trim();
  if (!src) { diag.error('E_MISSING_ATTR', '<audio> 需要 src="音频文件"', n); return; }
  const cue = {
    src,
    atRaw: r.has('at') ? r.raw('at').trim() : '0',
    volume: r.num('volume', 1, { min: 0, max: 1 }),
    loop: r.flag('loop'),
    fadein: r.num('fadein', 0, { min: 0 }),
    fadeout: r.num('fadeout', 0, { min: 0 }),
    data: ctx.audioData?.[src] ?? null, // compileWithImports 预加载的 ArrayBuffer（没有则宿主自行按 src 加载）
    line: n.line, col: n.col,
  };
  scene.audios.push(cue);
}

/** 把 clip="id" 解析成裁剪容器的 index（容器须是实心图形）。全部对象建好后统一解析，前后引用都允许。 */
function resolveClips(scene, diag) {
  for (const e of scene.entities) {
    if (!e.clipRef) continue;
    const t = scene.byId.get(e.clipRef);
    if (!t) {
      const cands = scene.entities.filter((x) => SOLID.has(x.type)).map((x) => x.id);
      const s = suggest(e.clipRef, cands);
      diag.error('E_BAD_VALUE', `clip 找不到裁剪容器 "${e.clipRef}"`, { line: e.line, col: e.col }, s ? `是不是 "${s}"？` : '裁剪容器要写一个实心图形的 id');
    } else if (!SOLID.has(t.type)) {
      diag.error('E_BAD_VALUE', `clip 容器 "${e.clipRef}" 是 <${t.type}>，只能用实心图形（circle/rect/ellipse/triangle/star）`, { line: e.line, col: e.col });
    } else if (t.index === e.index) {
      diag.error('E_BAD_VALUE', '对象不能把自己当裁剪容器', { line: e.line, col: e.col });
    } else {
      e.clip = t.index;
    }
    delete e.clipRef;
  }
}

/** 把每个 <audio> 的 at 解析成秒：数字直接用；否则当作 <step mark> 的标记名查表 */
function resolveAudios(scene, diag) {
  for (const a of scene.audios) {
    const raw = a.atRaw;
    const secs = toNum(raw);
    if (secs !== null) a.at = Math.max(0, secs);
    else if (scene.marks.has(raw)) a.at = scene.marks.get(raw).t;
    else {
      const names = [...scene.marks.keys()];
      diag.error('E_BAD_VALUE', `<audio> 的 at="${raw}" 既不是秒数，也不是已定义的 mark`, { line: a.line, col: a.col },
        names.length ? `已有标记：${names.join(', ')}` : '用 <step mark="名字"> 定义标记，或直接写秒数');
      a.at = 0;
    }
    delete a.atRaw;
  }
  scene.audios.sort((x, y) => x.at - y.at);
}

/** 顶层节点：对象 / 图层 / 分组 / 步骤。layer、group 可以包着对象。 */
function compileTop(n, ctx, scope) {
  const { diag } = ctx;
  if (ENTITY_TYPES.includes(n.tag)) {
    createEntity(n, ctx, { birth: 0, defaultLayer: scope.layer, groups: scope.groups });
    return;
  }
  if (n.tag === 'layer') {
    if (scope.layer) { diag.error('E_NESTED_LAYER', '图层不能嵌套', n); return; }
    const L = createLayer(n, ctx);
    if (L) for (const ch of n.children) compileTop(ch, ctx, { ...scope, layer: L.id });
    return;
  }
  if (n.tag === 'group') {
    const g = createGroup(n, ctx, scope.groups);
    if (g) for (const ch of n.children) compileTop(ch, ctx, { ...scope, groups: [...scope.groups, g.name] });
    return;
  }
  if (n.tag === 'step') {
    if (scope.layer || scope.groups.length) {
      diag.error('E_STEP_PLACE', '<step> 不能写在 <layer> / <group> 里面', n);
      return;
    }
    compileStep(n, ctx);
    return;
  }
  if (n.tag === 'audio') {
    compileAudio(n, ctx);
    return;
  }
  if (n.tag === 'change' || n.tag === 'k') {
    diag.error('E_TAG_PLACE', `<${n.tag}> 放错了位置`, n, n.tag === 'change' ? '<change> 只能写在 <step> 里' : '<k> 只能写在 <anim> 里');
    return;
  }
  const s = suggest(n.tag, TOP_TAGS);
  diag.error('E_UNKNOWN_TAG', `未知标签 <${n.tag}>`, n, s ? `是不是想写 <${s}>？` : `可用：${TOP_TAGS.join(', ')}；自定义类型需先用 <def> 声明`);
}

/**
 * 编译脚本：返回 { ok, scene, diagnostics }。
 * 语法错误时 scene 为 null；其余错误只跳过出错的节点，scene 仍可预览。
 */
export function compile(src) {
  const diag = new Diagnostics();
  const { root, diagnostics } = parseXML(String(src ?? ''));
  for (const d of diagnostics) diag.add(d.severity, d.code, d.message, d, d.hint);
  if (!root) return { ok: false, scene: null, diagnostics: diag.list };
  return compileRoot(root, diag);
}

/** 从已解析的 AST 编译（resolveImports 合并 import 后走这里）；dataSources 为 <data src> 预加载结果，audioData 为 <audio src> 预加载的二进制表 */
export function compileRoot(root, diag, dataSources = {}, audioData = {}) {
  if (root.tag !== 'scene') {
    diag.error('E_ROOT', '根节点必须是 <scene>', root);
    return { ok: false, scene: null, diagnostics: diag.list };
  }

  // 内联 <data name="…">（无 src）：同步解析为全局变量
  const data = { ...dataSources };
  const children = [];
  for (const n of root.children) {
    if (n.tag !== 'data') { children.push(n); continue; }
    const name = (n.attrs.name || '').trim();
    if (!name) { diag.error('E_MISSING_ATTR', '<data> 需要 name="变量名"', n); continue; }
    if (RESERVED_TAGS.has(name)) { diag.error('E_BAD_ID', `数据名 "${name}" 是内置标签，请换一个`, n); continue; }
    const format = (n.attrs.format || 'csv').toLowerCase();
    if (n.attrs.src) { diag.error('E_DATA', `<data src="${n.attrs.src}"> 需要异步加载（用 compileWithImports）`, n); continue; }
    try { data[name] = parseData(n.text ?? '', format); }
    catch (e) { diag.error('E_DATA', `<data name="${name}"> 解析失败：${e?.message || e}`, n); }
  }
  root.children = children;

  const { root: ex, anims, defNames, theme } = expand(root, diag, data);
  const scene = buildScene(ex, diag, theme);
  scene.anims = anims;
  scene.defNames = defNames;

  const ctx = {
    scene, diag, segs: [], state: new Map(), auto: 0, colorIdx: 0, cursor: 0,
    curStep: -1, curGroups: [], tooMany: false, noopSilenced: false, batch: false,
    audioData,
    hooks: { createGroup },
  };
  for (const n of ex.children) compileTop(n, ctx, { layer: '', groups: [] });

  resolveClips(scene, diag);
  resolveAudios(scene, diag);

  const segs = ctx.segs.sort((a, b) => a.t0 - b.t0 || a.order - b.order);
  detectConflicts(segs, diag);
  scene.segments = segs;
  scene.sounds.sort((a, b) => a.at - b.at);
  // 一次性粒子（burst）要播完整条寿命；循环粒子不延长时长
  const emitterEnd = scene.entities
    .filter((e) => e.type === 'emitter' && e.emit && !e.emit.loop)
    .map((e) => e.birth + e.emit.life);
  scene.duration = Math.max(0.1, ctx.cursor, ...segs.map((s) => s.t0 + s.dur), ...emitterEnd);
  return { ok: !diag.list.some((d) => d.severity === 'error'), scene, diagnostics: diag.list };
}
