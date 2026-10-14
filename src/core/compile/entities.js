import { Reader, checkAttrs, suggest } from '../lang/reader.js';
import { RESERVED_TAGS } from '../lang/expand.js';
import {
  ENTITY_ATTRS, LAYER_ATTRS, GROUP_ATTRS, POSITIONAL, SEGMENTED, BOXED, TIMING, EFFECTS, SOUND_NAMES,
} from '../lang/schema.js';
import { clamp } from '../util/ease.js';
import { col, NONE, cellToXY, warnOutside, register } from './scene.js';

const NAME_RE = /^[\p{L}_][\p{L}\p{N}_.-]*$/u;
const PALETTE = ['#ff6b9d', '#4cc9f0', '#ffd166', '#9b8cff', '#06d6a0', '#ff9f68'].map(col);
const SIDES = ['top', 'bottom', 'left', 'right'];
const rad = (d) => (d * Math.PI) / 180;

function readPlace(r, ctx) {
  const p = r.pos('at');
  if (p) { warnOutside(ctx, p, r.at('at')); return cellToXY(ctx.scene, p); }
  const q = r.pair('px');
  if (q) return q;
  return [ctx.scene.width / 2, ctx.scene.height / 2];
}

/** 图层：控制绘制先后与整体透明度 */
export function createLayer(node, ctx) {
  const { scene, diag } = ctx;
  checkAttrs(node, LAYER_ATTRS, diag);
  const r = new Reader(node, diag, scene.unit, scene.theme);
  const name = (r.str('name', '') || r.str('id', '')).trim();
  if (!name) { diag.error('E_MISSING_ATTR', '<layer> 需要 name="图层名"', node); return null; }
  if (RESERVED_TAGS.has(name) || scene.byId.has(name) || scene.groups.has(name)) {
    diag.error('E_DUP_ID', `名字 "${name}" 已被占用`, node);
    return null;
  }
  const ent = {
    index: scene.entities.length, id: name, type: 'layer', line: node.line, col: node.col,
    layer: -1, groups: [], birth: 0, death: Infinity,
    init: { alpha: clamp(r.num('alpha', 1)), z: r.num('z', 0) },
  };
  register(ctx, ent);
  return ent;
}

/** 分组：只记录成员关系，步骤里写组名 = 对全部成员做同一个修改 */
export function createGroup(node, ctx, parentGroups) {
  const { scene, diag } = ctx;
  checkAttrs(node, GROUP_ATTRS, diag);
  const r = new Reader(node, diag, scene.unit, scene.theme);
  const name = r.str('name', '').trim();
  if (!name) { diag.error('E_MISSING_ATTR', '<group> 需要 name="组名"', node); return null; }
  if (RESERVED_TAGS.has(name) || scene.byId.has(name) || scene.groups.has(name)) {
    diag.error('E_DUP_ID', `名字 "${name}" 已被占用`, node);
    return null;
  }
  const g = { name, members: [], parents: parentGroups };
  scene.groups.set(name, g);
  return g;
}

