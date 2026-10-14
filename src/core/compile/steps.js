import { Reader, checkAttrs, suggest } from '../lang/reader.js';
import { ENTITY_TYPES, STEP_ATTRS, modAttrs } from '../lang/schema.js';
import { EPS } from './scene.js';
import { createEntity } from './entities.js';
import { compileIntro, compileEffects, compileTarget } from './targets.js';

/** 在步骤里新建对象：登场动画 + 登场时附带的效果 */
function createInStep(node, ctx, base) {
  const r0 = new Reader(node, ctx.diag, ctx.scene.unit);
  const start = base + r0.num('delay', 0, { min: 0 });
  const ent = createEntity(node, ctx, { birth: start, groups: ctx.curGroups });
  if (!ent) return base;
  const r = new Reader(node, ctx.diag, ctx.scene.unit);
  const st = ctx.state.get(ent.id);
  const introEnd = compileIntro(ent, node, r, start, ctx);
  return Math.max(introEnd, compileEffects(ctx, node, r, ent, st, introEnd));
}

/** <change id="a b c*"> 与组名展开：返回去重后的目标对象列表 */
function resolveTargets(spec, node, ctx) {
  const { scene, diag } = ctx;
  const out = [];
  for (const tok of spec.trim().split(/\s+/).filter(Boolean)) {
    if (tok.endsWith('*')) {
      const prefix = tok.slice(0, -1);
      const hit = scene.entities.filter((e) => e.type !== 'layer' && !e.internal && e.id.startsWith(prefix));
      if (!hit.length) diag.warn('W_NO_MATCH', `通配 "${tok}" 没有匹配到任何对象`, node);
      out.push(...hit);
    } else if (scene.groups.has(tok)) {
      out.push(...scene.groups.get(tok).members.map((i) => scene.entities[i]));
    } else if (scene.byId.has(tok)) {
      out.push(scene.byId.get(tok));
    } else {
      const pool = [...scene.byId.keys(), ...scene.groups.keys()];
      const s = suggest(tok, pool);
      diag.error('E_UNKNOWN_TARGET', `找不到对象或分组 "${tok}"`, node,
        s ? `是不是想写 "${s}"？` : `已有：${pool.slice(0, 12).join(', ') || '（无）'}`);
    }
  }
  return [...new Set(out)];
}

/** 对一批对象应用同一个节点的修改；节点级的校验与"空修改"提示只做一次 */
function modifyAll(node, targets, ctx, dur, nextBase, viaChange, batch) {
  if (!targets.length) return null;
  // 校验按"能改的属性并集"做，避免对象类型不同导致误报
  const union = new Set(['id']);
  for (const e of targets) for (const a of modAttrs(e.type)) union.add(a);
  checkAttrs(node, [...union], ctx.diag);

  let end = null;
  // 批量（组名 / 通配 / 多 id）：已退场的成员静默跳过；"空修改"提示只报一次
  ctx.batch = batch;
  ctx.noopSilenced = false;
  targets.forEach((e, i) => {
    ctx.noopSilenced = i > 0;
    const t = compileTarget(node, e, ctx, dur, nextBase(), viaChange);
    end = end === null ? t : Math.max(end, t);
  });
  ctx.noopSilenced = false;
  ctx.batch = false;
  return end;
}

export function compileStep(node, ctx) {
  const { scene, diag } = ctx;
  checkAttrs(node, Object.keys(STEP_ATTRS), diag);
  const r = new Reader(node, diag, scene.unit);
  const index = scene.steps.length;
  ctx.curStep = index;
  const t0 = ctx.cursor;
  const dur = r.num('dur', 0.7, { min: 0 });
  const stagger = r.num('stagger', 0, { min: 0 });
  const say = r.str('say', '');
  // 显式 hold 优先；否则取"全局停顿下限"与"读完字幕所需时间"的较大者
  const readTime = scene.read > 0 ? [...say.replace(/\\n|\|/g, '')].length / scene.read : 0;
  const hold = r.has('hold') ? r.num('hold', scene.hold, { min: 0.05 }) : Math.max(scene.hold, readTime);
  let end = t0, k = 0;
  const nextBase = () => t0 + k++ * stagger;

  for (const ch of node.children) {
    if (ENTITY_TYPES.includes(ch.tag)) {
      end = Math.max(end, createInStep(ch, ctx, nextBase()));
    } else if (ch.tag === 'group') {
      // 步骤内的 <group>：新建一批对象并归为一组
      const { createGroup } = ctx.hooks;
      const g = createGroup(ch, ctx, ctx.curGroups);
      if (!g) continue;
      const saved = ctx.curGroups;
      ctx.curGroups = [...saved, g.name];
      for (const sub of ch.children) {
        if (ENTITY_TYPES.includes(sub.tag)) end = Math.max(end, createInStep(sub, ctx, nextBase()));
        else diag.error('E_GROUP_CHILD', `<group> 里只能写对象，不能写 <${sub.tag}>`, sub);
      }
      ctx.curGroups = saved;
    } else if (ch.tag === 'change') {
      const rr = new Reader(ch, diag, scene.unit);
      const spec = rr.str('id', '');
      if (!spec.trim()) { diag.error('E_MISSING_ATTR', '<change> 需要 id="对象名"（可写多个、组名或 c* 通配）', ch); continue; }
      const targets = resolveTargets(spec, ch, ctx);
      const batch = targets.length > 1 || /[*\s]/.test(spec.trim()) || scene.groups.has(spec.trim());
      const e = modifyAll(ch, targets, ctx, dur, nextBase, true, batch);
      if (e !== null) end = Math.max(end, e);
    } else if (scene.byId.has(ch.tag) || scene.groups.has(ch.tag)) {
      const targets = resolveTargets(ch.tag, ch, ctx);
      const e = modifyAll(ch, targets, ctx, dur, nextBase, false, scene.groups.has(ch.tag));
      if (e !== null) end = Math.max(end, e);
    } else {
      const pool = [...scene.byId.keys(), ...scene.groups.keys(), ...ENTITY_TYPES, 'change'];
      const s = suggest(ch.tag, pool);
      diag.error('E_UNKNOWN_TAG', `<${ch.tag}> 既不是对象 id / 组名，也不是内置类型`, ch,
        s ? `是不是想写 <${s}>？` : '新对象写类型名（circle、rect…）或自定义 def；修改已有对象写它的 id');
    }
  }

  if (end <= t0 + EPS) end = t0 + 0.3;
  const t2 = end + hold;
  scene.steps.push({
    index, t0, t1: end, t2, say,
    freeze: Math.max(t0, Math.min(t2 - 1e-4, Math.max(end, t0 + 0.3))),
    line: node.line, col: node.col,
  });
  ctx.cursor = t2;
  ctx.curStep = -1;
}
