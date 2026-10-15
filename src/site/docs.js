import { schema } from '../core/index.js';
import { PALETTES } from '../core/palettes.js';
import { buildDocs } from '../editor/docs.js';
import { highlightLines } from '../editor/highlight.js';
import { compile, evaluate } from '../core/index.js';
import { draw } from '../render/canvas2d.js';
import { currentTheme } from './theme.js';
import { mountChrome } from './chrome.js';

mountChrome('docs');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const nav = $('siteNav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 4);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const code = (src) => highlightLines(src).map((h) => `<div class="ln">${h || ' '}</div>`).join('');
$('q1').innerHTML = code('<scene width="800" height="500" grid="6x4">\n  <circle id="a" at="1,2" size=".8c" fill="accent"/>\n</scene>');
$('q2').innerHTML = code('<step say="小球走到右边" dur="1">\n  <a at="6,2" ease="back" trail/>\n</step>');
$('q3').innerHTML = code('<scene width="800" height="500" grid="6x4" palette="champagne">');

$('palGrid').innerHTML = PALETTES.map((p) => {
  const t = p.tokens;
  return `<div class="pal-card">
    <div class="pal-top" style="background:${t.bg};color:${t.text}">
      <b>${esc(p.label)}</b>
      <div class="pal-dots">${p.series.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
    </div>
    <div class="pal-meta"><code>palette="${esc(p.name)}"</code><br>${esc(p.desc)}</div>
  </div>`;
}).join('');

// ---- 常用配方 ----
const RECIPES = [
  ['连线跟着对象走', 'from / to 直接写对象 id：箭头自动贴在边缘上，对象移动、放大时跟着走，不会断开。', '<rect id="a" at="2,2" w="1.4c" h="1c"/>\n<rect id="b" at="6,2" w="1.4c" h="1c"/>\n<arrow from="a" to="b"/>'],
  ['卡片里摆文字', '位置用 off（和 size 同样的 c 单位），不要给 at 加小数。上下留出相等的内边距。', '<rect id="c" at="3,2" w=".9c" h="1.15c"/>\n<text at="3,2" off="0,-.17c" size=".56c" text="日"/>\n<text at="3,2" off="0,.37c" size=".17c" text="rì"/>'],
  ['沿路径移动', '给出路径点，smooth 把折线变成圆滑曲线，trail 留下拖尾。', '<a path="1,4 3,2 6,2 8,4"\n   smooth trail ease="soft"/>'],
  ['用 for 批量生成', '循环变量 i 可以进表达式，一次生成一排对象。', '<for var="i" in="1..6">\n  <circle id="d{i}" at="{i},2"\n          size=".6c" fill="{pal(i - 1)}"/>\n</for>'],
  ['绕圈运动', '只写半径、圈数和时长，真正的圆轨道由引擎计算。', '<p orbit="1.5c" around="4,3" turns="2"\n   dur="4" ease="linear"/>'],
  ['强调：脉冲与跳动', 'pulse 放大再还原，jump 向上跳起再落回。', '<a pulse=".2"/>\n<b jump=".3c" ease="bounce"/>'],
  ['数据驱动', '内联 CSV 作为数据源，用 rows[i].列名 取值。', '<data name="rows">月份,销量\n1月,2\n2月,4</data>\n<for var="i" in="1..{rows.length}">\n  <rect at="{i},3" h="{rows[i-1].销量}c"/>\n</for>'],
  ['条件分支', 'if 必须配合容器形式的 else；test 写表达式。', '<if test="i % 2 == 0">\n  <circle at="{i},1"/>\n</if>\n<else>\n  <rect at="{i},1"/>\n</else>'],
  ['自定义组件', 'def 把一组图形打包成模板，之后像标签一样使用。', '<def name="卡牌" col="1" row="1">\n  <rect id="{id}_bg" at="{col},{row}"/>\n</def>\n<卡牌 id="k1" col="2" row="2"/>'],
  ['引入主题与组件库', 'import 引入别的文件里的主题或模板，一行换肤。', '<import src="themes/dark.xml"/>\n<import src="lib/cards.xml"/>'],
];
$('recipes').innerHTML = RECIPES.map(([title, desc, src]) => `<div class="qcard"><h3>${esc(title)}</h3><p>${esc(desc)}</p><pre>${code(src)}</pre></div>`).join('');

// ---- 缓动速查 ----
const EASES = [
  ['linear', '匀速，速度不变'], ['soft', '两头慢、中间快，柔和'], ['snap', '起步快、收尾慢，干脆'], ['in', '起步慢、越走越快'],
  ['back', '先后退蓄力，再冲过头回来'], ['spring', '终点附近来回弹，逐渐衰减'], ['bounce', '像球落地，一次比一次低'], ['elastic', '像橡皮筋，高频抖动'],
];
$('easeList').innerHTML = EASES.map(([n, d]) => `<div class="ease-item"><code>${n}</code><span>${esc(d)}</span></div>`).join('');

// ---- 常见问题 ----
const FAQ = [
  ['位置的单位是什么？', '格子。scene 上的 grid 把画布划成 N×M 格，at="3,2" 就是第 3 列第 2 行；尺寸可以写成 .6c，表示 0.6 个格子。'],
  ['同一个 step 里的内容是依次发生还是同时发生？', '同时发生。步与步之间依次执行；想在一步里错开，用 delay 或 stagger。'],
  ['怎么让一批对象依次出现？', '在 step 上写 stagger，再用 for 生成这批对象，引擎会按顺序错开它们的开始时间。'],
  ['脚本报错了怎么办？', '编辑器会在出错的行上标出红色波浪线，并给出“是不是想写……”的提示；也可以用命令行 node cli/check.js 检查一个脚本。'],
];
$('docFaq').innerHTML = FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
// ---- 字幕样式：每种一张实时预览 ----
const CAPS = [
  ['soft', '默认', '半透明胶囊，颜色取自配色，不抢画面'],
  ['plain', '无底描边', '只有文字和一圈同色描边，最接近影视字幕'],
  ['bar', '通栏底条', '贴着画面底边的整行，适合内容多的讲解'],
  ['minimal', '左对齐竖线', '一道主色细竖线加文字，像一段引文'],
  ['accent', '主色胶囊', '整颗胶囊用主色，需要强调时用'],
  ['classic', '深色胶囊', '旧版样式：深色底，对比最强'],
];
const capScene = (style) => `<scene width="440" height="275" grid="4x3" palette="${currentTheme() === 'dark' ? 'graphite' : 'porcelain'}" caption="${style}" caption-size="large" shadow="false" glow="false"><circle id="a" at="2,1.7" size="1.5c" fill="accent" flat=""/><rect id="b" at="3.2,1.7" w="1.2c" h="1.2c" radius="22" fill="c2" flat=""/><step say="只写目标，过程交给引擎"><a pulse=".1"/></step></scene>`;
function paintCaps() {
  document.querySelectorAll('.cap-card canvas').forEach((cv) => {
    const sc = compile(capScene(cv.dataset.style)).scene;
    if (!sc) return;
    const ctx = cv.getContext('2d');
    draw(ctx, sc, evaluate(sc, sc.steps[0].freeze), { pixelRatio: cv.width / sc.width });
  });
}
$('capGrid').innerHTML = CAPS.map(([id, name, desc]) => `<div class="cap-card"><canvas width="880" height="550" data-style="${id}"></canvas><div class="cap-meta"><b>${esc(name)}</b><code>caption="${id}"</code><p>${esc(desc)}</p></div></div>`).join('');
$('capSizes').innerHTML = [['small', '小'], ['medium', '中（默认）'], ['large', '大'], ['xlarge', '特大'], ['22', '像素值']]
  .map(([v, l]) => `<div class="ease-item"><code>${v}</code><span>caption-size · ${l}</span></div>`).join('');
paintCaps();
addEventListener('gm-theme', paintCaps);
$('refBody').innerHTML = buildDocs(schema());

// 目录：一级固定项 + 参考里的各个 h4
const refHeads = [...$('refBody').querySelectorAll('h4')];
refHeads.forEach((h, i) => { h.id = `ref-${i}`; });
$('toc').innerHTML = [
  '<span class="grp">开始</span>',
  '<a href="#sec-quick">快速开始</a>',
  '<a href="#sec-recipes">常用配方</a>',
  '<a href="#sec-palette">配色模板</a>',
  '<a href="#sec-caption">字幕样式</a>',
  '<a href="#sec-ease">缓动速查</a>',
  '<span class="grp">参考</span>',
  ...refHeads.map((h) => `<a href="#${h.id}">${esc(h.textContent)}</a>`),
  '<span class="grp">更多</span>',
  '<a href="#sec-faq">常见问题</a>',
].join('');

// 滚动高亮当前目录项
const links = [...$('toc').querySelectorAll('a')];
const targets = links.map((a) => document.getElementById(a.getAttribute('href').slice(1)));
const mark = () => {
  let cur = 0;
  const y = scrollY + 110;
  targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top + scrollY <= y) cur = i; });
  links.forEach((a, i) => a.classList.toggle('on', i === cur));
};
addEventListener('scroll', mark, { passive: true });
mark();
