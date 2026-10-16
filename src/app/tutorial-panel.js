import { LESSONS, MINIMAL, applyStep, checkStep } from '../editor/tutorial-content.js';
import { highlightLines } from '../editor/highlight.js';

/**
 * 编辑器左侧的「教程栏」：选一关 → 一步步跟着做。
 * 每一步可以「插入代码」（一键写进编辑器）或者自己照着敲；写对了会自动打勾，进入下一步。
 * 进度存在 localStorage，刷新不丢。本模块只管界面；内容与判断都在 editor/tutorial-content.js。
 */

const KEY = 'codemotion.tutorial.v1';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const codeHtml = (src) => highlightLines(src).map((h) => `<div class="ln">${h || ' '}</div>`).join('');

function load() {
  const base = { open: true, view: 'list', lesson: LESSONS[0].id, done: {}, step: {} };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    const lesson = LESSONS.some((l) => l.id === v.lesson) ? v.lesson : base.lesson;
    return {
      open: v.open !== false,
      // 刷新后回到刚才做到的那一关那一步，而不是退回课程列表
      view: v.view === 'lesson' ? 'lesson' : 'list',
      lesson,
      done: v.done && typeof v.done === 'object' ? v.done : {},
      step: v.step && typeof v.step === 'object' ? v.step : {},
    };
  } catch { return base; }
}
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 隐私模式 */ } };

/**
 * @param {object} o
 * @param {HTMLElement} o.root 面板容器（<aside>）
 * @param {() => string} o.getSource 当前编辑器内容
 * @param {(src: string) => void} o.setSource 写回编辑器并触发编译
 * @param {() => ({scene: any, diagnostics: any[]} | null)} o.getCompiled 最近一次编译结果
 */
