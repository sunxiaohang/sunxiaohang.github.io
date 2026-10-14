import { parseXML } from '../lang/parser.js';
import { expand } from '../lang/expand.js';
import { Diagnostics, suggest } from '../lang/reader.js';
import { ENTITY_TYPES } from '../lang/schema.js';
import { buildScene, MAX_SEGMENTS } from './scene.js';
import { createEntity, createLayer, createGroup } from './entities.js';
import { compileStep } from './steps.js';
import { detectConflicts } from './conflicts.js';

export { MAX_SEGMENTS };

const TOP_TAGS = [...ENTITY_TYPES, 'layer', 'group', 'step'];

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
  if (root.tag !== 'scene') {
    diag.error('E_ROOT', '根节点必须是 <scene>', root);
    return { ok: false, scene: null, diagnostics: diag.list };
  }

  const { root: ex, anims, defNames } = expand(root, diag);
  const scene = buildScene(ex, diag);
  scene.anims = anims;
  scene.defNames = defNames;

  const ctx = {
    scene, diag, segs: [], state: new Map(), auto: 0, colorIdx: 0, cursor: 0,
    curStep: -1, curGroups: [], tooMany: false, noopSilenced: false, batch: false,
    hooks: { createGroup },
  };
  for (const n of ex.children) compileTop(n, ctx, { layer: '', groups: [] });

  const segs = ctx.segs.sort((a, b) => a.t0 - b.t0 || a.order - b.order);
  detectConflicts(segs, diag);
  scene.segments = segs;
  scene.sounds.sort((a, b) => a.at - b.at);
  scene.duration = Math.max(0.1, ctx.cursor, ...segs.map((s) => s.t0 + s.dur));
  return { ok: !diag.list.some((d) => d.severity === 'error'), scene, diagnostics: diag.list };
}
