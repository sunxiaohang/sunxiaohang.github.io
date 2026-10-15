import { schema } from '../core/index.js';
import { PALETTES } from '../core/palettes.js';
import { buildDocs } from '../editor/docs.js';
import { highlightLines } from '../editor/highlight.js';
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
$('q3').innerHTML = code('<scene width="800" height="500" grid="6x4" palette="pantone-living-coral">');

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

$('refBody').innerHTML = buildDocs(schema());

// 目录：一级固定项 + 参考里的各个 h4
const refHeads = [...$('refBody').querySelectorAll('h4')];
refHeads.forEach((h, i) => { h.id = `ref-${i}`; });
$('toc').innerHTML = [
  '<span class="grp">开始</span>',
  '<a href="#sec-quick">快速开始</a>',
  '<a href="#sec-palette">配色模板</a>',
  '<span class="grp">参考</span>',
  ...refHeads.map((h) => `<a href="#${h.id}">${esc(h.textContent)}</a>`),
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
