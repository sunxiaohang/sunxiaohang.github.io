import { compileWithImports, lint } from '../core/index.js';
import { PALETTES } from '../core/palettes.js';
import { SoundEngine } from '../audio/sound.js';
import { Player } from '../player/player.js';
import { renderStoryboard } from '../export/storyboard.js';
import { startWebmRecording, download } from '../export/webm.js';
import { exportWebm, webCodecsSupported } from '../export/encode.js';
import { CodeEditor, Console } from '../editor/code-editor.js';
import { mountChrome } from '../site/chrome.js';
import { StageView } from './stage-view.js';
import { TimelineView } from './timeline-view.js';
import { setScenePalette, getScenePalette, setSceneAttr, getSceneAttr } from './scene-src.js';

mountChrome('editor');

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'gridmotion.src.v4';
const PROJECTS_KEY = 'gridmotion.projects.v1';
const CURRENT_KEY = 'gridmotion.current.v1';
const hash = new URLSearchParams(location.hash.slice(1));

// ---- 多场景（本地项目列表）----
let projects = [];
let currentId = null;

// 分享链接：脚本用 URL-safe base64 压缩，比 percent-encoding 紧凑，能容纳更长脚本
const encodeShare = (src) => {
  const bytes = new TextEncoder().encode(src);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const decodeShare = (code) => {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  if (/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
    try {
      const pad = '='.repeat((4 - (b64.length % 4)) % 4);
      return new TextDecoder().decode(Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0)));
    } catch { /* 不是合法 base64，退回原文 */ }
  }
  return code;
};

const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
const ICON_SOUND_ON = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

// ---------- 装配 ----------
const player = new Player();
const sound = new SoundEngine();
const stage = new StageView({ canvas: $('stage'), wrap: $('stagewrap') });
const con = new Console({ el: $('console'), status: $('status'), onJump: (l, c) => editor.goto(l, c) });
const editor = new CodeEditor({
  textarea: $('src'), highlight: $('hl'), gutter: $('gutter'),
  onChange: () => recompile(true),
  onRun: () => { recompile(false); player.seek(0); player.play(); },
});
const timeline = new TimelineView({
  root: $('lanes'), ruler: $('ruler'), stepTrack: $('stepTrack'), rows: $('laneRows'), playhead: $('playhead'),
  onScrubStart: () => { scrub.resume = player.playing; player.pause(); },
  onScrub: (t) => player.seek(t),
  onScrubEnd: () => { if (scrub.resume) player.play(); },
});
const scrub = { resume: false };
let exporting = null;

// ---------- 多场景（本地项目） ----------
function loadProjects() {
  try { projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]'); }
  catch { projects = []; }
  if (!Array.isArray(projects)) projects = [];
  // 迁移旧单场景草稿
  if (!projects.length) {
    try {
      const old = localStorage.getItem(STORAGE_KEY);
      if (old) projects.push({ id: 'p1', name: '我的场景', src: old, updatedAt: Date.now() });
    } catch { /* ignore */ }
  }
  if (!projects.length) projects.push({ id: 'p1', name: '未命名', src: '', updatedAt: Date.now() });
  currentId = localStorage.getItem(CURRENT_KEY);
  if (!currentId || !projects.some((p) => p.id === currentId)) currentId = projects[0].id;
}
function saveProjects() {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); } catch { /* ignore */ }
}
const currentProject = () => projects.find((p) => p.id === currentId) || projects[0];
function persistCurrent() {
  const p = currentProject();
  if (p) { p.src = editor.value; p.updatedAt = Date.now(); saveProjects(); }
  try { localStorage.setItem(STORAGE_KEY, editor.value); } catch { /* ignore */ }
}
function renderProjects() {
  const sel = $('projects');
  sel.innerHTML = '';
  for (const p of projects) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    sel.appendChild(o);
  }
  const add = document.createElement('option');
  add.value = '__new__'; add.textContent = '＋ 新建场景';
  sel.appendChild(add);
  const del = document.createElement('option');
  del.value = '__del__'; del.textContent = '－ 删除当前';
  sel.appendChild(del);
  sel.value = currentId;
}
function switchProject(id) {
  persistCurrent();
  currentId = id;
  try { localStorage.setItem(CURRENT_KEY, id); } catch { /* ignore */ }
  editor.value = currentProject().src;
  recompile(false);
  renderProjects();
}
function newProject() {
  const p = {
    id: 'p' + Date.now(), name: '未命名', updatedAt: Date.now(),
    src: '<scene width="800" height="600" grid="4x3">\n  <circle id="a" at="1,1" fill="#7c6cff" sound="pop"/>\n  <step say="你好！" dur=".6">\n    <a at="3,3" pulse=".1"/>\n  </step>\n</scene>\n',
  };
  persistCurrent();
  projects.push(p);
  currentId = p.id;
  try { localStorage.setItem(CURRENT_KEY, p.id); } catch { /* ignore */ }
  saveProjects();
  editor.value = p.src;
  recompile(false);
  renderProjects();
}
function deleteProject() {
  if (projects.length <= 1) { alert('至少保留一个场景'); renderProjects(); return; }
  projects = projects.filter((p) => p.id !== currentId);
  currentId = projects[0].id;
  try { localStorage.setItem(CURRENT_KEY, currentId); } catch { /* ignore */ }
  saveProjects();
  editor.value = currentProject().src;
  recompile(false);
  renderProjects();
}

