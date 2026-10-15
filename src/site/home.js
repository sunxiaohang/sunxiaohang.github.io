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
const autoPalette = () => (currentTheme() === 'dark' ? 'material-dark' : 'material');
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
const SWATCHES = ['auto', 'pantone-classic-blue', 'pantone-living-coral', 'pantone-greenery', 'macaron', 'sunset', 'ocean', 'neon', 'dracula'];
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
$('palStrips').innerHTML = ['pantone-classic-blue', 'pantone-living-coral', 'dracula', 'macaron']
  .map((id) => `<div class="pal-strip" title="${esc(getPalette(id).label)}">${getPalette(id).series.map((c) => `<i style="background:${c}"></i>`).join('')}</div>`).join('');

// ================= 作品精选 =================
const FEATURED = ['gomoku', 'orbits', 'easing-gallery', 'palette-demo', 'xiangqi', 'times-table'];
const catName = (id) => manifest.categories.find((c) => c.id === id)?.name || id;
for (const id of FEATURED) {
  const ex = manifest.examples.find((e) => e.id === id);
  if (ex) $('rail').appendChild(createCard(ex, catName(ex.category)));
}
