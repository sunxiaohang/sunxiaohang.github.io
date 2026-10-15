import { PALETTES, getPalette } from '../core/palettes.js';
import { toCss } from '../core/index.js';
import { highlightLines } from '../editor/highlight.js';
import { setScenePalette } from '../app/scene-src.js';
import { mountChrome, initReveal } from './chrome.js';
import { currentTheme } from './theme.js';
import { Preview, fetchSource, compileSource } from './preview.js';
import { createCard } from './work-card.js';

mountChrome('home');
initReveal();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const autoPalette = () => (currentTheme() === 'dark' ? 'graphite' : 'porcelain');
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

// 导航栏滚动后显示细分割线
const nav = $('siteNav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 4);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const manifest = await (await fetch('examples/manifest.json')).json();
const hiddenCats = new Set(manifest.categories.filter((c) => c.hidden).map((c) => c.id));
$('statWorks').textContent = String(manifest.examples.filter((e) => !hiddenCats.has(e.category)).length);
$('statPal').textContent = String(PALETTES.length);

// ================= Hero：实时太阳系 + 配色切换 =================
const SWATCHES = ['auto', 'aurora', 'champagne', 'nord', 'pantone-classic-blue', 'pantone-mocha-mousse', 'ocean', 'dracula', 'solarized-light'];
const hero = { file: 'site/hero.xml', src: '', pick: 'auto', pv: null };

const swBox = $('heroSwatches');
swBox.innerHTML = SWATCHES.map((id) => {
  if (id === 'auto') return '<button class="swatch auto" type="button" data-p="auto" aria-pressed="true" title="跟随亮暗主题" aria-label="自动配色"></button>';
  const p = getPalette(id);
  return `<button class="swatch" type="button" data-p="${id}" aria-pressed="false" title="${esc(p.label)}" aria-label="${esc(p.label)}" style="background:linear-gradient(135deg,${p.tokens.c1} 0 50%,${p.tokens.c2} 50% 100%)"></button>`;
}).join('');

async function paintHero() {
  const name = hero.pick === 'auto' ? autoPalette() : hero.pick;
  const p = getPalette(name);
  const scene = await compileSource(setScenePalette(hero.src, name), hero.file);
  const first = !hero.pv.scene;
  hero.pv.setScene(scene, { keepTime: !first });
  $('heroCard').style.background = toCss(scene.bg);
  $('heroCard').classList.add('ready');
  $('heroName').innerHTML = `<b>${esc(p.label)}</b> · palette="${esc(p.name)}"`;
  if (first) hero.pv.autoplayWhenVisible(); else if (!hero.pv.player.playing) hero.pv.play();
  syncHeroBtn();
}
const syncHeroBtn = () => { $('heroPlay').innerHTML = hero.pv?.player.playing ? ICON_PAUSE : ICON_PLAY; };

hero.pv = new Preview($('heroCanvas'));
hero.pv.player.on('play', syncHeroBtn);
hero.pv.player.on('pause', syncHeroBtn);
$('heroPlay').addEventListener('click', () => { if (hero.pv.player.playing) hero.pv.pause(); else hero.pv.play(); });
swBox.addEventListener('click', (e) => {
  const b = e.target.closest('.swatch');
  if (!b) return;
  hero.pick = b.dataset.p;
  swBox.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  paintHero();
});
addEventListener('gm-theme', () => { if (hero.pick === 'auto') paintHero(); if (show.ready) paintShow(); });

hero.src = await fetchSource(hero.file);
paintHero().catch((err) => { $('heroName').textContent = `演示加载失败：${err.message}`; });

// ================= 代码对照 =================
const SHOW = [
  { id: 'path', label: '沿路径移动', file: 'site/path.xml', note: '只写路径点和 smooth，圆滑的曲线、拖尾、缓动都是引擎算出来的。' },
  { id: 'loop', label: 'for 循环', file: 'site/loop.xml', note: '一个 for 生成一排对象，表达式给每个对象不同的位置、颜色和缓动。' },
  { id: 'chart', label: '数据驱动', file: 'site/chart.xml', note: '内联 CSV 作为数据源，每一行变成一根柱子，换数据就换图表。' },
];
const show = { pick: 'path', ready: false, pv: new Preview($('showCanvas')), cache: {} };

$('showTabs').innerHTML = SHOW.map((s) => `<button type="button" role="tab" data-id="${s.id}" aria-selected="${s.id === show.pick}">${s.label}</button>`).join('');

async function paintShow() {
  const item = SHOW.find((s) => s.id === show.pick);
  const raw = (show.cache[item.id] ??= await fetchSource(item.file));
  const src = setScenePalette(raw, autoPalette());
  const scene = await compileSource(src, item.file);
  $('showCode').innerHTML = highlightLines(src).map((h) => `<div class="ln">${h || ' '}</div>`).join('');
  $('showFile').textContent = `${item.id}.xml`;
  $('showNote').textContent = item.note;
  $('showCard').style.background = toCss(scene.bg);
  $('showCard').classList.add('ready');
  show.pv.setScene(scene);
  show.pv.restart();
  show.ready = true;
}
show.pv.player.on('frame', (t) => {
  const sc = show.pv.scene;
  if (!sc) return;
  const i = show.pv.player.stepIndex;
  $('showSay').textContent = i >= 0 ? `步骤 ${i + 1}/${sc.steps.length} · ${sc.steps[i].say}` : '';
});
$('showTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  show.pick = b.dataset.id;
  $('showTabs').querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  paintShow();
});
$('showReplay').addEventListener('click', () => show.pv.restart());
paintShow().catch((err) => { $('showNote').textContent = `加载失败：${err.message}`; });
new IntersectionObserver(([en]) => { if (!en.isIntersecting) show.pv.pause(); else if (show.ready) show.pv.play(); }, { threshold: 0.15 }).observe($('showCard'));