// ---------- 编译：脚本 → 场景 → 各视图 ----------
let baseDir = new URL('.', location.href).href; // 用于解析 <import src> 的相对路径
const loader = async (p) => {
  const r = await fetch(new URL(p, baseDir).href);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};
let recompileToken = 0;
async function recompile(keepTime) {
  const src = editor.value;
  persistCurrent();
  const token = ++recompileToken;
  const res = await compileWithImports(src, loader);
  if (token !== recompileToken) return; // 已有更新的编辑，丢弃过期结果
  if (typeof syncPaletteMenu === 'function') syncPaletteMenu();
  if (typeof syncCaptionMenus === 'function') syncCaptionMenus();
  const diagnostics = [...res.diagnostics, ...(res.scene ? lint(res.scene) : [])];
  const known = res.scene ? { ids: new Set(res.scene.entities.map((e) => e.id)), defs: new Set(res.scene.defNames) } : undefined;
  editor.setDiagnostics(diagnostics, known);
  con.render({ scene: res.scene, diagnostics });
  if (!res.scene) { stage.setIssues([]); return; }
  // 诊断对象 → 画布红框高亮
  const issues = new Set();
  for (const d of diagnostics) {
    if (d.id) issues.add(d.id);
    if (d.ids) d.ids.forEach((id) => issues.add(id));
  }
  stage.setIssues(issues);
  stage.setScene(res.scene);
  timeline.build(res.scene);
  player.setScene(res.scene, { keepTime });
}

// ---------- Player → 视图 ----------
player.on('frame', (t) => {
  const frame = stage.render(t);
  if (!frame) return;
  const sc = player.scene, n = sc.steps.length;
  $('time').textContent = `${n ? `步 ${Math.max(0, frame.step) + 1}/${n} · ` : ''}${Math.min(t, sc.duration).toFixed(2)} / ${sc.duration.toFixed(2)}s`;
  timeline.setPlayhead(t);
});
const syncPlayBtn = () => { $('btnPlay').innerHTML = player.playing ? ICON_PAUSE : ICON_PLAY; };
player.on('play', syncPlayBtn);
player.on('pause', syncPlayBtn);
player.on('end', () => { if (exporting) exporting.stop(); });
player.on('scene', syncPlayBtn);

// 播放推进时触发跨越时间点的音效；seek / 上一步 / 下一步不触发，避免跳转时噪音
function triggerSounds(from, to) {
  const list = player.scene?.sounds;
  if (!list?.length || !sound.enabled) return;
  for (const s of list) {
    if (s.at >= from && s.at < to) sound.play(s.name);
    else if (to < from && (s.at >= from || s.at < to)) sound.play(s.name); // 循环回绕
  }
}

