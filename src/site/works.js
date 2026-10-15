import { PALETTES } from '../core/palettes.js';
import { toCss } from '../core/index.js';
import { highlightLines } from '../editor/highlight.js';
import { setScenePalette } from '../app/scene-src.js';
import { mountChrome, initReveal } from './chrome.js';
import { Preview, compileSource } from './preview.js';
import { createCard, getWork } from './work-card.js';

mountChrome('works');
initReveal();

const $ = (id) => document.getElementById(id);
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

const nav = $('siteNav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 4);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const manifest = await (await fetch('examples/manifest.json')).json();
const hiddenCats = new Set(manifest.categories.filter((c) => c.hidden).map((c) => c.id));
const cats = manifest.categories.filter((c) => !c.hidden);
const works = manifest.examples.filter((e) => !hiddenCats.has(e.category));
const catName = (id) => manifest.categories.find((c) => c.id === id)?.name || id;

// ================= 列表：筛选 + 搜索 =================
const state = { cat: 'all', q: '' };
const chipsEl = $('chips');
chipsEl.innerHTML = [['all', '全部', works.length], ...cats.map((c) => [c.id, c.name, works.filter((w) => w.category === c.id).length])]
  .map(([id, name, n]) => `<button class="chip" type="button" data-cat="${id}" aria-pressed="${id === 'all'}">${name}<small>${n}</small></button>`).join('');

const gridEl = $('grid');
const cards = new Map();
for (const ex of works) {
  const card = createCard(ex, catName(ex.category));
  card.dataset.cat = ex.category;
  card.dataset.text = `${ex.name} ${ex.id} ${(ex.covers || []).join(' ')} ${catName(ex.category)}`.toLowerCase();
  cards.set(ex.id, card);
  gridEl.appendChild(card);
}
const empty = document.createElement('div');
empty.className = 'empty';
empty.textContent = '没有找到匹配的作品';
empty.hidden = true;
gridEl.appendChild(empty);

function applyFilter() {
  const q = state.q.trim().toLowerCase();
  let shown = 0;
  for (const card of cards.values()) {
    const ok = (state.cat === 'all' || card.dataset.cat === state.cat) && (!q || card.dataset.text.includes(q));
    card.hidden = !ok;
    if (ok) shown++;
  }
  empty.hidden = shown > 0;
}
chipsEl.addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  state.cat = b.dataset.cat;
  chipsEl.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  applyFilter();
});
$('q').addEventListener('input', (e) => { state.q = e.target.value; applyFilter(); });

// ================= 查看器 =================
const dlg = $('viewer');
const pv = new Preview($('vCanvas'), { loop: true });
const view = { ex: null, raw: '', src: '', pal: '' };

$('vPal').innerHTML = '<option value="">脚本自带配色</option>' + ['浅色', '深色'].map((label, i) =>
  `<optgroup label="${label}">${PALETTES.filter((p) => p.dark === Boolean(i)).map((p) => `<option value="${p.name}">${p.label}</option>`).join('')}</optgroup>`).join('');

const syncPlay = () => { $('vPlay').innerHTML = pv.player.playing ? ICON_PAUSE : ICON_PLAY; };
pv.player.on('play', syncPlay);
pv.player.on('pause', syncPlay);
pv.player.on('frame', (t) => {
  const sc = pv.scene;
  if (!sc) return;
  const i = pv.player.stepIndex;
  $('vTime').textContent = `${sc.steps.length ? `步 ${Math.max(0, i) + 1}/${sc.steps.length} · ` : ''}${Math.min(t, sc.duration).toFixed(1)} / ${sc.duration.toFixed(1)}s`;
  $('stepList').querySelectorAll('button').forEach((b, k) => {
    if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
});

async function rebuild(keepTime) {
  const { ex } = view;
  view.src = view.pal ? setScenePalette(view.raw, view.pal) : view.raw;
  const scene = await compileSource(view.src, ex.file);
  $('vCard').style.background = toCss(scene.bg);
  $('vCard').classList.add('ready');
  pv.setScene(scene, { keepTime });
  $('stepList').innerHTML = scene.steps.map((s, i) => `<li><button type="button" data-i="${i}"><b>${i + 1}</b><span></span></button></li>`).join('');
  $('stepList').querySelectorAll('button span').forEach((el, i) => { el.textContent = scene.steps[i].say || `第 ${i + 1} 步`; });
  // 每行带上缩进深度：自动换行后的续行按缩进悬挂对齐，不用横向滚动
  const srcLines = view.src.split(/\r?\n/);
  $('codeView').innerHTML = highlightLines(view.src).map((h, i) => `<div class="ln" style="--i:${(/^ */.exec(srcLines[i] || '')[0] || '').length}">${h || ' '}</div>`).join('');
}

async function openWork(id, push = true) {
  const ex = works.find((w) => w.id === id);
  if (!ex) return;
  view.ex = ex;
  const { src } = await getWork(ex);
  view.raw = src;
  // 脚本自带的配色在下拉里显示为“脚本自带”，只有用户主动选了别的才改写源码
  view.pal = '';
  $('vPal').value = '';
  $('vCat').textContent = catName(ex.category);
  $('vTitle').textContent = ex.name;
  $('vOpen').href = `editor.html#ex=${encodeURIComponent(ex.id)}`;
  if (!dlg.open) dlg.showModal();
  selectTab('steps');
  await rebuild(false);
  pv.restart();
  if (push) history.replaceState(null, '', `#open=${encodeURIComponent(id)}`);
}

function closeViewer() {
  pv.pause();
  if (dlg.open) dlg.close();
  history.replaceState(null, '', location.pathname + location.search);
}

gridEl.addEventListener('click', (e) => {
  const a = e.target.closest('a.work');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  openWork(a.dataset.id);
});
$('vClose').addEventListener('click', closeViewer);
dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeViewer(); });
dlg.addEventListener('click', (e) => { if (e.target === dlg) closeViewer(); });
$('vPlay').addEventListener('click', () => { if (pv.player.playing) pv.pause(); else pv.play(); });
$('vNext').addEventListener('click', () => { pv.player.next(); });
$('vPrev').addEventListener('click', () => { pv.player.prev(); });
$('vSpeed').addEventListener('change', (e) => { pv.player.speed = +e.target.value; });
$('vPal').addEventListener('change', (e) => { view.pal = e.target.value; rebuild(true); });
$('stepList').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (b) pv.player.goStep(+b.dataset.i);
});

function selectTab(tab) {
  dlg.querySelectorAll('.viewer-side .seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('pSteps').hidden = tab !== 'steps';
  $('pCode').hidden = tab !== 'code';
}
dlg.querySelector('.viewer-side .seg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) selectTab(b.dataset.tab);
});

$('vCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(view.src); $('vCopy').textContent = '已复制'; }
  catch { $('vCopy').textContent = '复制失败'; }
  setTimeout(() => { $('vCopy').textContent = '复制脚本'; }, 1400);
});

dlg.addEventListener('keydown', (e) => {
  if (e.target.matches('select, input')) return;
  if (e.code === 'Space') { e.preventDefault(); $('vPlay').click(); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); pv.player.next(); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); pv.player.prev(); }
});

// 深链：works.html#open=gomoku
const fromHash = () => {
  const id = new URLSearchParams(location.hash.slice(1)).get('open');
  if (id) openWork(id, false);
};
fromHash();
addEventListener('hashchange', fromHash);
