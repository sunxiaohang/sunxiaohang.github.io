import { evaluate } from '../core/runtime/evaluate.js';
import { setScenePalette, getScenePalette } from '../app/scene-src.js';

/**
 * 编辑器「上手教程」的内容与纯函数。
 * 这里不碰 DOM：内容、拼接脚本、检查做到哪一步，都可以直接在 Node 里测试。
 * 学到的每一步只写「变成什么样」，片段本身都能单独编译，学习过程中随时是能跑的。
 */

/** 一个场景最少要有的骨架 */
export const MINIMAL = `<scene width="800" height="480" grid="8x6" palette="porcelain">
</scene>
`;

const CLOSE_RE = /<\/scene\s*>\s*$/;

/** 把片段插到 </scene> 之前。没有 </scene> 时（脚本不完整）返回 null，由调用方提示 */
export function appendSnippet(src, snippet) {
  const text = String(src ?? '');
  if (!CLOSE_RE.test(text.trim())) return null;
  const body = snippet.trimEnd();
  return text.replace(CLOSE_RE, (m, offset) => {
    const head = text.slice(0, offset);
    return `${head.endsWith('\n') ? '' : '\n'}${body}\n${m}`;
  });
}

/** 从零开始：直接给一份最小骨架 */
export function replaceAll(src, snippet) {
  return `${snippet.trimEnd()}\n`;
}

/**
 * 应用一个教程步骤到当前脚本，返回新脚本；做不了时返回 null（界面据此提示）。
 *   replace：整段替换（从干净的场景开始）
 *   append ：把片段插到 </scene> 之前
 *   edit   ：不加代码，只改 <scene> 上的一个属性（step.edit = { palette: 'champagne' } 这样的形式，和工具栏下拉同源）
 */
export function applyStep(src, step) {
  if (step.mode === 'replace') return replaceAll(src, step.snippet);
  if (step.mode === 'edit') {
    if (step.edit?.palette === undefined) return null;
    return setScenePalette(src, step.edit.palette);
  }
  return appendSnippet(src, step.snippet);
}

/**
 * 检查用户做到哪一步了。
 * compiled 可以传编译结果（判断代码是否可用），scene 可以传编译出的场景（判断画面里有什么）。
 * 返回 { done, todo }：done 是已满足的条目，todo 是还差的（用于在教程里打勾并提示下一步）。
 */
export function checkStep(step, { src = '', scene = null, diagnostics = [] } = {}) {
  const rules = step?.check?.({ src, scene, diagnostics });
  if (!rules) return { done: [], todo: [], ok: true };
  const done = [], todo = [];
  for (const r of rules) (r.ok ? done : todo).push(r.label);
  return { done, todo, ok: todo.length === 0 };
}