// ================= Bento：迷你代码、配色条 =================
$('miniCode').innerHTML = highlightLines(
  '<step say="A 走到 B">\n  <a at="6,4" ease="back" trail/>\n  <b pulse=".2"/>\n</step>',
).map((h) => `<div>${h}</div>`).join('');
$('palStrips').innerHTML = ['porcelain', 'graphite', 'aurora', 'champagne']
  .map((id) => `<div class="pal-strip" title="${esc(getPalette(id).label)}">${getPalette(id).series.map((c) => `<i style="background:${c}"></i>`).join('')}</div>`).join('');

// ================= 作品精选 =================
const FEATURED = ['gomoku', 'xiangqi', 'sine-wave', 'orbits', 'easing-gallery', 'times-table'];
const catName = (id) => manifest.categories.find((c) => c.id === id)?.name || id;
for (const id of FEATURED) {
  const ex = manifest.examples.find((e) => e.id === id);
  if (ex) $('rail').appendChild(createCard(ex, catName(ex.category)));
}

// ================= 适用场景 =================
const CASES = [
  { id: 'literacy', tag: '教学课件', title: '课堂上的每一步', desc: '识字、算术、棋谱：每一步配一句字幕，暂停在任何一帧都是一页完整的讲义。' },
  { id: 'bubble-sort', tag: '算法讲解', title: '把算法讲成动画', desc: '柱子互换、格子淡出、指针移动。数据换一组，动画自己重排。' },
  { id: 'dashboard', tag: '数据汇报', title: '会动的数据看板', desc: 'CSV 进去，卡片和图表出来；周报月报换一份数据就是新的一期。' },
  { id: 'request-flow', tag: '产品演示', title: '流程与架构一目了然', desc: '节点、箭头、沿路径流动的数据包，把一次请求从头到尾讲清楚。' },
];
for (const c of CASES) {
  const ex = manifest.examples.find((e) => e.id === c.id);
  if (!ex) continue;
  const card = createCard(ex, c.tag);
  card.classList.add('case');
  card.querySelector('.work-body').innerHTML = `<div class="work-cat">${esc(c.tag)}</div><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p>`;
  $('casesGrid').appendChild(card);
}

// ================= 写法对比 =================
const OLD_CODE = [
  '// 手写逐帧：自己插值、自己画拖尾、自己管时间',
  "const pts = [[1,4],[2.6,1.6],[6,1.6],[7.2,4]];",
  'const DUR = 1800;',
  'function frame(now) {',
  '  const t = Math.min((now - t0) / DUR, 1);',
  '  const k = easeInOut(t);',
  '  const p = bezierThrough(pts, k);',
  '  ctx.clearRect(0, 0, W, H);',
  '  drawTrail(ctx, trail.push(p); trail);',
  '  drawCircle(ctx, p.x * cell, p.y * cell, r);',
  '  if (t < 1) requestAnimationFrame(frame);',
  '}',
  'requestAnimationFrame((n) => { t0 = n; frame(n); });',
];
$('cmpOld').innerHTML = OLD_CODE.map((l) => `<div class="ln${l.startsWith('//') ? ' tk-c' : ''}">${esc(l)}</div>`).join('');
$('cmpNew').innerHTML = highlightLines(
  '<step say="A 要去 B" dur="1.8">\n  <a path="1,4 2.6,1.6 6,1.6 7.2,4"\n     smooth trail ease="soft"/>\n</step>',
).map((h) => `<div class="ln">${h || ' '}</div>`).join('');

// ================= 配色展示 =================
const SHOWCASE = ['porcelain', 'graphite', 'aurora', 'champagne', 'nord', 'dracula', 'solarized-light', 'pantone-mocha-mousse'];
$('palShowcase').innerHTML = SHOWCASE.map((id) => {
  const p = getPalette(id);
  const t = p.tokens;
  return `<a class="pal-card" href="docs.html#sec-palette" style="text-decoration:none">
    <div class="pal-top" style="background:${t.bg};color:${t.text}">
      <b>${esc(p.label)}</b>
      <div class="pal-dots">${p.series.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
      <div class="pal-bars"><i style="background:${t.accent};width:62%"></i><i style="background:${t.accent2};width:38%"></i><i style="background:${t.bg2};width:50%;box-shadow:0 0 0 1px ${t.sub}55"></i></div>
    </div>
    <div class="pal-meta"><code>palette="${esc(p.name)}"</code></div>
  </a>`;
}).join('');

// ================= 常见问题 =================
const FAQ = [
  ['需要安装什么吗？', '不需要。CodeMotion 是纯前端项目，打开网页就能写、能预览、能导出，没有任何依赖。'],
  ['我的脚本会上传到服务器吗？', '不会。脚本只保存在你自己浏览器的本地存储里，所有渲染和导出都在本机完成。'],
  ['能导出什么？', 'WebM 视频（离线逐帧或实时录制）、分镜长图、当前帧 PNG，以及一条可以分享的链接。'],
  ['和手写 Canvas 或 CSS 动画相比有什么好处？', '你只描述“画面要变成什么样”，补间、缓动、轨道和字幕由引擎推算；时间轴是确定的，任意一帧都能精确回放，方便做分步讲解。'],
  ['适合做什么，不适合做什么？', '适合几何图形驱动的讲解类动画：教学、算法、流程、数据图表。不适合需要位图素材、复杂角色动画或视频剪辑的场景。'],
  ['视频导出需要什么浏览器？', '推荐最新版 Chrome 或 Edge。其他浏览器仍可正常预览，也可以导出分镜长图和 PNG。'],
];
$('faqList').innerHTML = FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