export function createEntity(node, ctx, opts = {}) {
  const { scene, diag } = ctx;
  const type = node.tag, U = scene.unit;
  checkAttrs(node, [...ENTITY_ATTRS[type], ...TIMING, ...EFFECTS], diag);
  const r = new Reader(node, diag, U, scene.theme);

  let id = r.str('id', '').trim();
  if (id && RESERVED_TAGS.has(id)) { diag.error('E_BAD_ID', `id "${id}" 是内置标签名，请换一个`, r.at('id')); id = ''; }
  if (id && (scene.byId.has(id) || scene.groups.has(id))) {
    diag.error('E_DUP_ID', `对象 id "${id}" 已存在`, r.at('id'), `要修改已有对象，把 id 当标签写：<${id} …/>，或 <change id="${id}" …/>`);
    return null;
  }
  if (!id) { do { id = `${type}${++ctx.auto}`; } while (scene.byId.has(id)); }
  else if (!NAME_RE.test(id)) diag.warn('W_ID_NAME', `id "${id}" 含特殊字符，不能直接当标签写`, r.at('id'), '可改用 <change id="…">');

  let layer = -1;
  const lname = r.str('layer', opts.defaultLayer ?? '').trim();
  if (lname) {
    const L = scene.byId.get(lname);
    if (L && L.type === 'layer') layer = L.index;
    else {
      const layers = scene.entities.filter((e) => e.type === 'layer').map((e) => e.id);
      diag.error('E_UNKNOWN_LAYER', `找不到图层 "${lname}"`, r.at('layer'), layers.length ? `已有图层：${layers.join(', ')}` : '先在最外层用 <layer name="…"/> 声明');
    }
  }

  // 所在 <group> 嵌套链 + 显式 group 属性（写了就是声明：组不存在则自动创建），去重
  const groups = [...(opts.groups ?? [])];
  for (const gn of r.str('group', '').split(/\s+/).filter(Boolean)) {
    if (scene.byId.has(gn) && !scene.groups.has(gn)) {
      diag.error('E_DUP_ID', `分组名 "${gn}" 与已有对象 id 冲突`, r.at('group'), '换一个组名');
      continue;
    }
    if (!scene.groups.has(gn)) scene.groups.set(gn, { name: gn, members: [], parents: [] });
    if (!groups.includes(gn)) groups.push(gn);
  }

  const zero = {
    x: 0, y: 0, size: 0, w: 0, h: 0, rot: 0, fill: NONE, stroke: NONE, width: 0,
    color: [255, 255, 255, 1], draw: 1, x1: 0, y1: 0, x2: 0, y2: 0, text: '', label: '',
  };
  const init = { ...zero, alpha: clamp(r.num('alpha', 1)), z: r.num('z', 0) };
  const ent = {
    index: scene.entities.length, id, type, line: node.line, col: node.col,
    layer, groups, birth: opts.birth ?? 0, death: Infinity, radius: -1,
  };
  const defSize = Math.min(U * 0.8, 84);

  if (POSITIONAL.has(type)) {
    [init.x, init.y] = readPlace(r, ctx);
    init.rot = rad(r.num('rot', 0));
  }

  switch (type) {
    case 'circle': case 'ellipse': case 'rect': case 'triangle': case 'star':
      init.size = r.len('size', defSize, { min: 1 });
      init.w = BOXED.has(type) ? r.len('w', init.size, { min: 1 }) : init.size;
      init.h = BOXED.has(type) ? r.len('h', init.size, { min: 1 }) : init.size;
      init.fill = r.color('fill', PALETTE[ctx.colorIdx++ % PALETTE.length]);
      init.stroke = r.color('stroke', NONE);
      init.width = r.len('width', 3, { min: 0 });
      init.label = r.str('label', '');
      init.color = r.color('color', col('rgba(255,255,255,0.96)'));
      ent.flat = r.flag('flat');
      if (type === 'rect') ent.radius = r.len('radius', -1);
      if (type === 'star') ent.points = r.num('points', 5, { min: 3, max: 24 });
      break;
    case 'text':
      init.size = r.len('size', 36, { min: 1 });
      init.w = r.len('w', 0, { min: 0 });
      init.fill = r.color('fill', col('#ffffff'));
      init.stroke = r.color('stroke', NONE);
      init.width = r.len('width', 0, { min: 0 });
      init.text = r.str('text', '');
      break;
    case 'icon':
      init.size = r.len('size', 48, { min: 1 });
      init.w = 0;
      init.fill = r.color('fill', col('#ffffff'));
      init.stroke = r.color('stroke', NONE);
      init.width = r.len('width', 0, { min: 0 });
      init.text = r.str('text', '');
      break;
    case 'ring':
      init.size = r.len('size', Math.min(U, 96), { min: 1 });
      init.stroke = r.color('stroke', col('#ff5c7a'));
      init.width = r.len('width', 4, { min: 0 });
      break;
    case 'note': {
      init.size = r.len('size', 18, { min: 1 });
      init.fill = r.color('fill', col('#fff7d6'));
      init.color = r.color('color', col('#1b1d2e'));
      init.text = r.str('text', '');
      ent.side = r.str('side', 'top');
      if (!SIDES.includes(ent.side)) {
        diag.error('E_BAD_VALUE', `side 只能是 ${SIDES.join(' / ')}，实际是 "${ent.side}"`, r.at('side'));
        ent.side = 'top';
      }
      ent.gap = r.len('gap', U * 0.5, { min: 0 });
      break;
    }
    case 'line': case 'arrow': {
      const f = r.pos('from'), t = r.pos('to');
      if (!f || !t) {
        if (f === undefined || t === undefined) diag.error('E_MISSING_ATTR', `<${type}> 需要 from="列,行" 和 to="列,行"`, node);
        return null;
      }
      warnOutside(ctx, f, r.at('from'));
      warnOutside(ctx, t, r.at('to'));
      [init.x1, init.y1] = cellToXY(scene, f);
      [init.x2, init.y2] = cellToXY(scene, t);
      init.stroke = r.color('stroke', col('#e8eaf6'));
      init.width = r.len('width', 4, { min: 0 });
      ent.dash = r.flag('dash');
      ent.head = r.len('head', Math.max(12, init.width * 3.2), { min: 1 });
      break;
    }
    case 'grid': {
      ent.style = r.str('style', 'line');
      if (ent.style !== 'line' && ent.style !== 'cell') {
        diag.error('E_BAD_VALUE', `style 只能是 line 或 cell，实际是 "${ent.style}"`, r.at('style'));
        ent.style = 'line';
      }
      ent.dots = (r.posList('dots') || []).map((p) => cellToXY(scene, p));
      ent.labels = r.flag('labels');
      ent.radius = r.len('radius', U * 0.4, { min: 0 });
      init.fill = r.color('fill', NONE);
      init.stroke = r.color('stroke', col('rgba(255,255,255,0.28)'));
      init.color = r.color('color', col('rgba(255,255,255,0.55)'));
      init.width = r.len('width', 1.5, { min: 0 });
      break;
    }
  }
  ent.init = init;
  register(ctx, ent);
  for (const gn of groups) scene.groups.get(gn).members.push(ent.index);

  const sound = r.str('sound', '').trim();
  if (sound) {
    if (!SOUND_NAMES.includes(sound)) diag.warn('W_BAD_VALUE', `sound 只能是 ${SOUND_NAMES.join(' / ')}，实际是 "${sound}"`, r.at('sound'));
    else scene.sounds.push({ at: opts.birth ?? 0, name: sound });
  }
  return ent;
}

export { suggest };