let last = performance.now();
(function loop(now) {
  const before = player.time;
  const advanced = player.tick((now - last) / 1000);
  last = now;
  if (advanced) triggerSounds(before, player.time);
  requestAnimationFrame(loop);
})(last);

// ---------- 控件 ----------
$('btnPlay').addEventListener('click', () => { sound.ensure()?.resume(); player.toggle(); });
$('btnNext').addEventListener('click', () => player.next());
$('btnPrev').addEventListener('click', () => player.prev());
$('chkGrid').addEventListener('change', (e) => { stage.showGuide = e.target.checked; stage.render(); });
$('chkLoop').addEventListener('change', (e) => { player.loop = e.target.checked; });
$('speed').addEventListener('change', (e) => { player.speed = +e.target.value; });
const syncSound = () => {
  $('btnSound').innerHTML = sound.enabled ? ICON_SOUND_ON : ICON_SOUND_OFF;
  $('btnSound').classList.toggle('muted', !sound.enabled);
};
$('btnSound').addEventListener('click', () => { sound.enabled = !sound.enabled; syncSound(); });
syncSound();
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement.tagName;
  if (editor.focused || tag === 'SELECT' || !player.scene) return;
  if (e.code === 'Space' && tag !== 'BUTTON') { e.preventDefault(); player.toggle(); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); player.next(); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); player.prev(); }
  else if (e.code === 'KeyM' && tag !== 'BUTTON') { sound.enabled = !sound.enabled; syncSound(); }
});

// ---------- 示例：从 manifest 加载，按分类分组 ----------
const examples = new Map();
async function loadManifest() {
  const m = await (await fetch('./examples/manifest.json')).json();
  for (const ex of m.examples) examples.set(ex.id, ex); // 含隐藏分类，保证深链都能打开
  const sel = $('examples');
  sel.innerHTML = '<option value="" disabled selected>示例…</option>';
  for (const cat of m.categories.filter((c) => !c.hidden)) {
    const g = document.createElement('optgroup');
    g.label = cat.name;
    for (const ex of m.examples.filter((x) => x.category === cat.id)) {
      const o = document.createElement('option');
      o.value = ex.id;
      o.textContent = ex.name;
      g.appendChild(o);
    }
    sel.appendChild(g);
  }
  return m;
}
async function openExample(id) {
  const ex = examples.get(id);
  if (!ex) return false;
  editor.value = await (await fetch(`./examples/${ex.file}`)).text();
  baseDir = new URL(`./examples/${ex.file}`, location.href).href; // import 相对示例文件所在目录
  $('examples').value = id;
  recompile(false);
  return true;
}
$('examples').addEventListener('change', async (e) => {
  if (await openExample(e.target.value)) { player.seek(0); player.play(); }
});

// ---------- 配色模板：下拉一键套用，写回 <scene palette="…"> ----------
const paletteSel = $('palette');
(function buildPaletteMenu() {
  paletteSel.innerHTML = '<option value="" disabled>配色…</option><option value="__none__">（脚本自带 / 默认）</option>';
  for (const [label, dark] of [['浅色', false], ['深色', true]]) {
    const g = document.createElement('optgroup');
    g.label = label;
    for (const p of PALETTES.filter((x) => x.dark === dark)) {
      const o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.label;
      o.title = p.desc;
      g.appendChild(o);
    }
    paletteSel.appendChild(g);
  }
  paletteSel.value = '__none__';
})();
function syncPaletteMenu() {
  const name = getScenePalette(editor.value);
  paletteSel.value = [...paletteSel.options].some((o) => o.value === name) ? name : '__none__';
}
paletteSel.addEventListener('change', () => {
  const v = paletteSel.value;
  const next = setScenePalette(editor.value, v === '__none__' ? '' : v);
  if (next === null) { alert('找不到 <scene> 根标签'); syncPaletteMenu(); return; }
  editor.value = next;
  recompile(true);
});

