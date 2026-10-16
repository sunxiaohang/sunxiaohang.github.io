import { schema } from '../core/index.js';
import { PALETTES } from '../core/palettes.js';
import { buildDocs } from '../editor/docs.js';
import { highlightLines } from '../editor/highlight.js';
import { compile, evaluate } from '../core/index.js';
import { draw } from '../render/canvas2d.js';
import { currentTheme } from './theme.js';
import { drawGlyph } from '../render/glyphs.js';
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
  ['镜头推拉与跟随', 'camera 缩放平移整个画面，字幕和背景不动。follow 跟住一个对象。一个场景只用一台。', '<camera/>\n<step>\n  <camera zoom="2" at="3,3"/>\n</step>\n<step>\n  <camera zoom="1" follow="车"/>\n</step>'],
  ['数字滚动', 'count 把数字从当前值补间到目标；fmt 用 # 代表数值（整数自动加千分位），#.0 控制小数。', '<text id="n" at="3,2"\n      count="0" fmt="¥#"/>\n<step dur="1.5">\n  <n count="128460"/>\n</step>'],
  ['打字机 / 逐字显现', 'in="type" 让文字逐字打出；也可以直接补间 reveal（0~1）做更精细的控制。', '<step>\n  <text at="3,2" text="逐字显现的标题"\n        in="type" dur="1"/>\n</step>'],
  ['渐变填充', '写了 fill2 就从 fill 渐变到 fill2；gradient="radial" 从中心发散，"linear 45" 指定角度。', '<rect at="3,2" w="2c" h="1.2c"\n      fill="accent" fill2="accent2"\n      gradient="linear 135"/>'],
  ['模糊与混合', 'blur 做景深 / 聚焦（可在步骤里从模糊补到清晰）；blend="screen" 让光斑叠加变亮。', '<circle at="3,3" size="3c" fill="accent"\n        blur="30" blend="screen"/>\n<step dur="1"><a blur="0"/></step>'],
  ['裁剪到容器内', 'clip 写一个实心图形的 id，对象只在它内部可见——做卡片内滚动、进度条、窗口。', '<rect id="窗" at="3,2" w="3c" h="1.4c"/>\n<text clip="窗" at="3,2"\n      text="超出窗口的部分会被裁掉"/>'],
  ['粒子礼花 / 飘雪', '一个 <emitter> 生成整组粒子：burst 爆开、fountain 喷泉、rise 上升、fall 下落、snow 飘雪。不用手写几十个 circle。', '<emitter at="4,3" mode="burst"\n  count="80" speed="3c" life="1.6"\n  gravity="2.2" fill="accent" fill2="accent2"\n  blend="screen"/>'],
  ['沿路径朝向', '移动时加 heading，车头 / 箭头随路径（含 orbit 圆周）切线转向。heading 是图形默认朝向的角度。', '<icon id="车" name="car" at="1,1"/>\n<step>\n  <车 path="1,1 5,1 5,4" heading="0"/>\n</step>'],
  ['快放 / 慢放某一步', '给 <step> 加 speed：2 是一倍速、0.5 是慢动作。只改这一步，后面自动顺延；停顿不受影响。', '<step dur="1" speed="2">…</step>\n<step dur="1" speed="0.5">慢动作回放</step>'],
  ['旁白 / 背景音乐', '<audio> 引入外部音频；at 写秒数或 <step mark> 的标记名。这是唯一需要外部文件的能力。', '<audio src="bgm.mp3" volume=".5" loop/>\n<audio src="叮.mp3" at="高潮"/>\n<step mark="高潮">…</step>'],
];
$('recipes').innerHTML = RECIPES.map(([title, desc, src]) => `<div class="qcard"><h3>${esc(title)}</h3><p>${esc(desc)}</p><pre>${code(src)}</pre></div>`).join('');

