import { initTheme, bindThemeButton, THEME_ICONS } from './theme.js';

const LINKS = [
  ['home', 'index.html', '首页'],
  ['works', 'works.html', '作品库'],
  ['docs', 'docs.html', '文档'],
  ['editor', 'editor.html', '编辑器'],
];

const REPO = 'https://github.com/sunxiaohang/sunxiaohang.github.io';

/** 渲染各页共用的导航栏与页脚，并接上主题开关 */
export function mountChrome(active) {
  initTheme();

  const nav = document.getElementById('siteNav');
  if (nav) {
    nav.className = 'nav';
    nav.innerHTML = `
      <div class="nav-in">
        <a class="brand" href="index.html" aria-label="GridMotion 首页"><span class="logo"></span><b>GridMotion</b></a>
        <div class="nav-links">
          ${LINKS.map(([id, href, label]) => `<a href="${href}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
        </div>
        <div class="nav-right">
          <button class="icon-btn" id="themeBtn" type="button">${THEME_ICONS}</button>
          <a class="btn btn-primary btn-sm" href="editor.html">开始创作</a>
        </div>
      </div>`;
    bindThemeButton(nav.querySelector('#themeBtn'));
  }

  const foot = document.getElementById('siteFooter');
  if (foot) {
    foot.className = 'footer';
    foot.innerHTML = `
      <div class="wrap">
        <div class="foot-grid">
          <div class="foot-brand">
            <a class="brand" href="index.html"><span class="logo"></span><b>GridMotion</b></a>
            <p>用 XML 写几何动画与教学动画。<br>写结果，不写过程。</p>
          </div>
          <div><h5>产品</h5><a href="editor.html">编辑器</a><a href="works.html">作品库</a><a href="docs.html">文档</a></div>
          <div><h5>资源</h5><a href="docs.html#sec-palette">配色模板</a><a href="docs.html">语法速查</a><a href="${REPO}" target="_blank" rel="noopener">GitHub</a></div>
        </div>
        <div class="foot-bottom"><span>© 2026 GridMotion · MIT License</span><span>纯前端运行，脚本只保存在你的浏览器里</span></div>
      </div>`;
  }
}

/** 滚动入场：给 .reveal 元素在进入视口时加 .in */
export function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  items.forEach((el) => io.observe(el));
}