// ---------- 字幕：样式 / 字号 / 位置，写回 <scene caption="…" caption-size="…"> ----------
const CAP_STYLES = [['', '字幕：默认'], ['plain', '字幕：描边'], ['bar', '字幕：底条'], ['minimal', '字幕：竖线'], ['accent', '字幕：主色'], ['classic', '字幕：深色'], ['off', '字幕：关闭']];
const CAP_SIZES = [['', '字号：中'], ['small', '字号：小'], ['large', '字号：大'], ['xlarge', '字号：特大']];
const capStyleSel = $('capStyle');
const capSizeSel = $('capSize');
const fillSel = (sel, items) => { sel.innerHTML = items.map(([v, l]) => `<option value="${v}">${l}</option>`).join(''); };
fillSel(capStyleSel, CAP_STYLES);
fillSel(capSizeSel, CAP_SIZES);
function syncCaptionMenus() {
  const cap = getSceneAttr(editor.value, 'caption').toLowerCase();
  const style = ['false', '0', 'no', 'off', 'none'].includes(cap) ? 'off' : (cap === 'soft' || cap === 'true' ? '' : cap);
  capStyleSel.value = [...capStyleSel.options].some((o) => o.value === style) ? style : '';
  const size = getSceneAttr(editor.value, 'caption-size').toLowerCase();
  capSizeSel.value = [...capSizeSel.options].some((o) => o.value === size) ? size : '';
  capSizeSel.disabled = capStyleSel.value === 'off';
}
function applyCaptionAttr(name, value) {
  const next = setSceneAttr(editor.value, name, value);
  if (next === null) { alert('找不到 <scene> 根标签'); syncCaptionMenus(); return; }
  editor.value = next;
  recompile(true);
}
capStyleSel.addEventListener('change', () => {
  const v = capStyleSel.value;
  applyCaptionAttr('caption', v === 'off' ? 'false' : v);
});
capSizeSel.addEventListener('change', () => applyCaptionAttr('caption-size', capSizeSel.value));
// ---------- 导出 ----------
$('btnPng').addEventListener('click', () => {
  stage.render();
  $('stage').toBlob((b) => b && download(b, 'codemotion.png'), 'image/png');
});

$('btnBoard').addEventListener('click', () => {
  const sheet = player.scene && renderStoryboard(player.scene);
  if (!sheet) { alert('场景里还没有 <step>，没有可导出的分镜'); return; }
  sheet.toBlob((b) => b && download(b, 'codemotion-storyboard.png'), 'image/png');
});

const btnWebm = $('btnWebm');
let offlineBusy = false;
btnWebm.addEventListener('click', async () => {
  const scene = player.scene;
  if (!scene) return;

  // 优先离线导出：WebCodecs 逐帧编码，快、精确、可带音轨
  if (webCodecsSupported()) {
    if (offlineBusy) return;
    offlineBusy = true;
    btnWebm.classList.add('busy');
    try {
      const blob = await exportWebm(scene, {
        fps: 30, scale: 1, withAudio: true,
        onProgress: (r) => { btnWebm.textContent = `离线导出 ${Math.round(r * 100)}%`; },
      });
      download(blob, 'codemotion.webm');
    } catch (err) {
      alert(err.message);
    } finally {
      offlineBusy = false;
      btnWebm.classList.remove('busy');
      btnWebm.textContent = '导出 WebM';
    }
    return;
  }

  // 降级：实时录制（旧浏览器）
  if (exporting) { exporting.stop(); return; }
  let rec;
  const unlock = stage.lock(2);
  try { rec = startWebmRecording($('stage')); } catch (err) { unlock(); alert(err.message); return; }
  const prev = { speed: player.speed, loop: player.loop };
  player.speed = 1;
  player.loop = false;
  player.seek(0);
  player.play();
  exporting = rec;
  btnWebm.classList.add('busy');
  btnWebm.textContent = '录制中… 点击停止';
  const blob = await rec.done;
  download(blob, 'codemotion.webm');
  exporting = null;
  player.pause();
  Object.assign(player, prev);
  unlock();
  btnWebm.classList.remove('busy');
  btnWebm.textContent = '导出 WebM';
});