export function mountTutorial({ root, getSource, setSource, getCompiled }) {
  const st = load();
  const lessonOf = (id) => LESSONS.find((l) => l.id === id) || LESSONS[0];
  const stepIdx = () => Math.min(Math.max(0, st.step[st.lesson] || 0), lessonOf(st.lesson).steps.length - 1);
  const isDone = (lid, i) => !!st.done[`${lid}:${i}`];
  const lessonDone = (l) => l.steps.every((_, i) => isDone(l.id, i));

  root.innerHTML = `
    <div class="tut-head">
      <b>上手教程</b>
      <button class="tut-x" type="button" data-act="close" title="收起教程栏" aria-label="收起教程栏">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
    </div>
    <div class="tut-body" id="tutBody"></div>`;
  const body = root.querySelector('#tutBody');

  function setOpen(v) {
    st.open = v;
    save(st);
    document.body.classList.toggle('tut-open', v);
    document.getElementById('btnTutorial')?.setAttribute('aria-pressed', String(v));
  }

  function renderList() {
    body.innerHTML = `
      <p class="tut-intro">跟着做三个小项目，每一步都能直接插入代码，也可以自己照着敲。写对了会自动打勾。</p>
      <div class="tut-lessons">${LESSONS.map((l) => {
        const n = l.steps.filter((_, i) => isDone(l.id, i)).length;
        return `<button class="tut-lesson${lessonDone(l) ? ' done' : ''}" type="button" data-lesson="${l.id}">
          <span class="tut-tag">${esc(l.level)}</span>
          <b>${esc(l.name)}</b>
          <span class="tut-goal">${esc(l.goal)}</span>
          <span class="tut-prog"><i style="width:${(n / l.steps.length) * 100}%"></i></span>
          <span class="tut-count">${lessonDone(l) ? '已完成' : `${n} / ${l.steps.length} 步`}</span>
        </button>`;
      }).join('')}</div>
      <div class="tut-foot"><a href="docs.html#sec-recipes" target="_blank" rel="noopener">更多配方 →</a><a href="works.html" target="_blank" rel="noopener">看看别人做的 →</a></div>`;
  }

  function renderLesson() {
    const l = lessonOf(st.lesson), i = stepIdx(), s = l.steps[i];
    const c = getCompiled();
    const res = checkStep(s, { src: getSource(), scene: c?.scene || null, diagnostics: c?.diagnostics || [] });
    const hasErr = !!c?.diagnostics?.some((d) => d.severity === 'error');
    const manual = s.mode === 'edit';
    body.innerHTML = `
      <button class="tut-back" type="button" data-act="list">← 全部教程</button>
      <div class="tut-title"><span class="tut-tag">${esc(l.level)}</span><h3>${esc(l.name)}</h3></div>
      <div class="tut-dots" role="tablist" aria-label="步骤">${l.steps.map((x, k) =>
        `<button type="button" role="tab" data-go="${k}" class="${k === i ? 'cur' : ''}${isDone(l.id, k) ? ' ok' : ''}" aria-selected="${k === i}" title="${esc(x.title)}">${isDone(l.id, k) ? '✓' : k + 1}</button>`).join('')}</div>
      <div class="tut-step">
        <div class="tut-stepno">第 ${i + 1} 步 · 共 ${l.steps.length} 步</div>
        <h4>${esc(s.title)}</h4>
        <p class="tut-why">${esc(s.why)}</p>
        ${manual ? `<div class="tut-edit">在 <code>&lt;scene&gt;</code> 标签上，把 <code>palette</code> 换成别的配色名。</div>` : `
        <div class="tut-code"><div class="tut-code-bar"><span>${s.mode === 'replace' ? '整段替换' : '追加到场景末尾'}</span><button type="button" data-act="copy" title="复制这段代码">复制</button></div><pre>${codeHtml(s.snippet)}</pre></div>`}
        <div class="tut-actions">
          <button class="tut-btn primary" type="button" data-act="apply">${manual ? '帮我改' : s.mode === 'replace' ? '替换成这个' : '插入代码'}</button>
          <button class="tut-btn" type="button" data-act="recheck">我自己写好了</button>
        </div>
        <ul class="tut-check">${[...res.done.map((t) => `<li class="ok">${esc(t)}</li>`), ...res.todo.map((t) => `<li>${esc(t)}</li>`)].join('')}</ul>
        ${hasErr ? '<div class="tut-warn">脚本里有错误，先看看下面的控制台提示；改好后教程会继续判断。</div>' : ''}
        ${res.ok ? `<div class="tut-pass">做到了！<button type="button" class="tut-btn primary" data-act="next">${i < l.steps.length - 1 ? '下一步 →' : '完成这一关'}</button></div>` : ''}
      </div>`;
  }

  function render() {
    if (st.view === 'lesson') renderLesson(); else renderList();
  }

  function mark(i, v = true) {
    const key = `${st.lesson}:${i}`;
    if (v) st.done[key] = 1; else delete st.done[key];
    save(st);
  }

  /** 编辑器内容变化后调用：重新判断当前步骤，做到了就打勾（但不会自动跳走，让用户先看到结果） */
  function refresh() {
    if (st.view !== 'lesson') return;
    const l = lessonOf(st.lesson), i = stepIdx();
    const c = getCompiled();
    const res = checkStep(l.steps[i], { src: getSource(), scene: c?.scene || null, diagnostics: c?.diagnostics || [] });
    if (res.ok && !isDone(l.id, i)) mark(i);
    renderLesson();
  }

  root.addEventListener('click', async (e) => {
    const lessonBtn = e.target.closest('[data-lesson]');
    if (lessonBtn) {
      st.lesson = lessonBtn.dataset.lesson;
      st.view = 'lesson';
      // 首次进入某关：做完的关从头回看；没做完的接着上次的进度
      if (lessonDone(lessonOf(st.lesson))) st.step[st.lesson] = 0;
      save(st);
      render();
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) { st.step[st.lesson] = Number(go.dataset.go); save(st); renderLesson(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const l = lessonOf(st.lesson), i = stepIdx(), s = l.steps[i];

    if (act === 'close') setOpen(false);
    else if (act === 'list') { st.view = 'list'; save(st); render(); }
    else if (act === 'copy') {
      try { await navigator.clipboard.writeText(s.snippet); flash(e.target.closest('[data-act]'), '已复制'); }
      catch { flash(e.target.closest('[data-act]'), '请手动选中复制'); }
    } else if (act === 'apply') {
      const cur = getSource();
      // 第一步是整段替换；如果用户已有内容，先确认再覆盖，避免误删
      if (s.mode === 'replace' && cur.trim() && cur.trim() !== MINIMAL.trim() && !confirm('这会替换编辑器里现在的全部内容。要继续吗？\n（你的其他场景不受影响，也可以先在左上角「＋ 新建场景」）')) return;
      const next = applyStep(s.mode === 'replace' ? '' : cur, s);
      if (next === null) { alert('当前脚本不完整（缺少 </scene>），没法自动插入。\n可以先点第一步的「替换成这个」重新开始，或者手动补上 </scene>。'); return; }
      setSource(next);
      // 编译是异步的：稍等一下再判断是否达成
      setTimeout(refresh, 450);
    } else if (act === 'recheck') {
      refresh();
      const c = getCompiled();
      const res = checkStep(s, { src: getSource(), scene: c?.scene || null, diagnostics: c?.diagnostics || [] });
      if (!res.ok) flash(e.target.closest('[data-act]'), '还差一点，看下面的清单');
    } else if (act === 'next') {
      if (i < l.steps.length - 1) { st.step[st.lesson] = i + 1; save(st); renderLesson(); }
      else { st.view = 'list'; save(st); render(); }
    }
  });

  function flash(btn, text) {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = old; }, 1400);
  }

  document.body.classList.toggle('tut-open', st.open);
  document.getElementById('btnTutorial')?.setAttribute('aria-pressed', String(st.open));
  render();

  return { refresh, open: () => setOpen(true), close: () => setOpen(false), toggle: () => setOpen(!st.open), isOpen: () => st.open };
}
