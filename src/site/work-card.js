import { toCss } from '../core/index.js';
import { setScenePalette } from '../app/scene-src.js';
import { currentTheme } from './theme.js';
import { Preview, fetchSource, compileSource, prefersReducedMotion } from './preview.js';

/** 作品卡片：进入视口才加载并渲染实时缩略图，悬停时播放。
 *  所有缩略图统一使用跟随站点主题的配色（亮：瓷白 / 暗：石墨），所以卡片底色整站一致。 */

const srcCache = new Map();   // 示例 id → Promise<string>
const sceneCache = new Map(); // `${id}|${palette}` → Promise<scene>

/** 缩略图统一配色：跟随亮暗主题 */
export const thumbPalette = () => (currentTheme() === 'dark' ? 'graphite' : 'porcelain');

const loadSrc = (ex) => {
  if (!srcCache.has(ex.id)) srcCache.set(ex.id, fetchSource(ex.file));
  return srcCache.get(ex.id);
};

/** 取脚本与编译结果；pal 为空表示用脚本自带配色 */
export async function getWork(ex, pal = '') {
  const src = await loadSrc(ex);
  const key = `${ex.id}|${pal}`;
  if (!sceneCache.has(key)) {
    sceneCache.set(key, compileSource(pal ? (setScenePalette(src, pal) ?? src) : src, ex.file));
  }
  return { src, scene: await sceneCache.get(key) };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const lazy = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      lazy.unobserve(e.target);
      e.target._load?.();
    }
  }, { rootMargin: '260px' })
  : null;

/** 返回 <a class="work">；点击默认跳 works.html#open=id，works 页会拦截并改为弹出查看器 */
export function createCard(ex, catName) {
  const card = document.createElement('a');
  card.className = 'work';
  card.href = `works.html#open=${encodeURIComponent(ex.id)}`;
  card.dataset.id = ex.id;
  card.innerHTML = `
    <div class="work-media"><canvas></canvas>
      <span class="work-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
    </div>
    <div class="work-body">
      <div class="work-cat">${esc(catName)}</div>
      <h3>${esc(ex.name)}</h3>
      <div class="work-tags">${(ex.covers || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </div>`;

  const media = card.querySelector('.work-media');
  const pv = new Preview(card.querySelector('canvas'), { captions: false, maxDpr: 1.5 });
  card._pv = pv;

  let loaded = false;
  const onTheme = () => { if (loaded) card._load(); };
  window.addEventListener('gm-theme', onTheme);
  card._destroy = () => { lazy?.unobserve(card); window.removeEventListener('gm-theme', onTheme); pv.destroy(); };

  card._load = async () => {
    try {
      const { scene } = await getWork(ex, thumbPalette());
      media.style.background = toCss(scene.bg);
      pv.setScene(scene);
      pv.poster();
      loaded = true;
      card.classList.add('ready');
    } catch (err) {
      card.classList.add('failed');
      media.title = String(err.message || err);
    }
  };

  if (!prefersReducedMotion()) {
    media.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch' && pv.scene) pv.restart(); });
    media.addEventListener('pointerleave', () => { if (pv.scene) pv.poster(); });
  }

  if (lazy) lazy.observe(card); else card._load();
  return card;
}