// ---------- 分享 ----------
const btnShare = $('btnShare');
btnShare.addEventListener('click', async () => {
  const params = new URLSearchParams();
  params.set('code', encodeShare(editor.value));
  const step = player.stepIndex;
  if (step >= 0) params.set('step', String(step + 1));
  const url = `${location.origin}${location.pathname}#${params.toString()}`;
  try {
    await navigator.clipboard.writeText(url);
    btnShare.textContent = '已复制';
    setTimeout(() => { btnShare.textContent = '分享'; }, 1600);
  } catch {
    window.prompt('复制分享链接（Ctrl+C）：', url);
  }
});

// ---------- 场景管理 / 导入导出 ----------
$('projects').addEventListener('change', () => {
  const v = $('projects').value;
  if (v === '__new__') newProject();
  else if (v === '__del__') deleteProject();
  else switchProject(v);
});
$('btnExport').addEventListener('click', () => {
  persistCurrent();
  const name = (currentProject()?.name || 'scene').replace(/[\\/:*?"<>|]/g, '_') + '.xml';
  download(new Blob([editor.value], { type: 'application/xml;charset=utf-8' }), name);
});
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.xml,text/xml,application/xml';
$('btnImport').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const text = await f.text();
  const name = f.name.replace(/\.xml$/i, '');
  if (!editor.value.trim()) currentProject().name = name; // 空场景直接落当前
  else {
    const p = { id: 'p' + Date.now(), name, src: text, updatedAt: Date.now() };
    projects.push(p);
    currentId = p.id;
    try { localStorage.setItem(CURRENT_KEY, p.id); } catch { /* ignore */ }
    saveProjects();
  }
  editor.value = text;
  recompile(false);
  renderProjects();
  fileInput.value = '';
});

// ---------- WYSIWYG：点选 + 属性面板 ----------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fmtNum = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));
const cssHex = (c) => '#' + c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');

/** 在 XML 源里定位 id="xxx" 的标签并改写属性；找不到（模板/循环生成）返回 null */
function setEntityAttr(src, id, attr, value) {
  const m = new RegExp(`id="${escapeRe(id)}"`).exec(src);
  if (!m) return null;
  const tagStart = src.lastIndexOf('<', m.index);
  const tagEnd = src.indexOf('>', m.index);
  if (tagStart < 0 || tagEnd < 0) return null;
  const tag = src.slice(tagStart, tagEnd + 1);
  const attrRe = new RegExp(`(${attr}=")[^"]*(")`);
  let newTag;
  if (attrRe.test(tag)) newTag = tag.replace(attrRe, `$1${value}$2`);
  else {
    const selfClose = tag.endsWith('/>');
    const at = tag.length - (selfClose ? 2 : 1);
    newTag = tag.slice(0, at) + ` ${attr}="${value}"` + tag.slice(at);
  }
  return src.slice(0, tagStart) + newTag + src.slice(tagEnd + 1);
}

let selectedEntity = null;
const hasExplicitId = (id) => new RegExp(`id="${escapeRe(id)}"`).test(editor.value);

function addField(body, label, value, editable, onCommit) {
  const row = document.createElement('div');
  row.className = 'insp-field';
  const lab = document.createElement('label');
  lab.textContent = label;
  const input = document.createElement('input');
  input.value = value;
  if (!editable) input.readOnly = true;
  input.addEventListener('change', () => onCommit(input.value));
  row.append(lab, input);
  body.appendChild(row);
}

async function commitAttr(e, attr, value) {
  const next = setEntityAttr(editor.value, e.id, attr, value);
  if (next == null) { alert('无法写回：该对象由模板/循环生成，请在代码里修改'); return; }
  editor.value = next;
  await recompile(false);
  // scene 已重建，引用失效，按 id 重新选中
  const ent = player.scene?.byId.get(e.id) || null;
  selectedEntity = ent;
  stage.selection = ent;
  renderInspector();
}

