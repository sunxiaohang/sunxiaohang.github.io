import { highlightLines } from './highlight.js';

const LH = 21;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 代码编辑器：<textarea> 负责输入，下面叠一层高亮 <div>。
 * 只处理文本、高亮、行标记与跳转；编译与预览由外部通过 onChange 接入。
 */
export class CodeEditor {
  constructor({ textarea, highlight, gutter, onChange, onRun, debounce = 220 }) {
    this.ta = textarea;
    this.hl = highlight;
    this.gutter = gutter;
    this.marks = new Map();
    this.known = { ids: new Set(), defs: new Set() };
    this.onChange = onChange;
    this.onRun = onRun;
    this._timer = 0;

    this.ta.addEventListener('scroll', () => this.syncScroll());
    this.ta.addEventListener('input', () => {
      this.refresh();
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.onChange?.(this.value), debounce);
    });
    this.ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.ta.setRangeText('  ', this.ta.selectionStart, this.ta.selectionEnd, 'end');
        this.ta.dispatchEvent(new Event('input'));
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.onRun?.(this.value);
      }
    });
  }

  get value() { return this.ta.value; }
  set value(v) { this.ta.value = v; this.refresh(); }
  get focused() { return document.activeElement === this.ta; }

  /** 在光标处插入文本（素材面板等使用），插入后触发一次 onChange */
  insert(text) {
    this.ta.setRangeText(text, this.ta.selectionStart, this.ta.selectionEnd, 'end');
    this.refresh();
    this.onChange?.(this.value);
  }

  /** diagnostics: [{line, severity}]；known: {ids, defs} 用于给用户自己的 id 上色 */
  setDiagnostics(diags, known) {
    this.marks = new Map();
    for (const d of diags) {
      if (!d.line) continue;
      if (d.severity === 'error' || !this.marks.has(d.line)) this.marks.set(d.line, d.severity === 'error' ? 'err' : 'warn');
    }
    if (known) this.known = known;
    this.refresh();
  }

  refresh() {
    const lines = highlightLines(this.ta.value, this.known);
    this.hl.innerHTML = lines.map((h, i) => `<div class="ln ${this.marks.get(i + 1) || ''}">${h || ' '}</div>`).join('');
    this.gutter.innerHTML = lines.map((_, i) => `<div class="gl ${this.marks.get(i + 1) || ''}">${i + 1}</div>`).join('');
    this.syncScroll();
  }

  syncScroll() {
    this.hl.style.transform = `translate(${-this.ta.scrollLeft}px,${-this.ta.scrollTop}px)`;
    this.gutter.style.transform = `translateY(${-this.ta.scrollTop}px)`;
  }

  goto(line, col = 1) {
    const lines = this.ta.value.split('\n');
    let off = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) off += lines[i].length + 1;
    this.ta.focus();
    const at = off + Math.max(0, col - 1);
    this.ta.setSelectionRange(at, at);
    this.ta.scrollTop = Math.max(0, (line - 4) * LH);
  }
}

/** 控制台：把诊断渲染成可点击的列表 */
export class Console {
  constructor({ el, status, onJump }) {
    this.el = el;
    this.status = status;
    el.addEventListener('click', (e) => {
      const row = e.target.closest('.row[data-line]');
      if (row && +row.dataset.line) onJump?.(+row.dataset.line, +row.dataset.col);
    });
  }

  render({ scene, diagnostics }) {
    const errs = diagnostics.filter((d) => d.severity === 'error');
    let html = '';
    if (scene && !errs.length) {
      const n = scene.entities.filter((e) => e.type !== 'layer' && !e.internal).length;
      html += `<div class="row ok">✓ ${n} 个对象 · ${scene.steps.length} 步 · ${scene.duration.toFixed(2)}s</div>`;
      this.status.className = 'status ok';
      this.status.textContent = `${scene.width}×${scene.height} · ${scene.cols}×${scene.rows} 格`;
    } else {
      this.status.className = 'status err';
      this.status.textContent = scene ? `${errs.length} 个错误（已跳过出错的节点）` : '语法错误（预览保持上一个有效版本）';
    }
    for (const d of diagnostics) {
      const e = d.severity === 'error';
      html += `<div class="row ${e ? 'e' : 'w'}" data-line="${d.line}" data-col="${d.col}">
        <span class="badge">${e ? '错误' : '提示'} ${d.line ? `${d.line}:${d.col}` : ''}</span>
        <span>${esc(d.message)}${d.hint ? ` <span class="hint">— ${esc(d.hint)}</span>` : ''}</span></div>`;
    }
    this.el.innerHTML = html;
  }
}
