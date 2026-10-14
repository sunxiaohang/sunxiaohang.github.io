import { compile, lint, schema } from '../core/index.js';
import { SoundEngine } from '../audio/sound.js';
import { Player } from '../player/player.js';
import { renderStoryboard } from '../export/storyboard.js';
import { startWebmRecording, download } from '../export/webm.js';
import { CodeEditor, Console } from '../editor/code-editor.js';
import { buildDocs } from '../editor/docs.js';
import { StageView } from './stage-view.js';
import { TimelineView } from './timeline-view.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'gridmotion.src.v4';
const hash = new URLSearchParams(location.hash.slice(1));

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

// ---------- 编译：脚本 → 场景 → 各视图 ----------
function recompile(keepTime) {
  const src = editor.value;
  try { localStorage.setItem(STORAGE_KEY, src); } catch { /* 隐私模式等：忽略 */ }
  const res = compile(src);
  const diagnostics = [...res.diagnostics, ...(res.scene ? lint(res.scene) : [])];
  const known = res.scene ? { ids: new Set(res.scene.entities.map((e) => e.id)), defs: new Set(res.scene.defNames) } : undefined;
  editor.setDiagnostics(diagnostics, known);
  con.render({ scene: res.scene, diagnostics });
  if (!res.scene) return;
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
  const sel = $('examples');
  sel.innerHTML = '<option value="" disabled selected>示例…</option>';
  for (const cat of m.categories) {
    const g = document.createElement('optgroup');
    g.label = cat.name;
    for (const ex of m.examples.filter((x) => x.category === cat.id)) {
      const o = document.createElement('option');
      o.value = ex.id;
      o.textContent = ex.name;
      g.appendChild(o);
      examples.set(ex.id, ex);
    }
    sel.appendChild(g);
  }
  return m;
}
async function openExample(id) {
  const ex = examples.get(id);
  if (!ex) return false;
  editor.value = await (await fetch(`./examples/${ex.file}`)).text();
  $('examples').value = id;
  recompile(false);
  return true;
}
$('examples').addEventListener('change', async (e) => {
  if (await openExample(e.target.value)) { player.seek(0); player.play(); }
});

// ---------- 导出 ----------
$('btnPng').addEventListener('click', () => {
  stage.render();
  $('stage').toBlob((b) => b && download(b, 'gridmotion.png'), 'image/png');
});

$('btnBoard').addEventListener('click', () => {
  const sheet = player.scene && renderStoryboard(player.scene);
  if (!sheet) { alert('场景里还没有 <step>，没有可导出的分镜'); return; }
  sheet.toBlob((b) => b && download(b, 'gridmotion-storyboard.png'), 'image/png');
});

const btnWebm = $('btnWebm');
btnWebm.addEventListener('click', async () => {
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
  download(blob, 'gridmotion.webm');
  exporting = null;
  player.pause();
  Object.assign(player, prev);
  unlock();
  btnWebm.classList.remove('busy');
  btnWebm.textContent = '导出 WebM';
});

// ---------- 文档 ----------
$('docsBody').innerHTML = buildDocs(schema());
$('btnDocs').addEventListener('click', () => $('docs').showModal());

// ---------- 启动 ----------
(async () => {
  await loadManifest();
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
  if (hash.has('code')) { editor.value = hash.get('code'); recompile(false); }
  else if (hash.has('ex') && (await openExample(hash.get('ex')))) { /* 已打开 */ }
  else if (saved) { editor.value = saved; recompile(false); }
  else await openExample('gomoku');

  if (hash.get('grid') === '1') { stage.showGuide = true; $('chkGrid').checked = true; }
  if (hash.has('step')) player.goStep((parseInt(hash.get('step'), 10) || 1) - 1);
  else if (hash.has('t')) { player.seek(Math.max(0, parseFloat(hash.get('t')) || 0)); player.pause(); }
  else if (!hash.has('pause')) player.play();
})();