function renderInspector() {
  const box = $('inspector');
  const e = selectedEntity;
  if (!e) { box.hidden = true; return; }
  box.hidden = false;
  $('inspTitle').textContent = `${e.id} · ${e.type}`;
  const body = $('inspBody');
  body.innerHTML = '';
  const sc = player.scene;
  const cell = [(e.init.x - sc.ax) / sc.cw + 0.5, (e.init.y - sc.ay) / sc.ch + 0.5];
  const editable = hasExplicitId(e.id);
  addField(body, '位置', `${fmtNum(cell[0])},${fmtNum(cell[1])}`, editable, (v) => commitAttr(e, 'at', v));
  addField(body, '颜色', cssHex(e.init.fill), editable, (v) => commitAttr(e, 'fill', v));
  if (e.type === 'text') addField(body, '字号', fmtNum(e.init.size), editable, (v) => commitAttr(e, 'size', v));
  else addField(body, '尺寸', fmtNum(e.init.size), editable, (v) => commitAttr(e, 'size', v));
  if (e.type === 'text') addField(body, '文字', e.init.text, editable, (v) => commitAttr(e, 'text', v));
  if (!editable) {
    const hint = document.createElement('p');
    hint.className = 'insp-hint';
    hint.textContent = '该对象由模板/循环生成，请在代码里修改。';
    body.appendChild(hint);
  }
}

function selectEntity(ent) {
  selectedEntity = ent;
  stage.selection = ent;
  stage.render();
  renderInspector();
}

stage.canvas.addEventListener('click', (ev) => {
  if (!player.scene) return;
  const rect = stage.canvas.getBoundingClientRect();
  const sx = ((ev.clientX - rect.left) / rect.width) * player.scene.width;
  const sy = ((ev.clientY - rect.top) / rect.height) * player.scene.height;
  selectEntity(stage.pick(sx, sy) || null);
});
$('inspClose').addEventListener('click', () => selectEntity(null));

// ---------- 素材 ----------
const ASSET_GROUPS = [
  ['动物', '🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🦆🦉🐴🦄🐝🐞🦋🐢🐍🐬🐳🐙🦀'],
  ['水果', '🍎🍊🍋🍌🍉🍇🍓🍒🍑🥭🍍🥥🥝'],
  ['表情', '😀😃😄😁😆😅😂🤣😊😍🥰😘😎🤔😴😮😲😭😡👍👎👏🙌💪'],
  ['符号', '✅❌⭐✨🔥💡🎯🏆🎨🚀🌍❤️💚💙💛🎵🎶'],
  ['天气', '☀️🌤️☁️🌧️❄️🌈⚡'],
  ['交通', '🚗🚕🚌🚲✈️🚢'],
];
const graphemes = (s) => (typeof Intl.Segmenter === 'function'
  ? [...new Intl.Segmenter().segment(s)].map((x) => x.segment)
  : [...s]);
$('assetsBody').innerHTML = ASSET_GROUPS.map(([name, chars]) =>
  `<div class="assets-group"><h4>${name}</h4><div class="assets-grid">${graphemes(chars).map((c) => `<button>${c}</button>`).join('')}</div></div>`).join('');
$('assetsBody').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  editor.insert(`<icon at="2,2" text="${btn.textContent}" size=".5c"/>\n`);
  $('assets').close();
});
$('btnAssets').addEventListener('click', () => $('assets').showModal());

// ---------- 启动 ----------
(async () => {
  await loadManifest();
  loadProjects();
  renderProjects();
  if (hash.has('code')) { editor.value = decodeShare(hash.get('code')); recompile(false); }
  else if (hash.has('ex') && (await openExample(hash.get('ex')))) { /* 已打开 */ }
  else if (currentProject()?.src?.trim()) { editor.value = currentProject().src; recompile(false); }
  else await openExample('gomoku');

  if (hash.get('grid') === '1') { stage.showGuide = true; $('chkGrid').checked = true; }
  if (hash.has('step')) player.goStep((parseInt(hash.get('step'), 10) || 1) - 1);
  else if (hash.has('t')) { player.seek(Math.max(0, parseFloat(hash.get('t')) || 0)); player.pause(); }
  else if (!hash.has('pause')) player.play();
})();