/** 关卡：每关是一步步搭出来的小作品，最后能得到一个能播、能讲解的动画 */
export const LESSONS = [
  {
    id: 'hello',
    name: '第一段动画',
    goal: '让一个小球从左上走到右下，并且留一句字幕。',
    level: '入门',
    steps: [
      {
        title: '先搭一个空舞台',
        why: 'width / height 是画布尺寸，grid 把画布划成 8 列 6 行的格子，之后写坐标就按格子数来，不用算像素。',
        snippet: `<scene width="800" height="480" grid="8x6" palette="porcelain">
</scene>`,
        mode: 'replace',
        check: ({ src }) => [{ label: '写上 <scene> 根标签', ok: /<scene\b/.test(src) }],
      },
      {
        title: '放一个小球',
        why: 'id 是它的名字（后面要靠它找到它），at="2,2" 是第 2 列第 2 行，size=".9c" 是 0.9 个格子大。',
        snippet: `  <circle id="ball" at="2,2" size=".9c" fill="accent"/>`,
        mode: 'append',
        check: ({ scene }) => [{ label: '画面上出现了小球', ok: !!scene?.byId?.get('ball') }],
      },
      {
        title: '加一个步骤和一句字幕',
        why: 'step 是「一段情节」，say 是这句话的字幕。一个 step 里的动作同时发生，step 与 step 之间依次进行。',
        snippet: `  <step say="小球走到右下角" dur="1.2">
    <ball at="6,5" ease="soft"/>
  </step>`,
        mode: 'append',
        check: ({ scene }) => [{ label: '有一个带字幕的步骤', ok: !!scene?.steps?.some((s) => s.say) }],
      },
      {
        title: '让它自己溜达一圈',
        why: '给 path 一串坐标点，引擎会自动补间；smooth 把折线变成圆滑曲线，trail 留下走过的痕迹。',
        snippet: `  <step say="换个走法：沿着曲线溜达一圈" dur="1.8">
    <ball path="2,5 4,1 6,4 7,2" smooth trail ease="soft"/>
  </step>`,
        mode: 'append',
        check: ({ src, scene }) => [
          { label: '写了一条 path 路径', ok: /\bpath\s*=\s*"[^"]+"/.test(src) },
          { label: '路径能正常编译', ok: !!scene },
        ],
      },
    ],
  },
  {
    id: 'loop',
    name: '用循环摆一排',
    goal: '一次写 8 根柱子，让它们依次长出来。',
    level: '入门',
    steps: [
      {
        title: '从空场景开始',
        why: '这次我们把画面擦干净重来一遍，看看循环能省多少事。',
        snippet: `<scene width="800" height="480" grid="8x6" palette="porcelain">
</scene>`,
        mode: 'replace',
        check: ({ scene }) => [{ label: '场景里还没有对象', ok: !!scene && scene.entities.filter((e) => e.type !== 'layer').length === 0 }],
      },
      {
        title: '一个 for 生成 8 根柱子',
        why: '循环变量 i 从 1 数到 8，可以进表达式。at="{i},4" 里的 {i} 会被替换成当前值——所以 8 根柱子只用写一次。',
        snippet: `  <for var="i" in="1..8">
    <rect id="bar{i}" at="{i},4" w=".5c" h=".3c" radius="8" fill="{pal(i - 1)}"/>
  </for>`,
        mode: 'append',
        check: ({ scene }) => [{ label: '生成了 8 根柱子', ok: scene?.entities?.filter((e) => /^bar\d+$/.test(e.id)).length === 8 }],
      },
      {
        title: '换个公式，换一种排列',
        why: '同一个循环，只改目标位置和高度：柱子变成一排高低起伏的山丘。',
        snippet: `  <step say="只改一个公式，整排重新排布" dur="1.4" stagger=".06">
    <for var="i" in="1..8">
      <change id="bar{i}" h="{1.2 + 1.6 * (1 + sin(i * 0.9))}c" ease="soft"/>
    </for>
  </step>`,
        mode: 'append',
        check: ({ scene }) => [{
          label: '柱子的高度各不一样',
          // 高度是这一步动画做出来的，所以要看到这一帧，不能只看初始值
          ok: (() => {
            const bars = scene?.entities?.filter((e) => /^bar\d+$/.test(e.id)) || [];
            if (bars.length !== 8 || !scene.steps.length) return false;
            const f = evaluate(scene, scene.steps[0].freeze);
            return new Set(bars.map((e) => Math.round(f.entities[e.index].h))).size >= 4;
          })(),
        }],
      },
      {
        title: '让它依次点亮',
        why: 'step 上的 stagger 让这一批动作错开时间开始，就有了「一个一个来」的节奏。',
        snippet: `  <step say="依次点亮，像在数数" dur=".6" stagger=".08">
    <for var="i" in="1..8">
      <change id="bar{i}" fill="warn" pulse=".25"/>
    </for>
  </step>`,
        mode: 'append',
        check: ({ src, scene }) => [
          { label: '用上了 stagger 错开节奏', ok: /\bstagger\s*=/.test(src) },
          { label: '依次点亮的步骤已经生效', ok: (scene?.steps?.length || 0) >= 2 && (scene.steps.at(-1).say || '').includes('点亮') },
        ],
      },
    ],
  },
  {
    id: 'captions',
    name: '做成一段讲解',
    goal: '用步骤、字幕和音效，把动画变成能讲给人听的教程。',
    level: '进阶',
    steps: [
      {
        title: '起一个干净的场景',
        why: '讲解型动画的重点是「每一步都说得清」，画面反而要安静。',
        snippet: `<scene width="800" height="480" grid="8x6" palette="porcelain" caption="soft">
</scene>`,
        mode: 'replace',
        check: ({ src, scene }) => [
          { label: '场景上写了 caption 字幕样式', ok: /<scene\b[^>]*\bcaption\s*=/.test(src) },
          { label: '是一个干净的空场景', ok: !!scene && scene.entities.filter((e) => e.type !== 'layer' && !e.internal).length === 0 },
        ],
      },
      {
        title: '给每一步配一句话',
        why: 'say 写在这一步「做完之后」，所以字幕可以说结论；play() 时就自然对上了。',
        snippet: `  <circle id="dot" at="2,3" size=".9c" fill="accent"/>
  <step say="第一步：先说明现在看到的是什么" dur=".8">
    <dot pulse=".2"/>
  </step>
  <step say="第二步：走过去，字幕跟着换" dur="1.2">
    <dot at="6,3" trail ease="soft"/>
  </step>
  <step say="第三步：到达，画上句号" dur=".8">
    <dot fill="good" pulse=".3"/>
  </step>`,
        mode: 'append',
        check: ({ scene }) => [{ label: '三步都写上了字幕', ok: (scene?.steps?.length || 0) >= 3 && scene.steps.every((s) => s.say) }],
      },
      {
        title: '加一点声音',
        why: 'sound 写在 step 上，这一步开始时就响一次；音色全是代码合成的，不需要素材文件。',
        snippet: `  <step say="最后来一下提示音" dur=".8" sound="ding">
    <dot pulse=".4"/>
  </step>`,
        mode: 'append',
        check: ({ scene }) => [{ label: '有一步带上了音效', ok: (scene?.sounds?.length || 0) > 0 }],
      },
      {
        title: '换一套配色',
        why: '场景标签上的 palette 一行就能换肤：底色、默认图形色、文字色、字幕颜色全部跟着换。点「帮我改」会把它换成「香槟」，你也可以自己改成别的名字。',
        // edit：不是追加代码，而是改 <scene> 上的 palette，效果等同工具栏的「配色」下拉
        snippet: '<scene … palette="champagne">',
        mode: 'edit',
        edit: { palette: 'champagne' },
        check: ({ src }) => [{ label: 'palette 已经换成了别的配色', ok: !!getScenePalette(src) && getScenePalette(src) !== 'porcelain' }],
      },
    ],
  },
];

export const findLesson = (id) => LESSONS.find((l) => l.id === id) || LESSONS[0];
