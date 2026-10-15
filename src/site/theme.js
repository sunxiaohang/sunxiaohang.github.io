/**
 * 亮 / 暗主题：html[data-theme] 控制整站配色。
 * 首次进入跟随系统；用户手动切换后记住选择；各页面 <head> 里有一小段内联脚本，在首帧前就设好，避免闪烁。
 */
const KEY = 'gm.theme';
const root = document.documentElement;
const mq = matchMedia('(prefers-color-scheme: dark)');

const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

export const currentTheme = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');

export function setTheme(theme, persist = true) {
  root.classList.add('theme-anim'); // 切换瞬间给颜色加过渡，之后移除，避免拖慢其它动画
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#fbfbfd');
  if (persist) { try { localStorage.setItem(KEY, theme); } catch { /* ignore */ } }
  clearTimeout(setTheme._t);
  setTheme._t = setTimeout(() => root.classList.remove('theme-anim'), 420);
  window.dispatchEvent(new CustomEvent('gm-theme', { detail: theme }));
}

export function initTheme() {
  if (!root.dataset.theme) root.dataset.theme = stored() || (mq.matches ? 'dark' : 'light');
  mq.addEventListener?.('change', (e) => { if (!stored()) setTheme(e.matches ? 'dark' : 'light', false); });
}

export const toggleTheme = () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark');

export function bindThemeButton(btn) {
  if (!btn) return;
  const sync = () => {
    const dark = currentTheme() === 'dark';
    btn.setAttribute('aria-label', dark ? '切换到浅色主题' : '切换到深色主题');
    btn.title = dark ? '切换到浅色主题' : '切换到深色主题';
  };
  btn.addEventListener('click', toggleTheme);
  window.addEventListener('gm-theme', sync);
  sync();
}

export const THEME_ICONS =
  '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>' +
  '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.7 6.7 0 0 0 10.5 10.5z"/></svg>';