// ---- 地图 ----
const MAP_RECIPES = [
  ['一张全国地图', '<map> 默认画整个中国：省界、外轮廓、南海诸岛小图。', '<map region="china"/>'],
  ['放大到某几个省', 'region 写省名（空格分隔），自动缩放居中；highlight 点亮其中的省。', '<map region="四川 云南 重庆 贵州"\n     highlight="四川 云南" names/>'],
  ['用城市名定位', 'city、lonlat、at="城市名" 三种写法等价；经度在前。', '<circle id="a" city="成都"/>\n<circle id="b" lonlat="104.06,30.66"/>\n<text city="成都" off="0,-22" text="成都"/>'],
  ['小车沿路线行驶', 'path 写站点；arc 把每段走成弧线；heading 让车头朝着前进方向；trail 留下已走路线。', '<icon id="车" name="car" city="北京" size="34"/>\n<step dur="3">\n  <车 path="西安 成都 昆明" heading="0"\n      arc=".16" trail/>\n</step>'],
  ['站点用数据生成', '把站点写成 CSV，一个 for 生成圆点和城市名，换一份数据就是另一条路线。', '<data name="stops">城市\n北京\n西安\n成都</data>\n<for var="s" in="{stops}">\n  <circle city="{s.城市}" size="14"/>\n</for>'],
  ['地图换个气质', '换配色模板，底色、线条、标签全部跟着换；线条也可以逐项改。', '<scene palette="champagne">\n<map border="#9A7440" dash="5 3"\n     coast="#3F6B73" coastWidth="2.4"/>'],
];
$('mapRecipes').innerHTML = MAP_RECIPES.map(([title, desc, src]) => `<div class="qcard"><h3>${esc(title)}</h3><p>${esc(desc)}</p><pre>${code(src)}</pre></div>`).join('');

const MAP_LINES = [
  ['border', '省界颜色', 'none 则不画省界；默认次要色半透明'],
  ['borderWidth', '省界粗细', '默认 1.2'],
  ['dash', '省界虚线', 'dash="5 3"：画 5 段、空 3 段（乘以线宽）'],
  ['coast', '外轮廓颜色', '国界与海岸线；默认正文色'],
  ['coastWidth', '外轮廓粗细', '默认 2'],
  ['island', '南海诸岛颜色', 'none 不画；默认同外轮廓'],
  ['islandWidth', '南海诸岛粗细', '默认同外轮廓'],
  ['fill', '国土底色', '默认取配色的背景高光色'],
  ['highlight', '高亮的省', '用 color 填充，如 highlight="四川 云南"'],
  ['names', '省名', '缺省属性；names="large" / "small" 调大小'],
  ['inset', '南海小图', 'corner（默认，自动避开国土）/ off（按真实位置）/ none'],
  ['projection', '投影', 'lambert（默认，国内标准形状）/ equirect / mercator'],
];
$('mapLines').innerHTML = MAP_LINES.map(([k, n, d]) => `<div class="ease-item"><code>${k}</code><span><b>${esc(n)}</b> · ${esc(d)}</span></div>`).join('');

const GLYPH_DESC = [['car', '小汽车'], ['bus', '公交'], ['train', '火车'], ['plane', '飞机'], ['ship', '船']];
$('glyphRow').innerHTML = GLYPH_DESC.map(([n, l]) => `<div class="glyph-card"><canvas width="120" height="90" data-glyph="${n}"></canvas><code>name="${n}"</code><span>${l}</span></div>`).join('');
function paintGlyphs() {
  const dark = currentTheme() === 'dark';
  document.querySelectorAll('canvas[data-glyph]').forEach((cv) => {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.save();
    g.translate(cv.width / 2, cv.height / 2);
    drawGlyph(g, cv.dataset.glyph, 64, dark
      ? { body: '#5AA9FF', glass: '#d6e9ff', dark: 'rgba(0,20,60,.4)' }
      : { body: '#0071E3', glass: '#bcd9ff', dark: 'rgba(0,20,60,.35)' });
    g.restore();
  });
}
paintGlyphs();
addEventListener('gm-theme', paintGlyphs);

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
  '<a href="#sec-map">地图与路线</a>',
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
