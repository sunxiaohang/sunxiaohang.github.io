import { readFileSync, writeFileSync } from 'node:fs';

function patch(file, fn) {
  let t = readFileSync(file, 'utf8');
  const crlf = t.includes('\r\n');
  t = t.replace(/\r\n/g, '\n');
  const swap = (a, b) => { if (!t.includes(a)) throw new Error(`${file} 找不到：${a.slice(0, 50)}`); t = t.replace(a, b); };
  fn(swap);
  writeFileSync(file, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log('已更新', file);
}

// ---- entities.js：line / arrow 的端点可以写对象 id ----
patch('src/core/compile/entities.js', (swap) => {
  swap("import { Reader, checkAttrs, suggest } from '../lang/reader.js';", "import { Reader, checkAttrs, suggest, parsePos } from '../lang/reader.js';");
  swap("import { clamp } from '../util/ease.js';", "import { clamp } from '../util/ease.js';\nimport { linkEndpoints } from '../runtime/links.js';");
  swap(`    case 'line': case 'arrow': {
      const f = r.pos('from'), t = r.pos('to');
      if (!f || !t) {
        if (f === undefined || t === undefined) diag.error('E_MISSING_ATTR', \`<\${type}> 需要 from="列,行" 和 to="列,行"\`, node);
        return null;
      }
      warnOutside(ctx, f, r.at('from'));
      warnOutside(ctx, t, r.at('to'));
      [init.x1, init.y1] = cellToXY(scene, f);
      [init.x2, init.y2] = cellToXY(scene, t);
      init.stroke = r.color('stroke', scene.theme.text || col('#e8eaf6'));
      init.width = r.len('width', 4, { min: 0 });
      ent.dash = r.flag('dash');
      ent.head = r.len('head', Math.max(12, init.width * 3.2), { min: 1 });
      break;
    }`, `    case 'line': case 'arrow': {
      // 端点：对象 id（绑定连线，自动贴到对象边缘并随对象移动）或格子坐标
      const endOf = (name) => {
        if (!r.has(name)) return undefined;
        const raw = r.raw(name).trim();
        const target = scene.byId.get(raw);
        if (target && POSITIONAL.has(target.type)) return { ref: target.index, xy: [target.init.x, target.init.y] };
        const p = parsePos(raw);
        if (!p) {
          const hint = suggest(raw, [...scene.byId.keys()].filter((k) => POSITIONAL.has(scene.byId.get(k).type)));
          diag.error('E_BAD_VALUE', \`\${name} 需要格子坐标 "列,行"，或已定义的对象 id，实际是 "\${raw}"\`, r.at(name), hint ? \`是不是想写 "\${hint}"？（连线引用的对象要先于连线定义）\` : '连线引用的对象要先于连线定义');
          return null;
        }
        warnOutside(ctx, p, r.at(name));
        return { ref: -1, xy: cellToXY(scene, p) };
      };
      const f = endOf('from'), t = endOf('to');
      if (!f || !t) {
        if (f === undefined || t === undefined) diag.error('E_MISSING_ATTR', \`<\${type}> 需要 from 和 to（格子坐标 "列,行"，或对象 id）\`, node);
        return null;
      }
      if (f.ref >= 0 && f.ref === t.ref) { diag.error('E_BAD_VALUE', \`<\${type}> 的起点和终点是同一个对象 "\${raw0(r, 'from')}"\`, r.at('to')); return null; }
      init.stroke = r.color('stroke', scene.theme.text || col('#e8eaf6'));
      init.width = r.len('width', 4, { min: 0 });
      ent.dash = r.flag('dash');
      ent.head = r.len('head', Math.max(12, init.width * 3.2), { min: 1 });
      [init.x1, init.y1] = f.xy;
      [init.x2, init.y2] = t.xy;
      if (f.ref >= 0 || t.ref >= 0) {
        // 默认与目标留一点间距：箭头尖不贴死在边缘上
        const gap = r.len('gap', type === 'arrow' ? Math.max(3, U * 0.05) : 0, { min: 0 });
        const live = (s) => (s.ref >= 0 ? { e: scene.entities[s.ref], L: { ...scene.entities[s.ref].init, ox: 0, oy: 0, sx: 1, sy: 1 } } : s.xy);
        Object.assign(init, (({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 }))(linkEndpoints(live(f), live(t), gap)));
        ent.link = { from: { ref: f.ref }, to: { ref: t.ref }, gap };
      }
      break;
    }`);
  swap("  register(ctx, ent);\n  for (const gn of groups) scene.groups.get(gn).members.push(ent.index);", "  register(ctx, ent);\n  if (ent.link) scene.links.push({ ent: ent.index, ...ent.link });\n  for (const gn of groups) scene.groups.get(gn).members.push(ent.index);");
  swap("const rad = (d) => (d * Math.PI) / 180;", "const rad = (d) => (d * Math.PI) / 180;\nconst raw0 = (r, name) => r.raw(name).trim();");
});

// ---- links.js：固定端点取当前帧的值，所以仍可对自由端做动画 ----
patch('src/core/runtime/links.js', (swap) => {
  swap(`    const from = k.from.ref >= 0 ? { e: scene.entities[k.from.ref], L: ents[k.from.ref] } : k.from.xy;
    const to = k.to.ref >= 0 ? { e: scene.entities[k.to.ref], L: ents[k.to.ref] } : k.to.xy;`, `    const from = k.from.ref >= 0 ? { e: scene.entities[k.from.ref], L: ents[k.from.ref] } : [out.x1, out.y1];
    const to = k.to.ref >= 0 ? { e: scene.entities[k.to.ref], L: ents[k.to.ref] } : [out.x2, out.y2];`);
});

// ---- targets.js：步骤里改线条端点时，对象 id 给出明确提示 ----
patch('src/core/compile/targets.js', (swap) => {
  swap(`    if (!has(attr) || !SEGMENTED.has(ent.type)) continue;
    const p = r.pos(attr);`, `    if (!has(attr) || !SEGMENTED.has(ent.type)) continue;
    if (scene.byId.has(r.raw(attr).trim())) {
      diag.error('E_BAD_VALUE', \`步骤里不能把线条端点改成对象 id "\${r.raw(attr).trim()}"\`, r.at(attr), '对象 id 只能在创建连线时写；步骤里请写格子坐标，或新建一条连线');
      continue;
    }
    const p = r.pos(attr);`);
});

// ---- schema.js：文档 ----
patch('src/core/lang/schema.js', (swap) => {
  swap(`  from: B('线条起点 "列,行"'),
  to: B('线条终点 "列,行"'),`, `  from: B('线条起点：格子坐标 "列,行"，或对象 id（绑定连线：自动贴到对象边缘，对象移动时跟着走）'),
  to: B('线条终点：格子坐标 "列,行"，或对象 id。例：<arrow from="a" to="b"/>，a、b 要先于连线定义'),`);
  swap("  gap: B('气泡与目标的距离', '0.5c'),", "  gap: B('气泡与目标的距离；绑定连线时是连线端点与对象边缘的间距（箭头默认 0.05c）', '0.5c'),");
});
