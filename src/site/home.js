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

// ================= Hero：开篇轮播（自动播放，不用点击） =================
// 五个场景依次播放，每个完整播完一遍再换下一个；全部由真实引擎实时渲染。
// 首个场景固定为“点阵变形”（和主标题“写结果，不写过程”呼应），之后按顺序轮换。
// 这是产品演示而不是装饰动效，所以即使系统开了“减少动效”也照常播放——右下角始终有暂停键。
const REEL = [
  { id: 'dots', label: '点阵变形', file: 'site/hero.xml' },
  { id: 'ripple', label: '涟漪', file: 'site/hero-ripple.xml' },
  { id: 'galaxy', label: '星系', file: 'site/hero-galaxy.xml' },
  { id: 'wave', label: '均衡器', file: 'site/hero-wave.xml' },
  { id: 'route', label: '旅行路线', file: 'site/hero-map.xml' },
];
const SWATCHES = ['auto', 'aurora', 'champagne', 'nord', 'pantone-classic-blue', 'pantone-mocha-mousse', 'ocean', 'dracula', 'solarized-light'];
const hero = { idx: 0, pick: 'auto', pv: null, token: 0, visible: false, userPaused: false, srcs: new Map(), scenes: new Map(), preloaded: '' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const swBox = $('heroSwatches');
swBox.innerHTML = SWATCHES.map((id) => {
  if (id === 'auto') return '<button class="swatch auto" type="button" data-p="auto" aria-pressed="true" title="跟随亮暗主题" aria-label="自动配色"></button>';
  const p = getPalette(id);
  return `<button class="swatch" type="button" data-p="${id}" aria-pressed="false" title="${esc(p.label)}" aria-label="${esc(p.label)}" style="background:linear-gradient(135deg,${p.tokens.c1} 0 50%,${p.tokens.c2} 50% 100%)"></button>`;
}).join('');

const reel = $('heroReel');
reel.innerHTML = REEL.map((r, k) => `<button type="button" role="tab" data-i="${k}" aria-selected="${k === 0}"><i class="reel-bar"><b></b></i><span>${esc(r.label)}</span></button>`).join('');
const reelFills = [...reel.querySelectorAll('b')];

/** 取（并缓存）某个场景在某套配色下的编译结果；失败时清掉缓存，下次可重试 */
function heroScene(k, palName) {
  const item = REEL[k];
  const key = `${item.file}|${palName}`;
  if (!hero.scenes.has(key)) {
    if (!hero.srcs.has(item.file)) hero.srcs.set(item.file, fetchSource(item.file));
    const job = hero.srcs.get(item.file)
      .then((raw) => compileSource(setScenePalette(raw, palName), item.file))
      .catch((err) => { hero.scenes.delete(key); throw err; });
    hero.scenes.set(key, job);
  }
  return hero.scenes.get(key);
}

/** 画面稳定后，错开时间把其余场景编译好，切换时就不会卡 */
async function preloadRest(palName) {
  if (hero.preloaded === palName) return;
  hero.preloaded = palName;
  for (let k = 0; k < REEL.length; k++) {
    await sleep(450);
    try { await heroScene(k, palName); } catch { /* 播到时再报错 */ }
  }
}

const syncHeroBtn = () => { $('heroPlay').innerHTML = hero.userPaused ? ICON_PLAY : ICON_PAUSE; };

/** 可见且用户没按暂停就播放，否则暂停 */
function applyPlayback() {
  const pv = hero.pv;
  if (!pv?.scene) return;
  if (hero.visible && !hero.userPaused) pv.play(); else pv.pause();
  syncHeroBtn();
}

/** 切到第 k 个场景。keep：保留当前时间（只换配色时用）；instant：不做淡出淡入 */
async function showScene(k, { keep = false, instant = false } = {}) {
  const token = ++hero.token;
  const palName = hero.pick === 'auto' ? autoPalette() : hero.pick;
  const scene = await heroScene(k, palName);
  if (token !== hero.token) return;
  const card = $('heroCard');
  if (!instant && hero.pv.scene && k !== hero.idx) {
    card.classList.add('swap');
    await sleep(300);
    if (token !== hero.token) return;
  }
  hero.idx = k;
  reel.querySelectorAll('button').forEach((b, n) => {
    b.setAttribute('aria-selected', String(n === k));
    if (n !== k) reelFills[n].style.width = '0%';
  });
  hero.pv.setScene(scene, { keepTime: keep });
  card.style.background = toCss(scene.bg);
  card.classList.add('ready');
  card.classList.remove('swap');
  const p = getPalette(palName);
  $('heroName').innerHTML = `<b>${esc(p.label)}</b> · palette="${esc(p.name)}"`;
  applyPlayback();
  preloadRest(palName);
}

hero.pv = new Preview($('heroCanvas'), { loop: false });
hero.pv.player.on('frame', (t) => {
  const d = hero.pv.player.duration;
  if (d) reelFills[hero.idx].style.width = `${Math.min(100, (t / d) * 100)}%`;
});
// 一个场景完整播完 → 自动换下一个（用户按了暂停就不换）
hero.pv.player.on('end', () => { if (!hero.userPaused) showScene((hero.idx + 1) % REEL.length).catch(() => {}); });

$('heroPlay').addEventListener('click', () => { hero.userPaused = !hero.userPaused; applyPlayback(); });
reel.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  hero.userPaused = false;
  showScene(Number(b.dataset.i), { instant: false }).catch(() => {});
});
swBox.addEventListener('click', (e) => {
  const b = e.target.closest('.swatch');
  if (!b) return;
  hero.pick = b.dataset.p;
  swBox.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  showScene(hero.idx, { keep: true, instant: true }).catch(() => {});
});
// 可见性直接用位置计算，不依赖 IntersectionObserver 的首次回调（它可能迟到，开篇动画必须一加载就开播）。
// 卡片露出至少 15% 且标签页在前台就播放，滚出画面或切走标签页就暂停，回来继续。
const inView = () => {
  if (document.hidden) return false;
  const r = $('heroCard').getBoundingClientRect();
  const shown = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
  return shown >= r.height * 0.15;
};
const recheckView = () => { const v = inView(); if (v !== hero.visible) { hero.visible = v; applyPlayback(); } };
hero.visible = inView();
addEventListener('scroll', recheckView, { passive: true });
addEventListener('resize', recheckView);
document.addEventListener('visibilitychange', recheckView);
addEventListener('gm-theme', () => { if (hero.pick === 'auto') showScene(hero.idx, { keep: true, instant: true }).catch(() => {}); if (show.ready) paintShow(); });

showScene(0, { instant: true }).catch((err) => { $('heroName').textContent = `演示加载失败：${err.message}`; });

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
const FEATURED = ['gomoku', 'china-tour', 'dashboard', 'high-speed-rail', 'sine-wave', 'xiangqi'];
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
  { id: 'china-tour', tag: '旅游地图', title: '一条路线，一句话走完', desc: '内置中国地图和 380 多个城市：写城市名，小车沿弧线从 A 到 B 到 C，离线可用。' },
  { id: 'southwest-drive', tag: '区域地图', title: '放大到你要讲的那几个省', desc: '省界、外轮廓、南海诸岛的线条颜色、粗细、虚实都能自己定。' },
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
