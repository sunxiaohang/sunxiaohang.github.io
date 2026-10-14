import { clamp } from '../core/util/ease.js';

const MAX_LANES = 40;

/** 时间轴视图：标尺、步骤条、每个对象一条泳道；拖动即 seek */
export class TimelineView {
  constructor({ root, ruler, stepTrack, rows, playhead, onScrubStart, onScrub, onScrubEnd }) {
    Object.assign(this, { root, ruler, stepTrack, rows, playhead });
    this.scene = null;
    this._scrubbing = false;
    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.lane-name') || !this.scene) return;
      this._scrubbing = true;
      root.setPointerCapture(e.pointerId);
      onScrubStart?.();
      onScrub?.(this._timeAt(e));
    });
    root.addEventListener('pointermove', (e) => { if (this._scrubbing) onScrub?.(this._timeAt(e)); });
    root.addEventListener('pointerup', () => {
      if (!this._scrubbing) return;
      this._scrubbing = false;
      onScrubEnd?.();
    });
  }

  _timeAt(ev) {
    const r = this.playhead.parentElement.getBoundingClientRect();
    return clamp((ev.clientX - r.left) / r.width) * this.scene.duration;
  }

  setPlayhead(t) {
    if (this.scene) this.playhead.style.left = `${(Math.min(t, this.scene.duration) / this.scene.duration) * 100}%`;
  }

  build(scene) {
    this.scene = scene;
    const total = scene.duration;
    const pct = (t) => `${(t / total) * 100}%`;

    this.ruler.innerHTML = '';
    const step = total > 60 ? 10 : total > 20 ? 5 : total > 8 ? 2 : 1;
    for (let s = 0; s <= total; s += step) {
      const t = document.createElement('div');
      t.className = 'tick';
      t.style.left = pct(s);
      t.textContent = `${s}s`;
      this.ruler.appendChild(t);
    }

    this.stepTrack.innerHTML = '';
    for (const s of scene.steps) {
      const b = document.createElement('div');
      b.className = `stepblk${s.index % 2 ? ' odd' : ''}`;
      b.style.left = pct(s.t0);
      b.style.width = `calc(${((s.t2 - s.t0) / total) * 100}% - 2px)`;
      b.textContent = s.index + 1;
      b.title = s.say ? `第 ${s.index + 1} 步：${s.say}` : `第 ${s.index + 1} 步`;
      this.stepTrack.appendChild(b);
    }

    this.rows.innerHTML = '';
    const ents = scene.entities.filter((e) => e.type !== 'layer' && !e.internal);
    // 按对象建索引，避免 O(对象数 × 片段数) 的重复扫描
    const byEnt = new Map();
    for (const s of scene.segments) {
      if (s.kind === 'discrete') continue;
      if (!byEnt.has(s.ent)) byEnt.set(s.ent, []);
      byEnt.get(s.ent).push(s);
    }
    for (const e of ents.slice(0, MAX_LANES)) {
      const row = document.createElement('div');
      row.className = 'lane';
      const name = document.createElement('div');
      name.className = 'lane-name';
      name.textContent = e.id;
      name.title = `<${e.type} id="${e.id}">`;
      const track = document.createElement('div');
      track.className = 'lane-track';
      for (const s of byEnt.get(e.index) ?? []) {
        const b = document.createElement('div');
        b.className = `bar ${s.kind}`;
        b.style.left = pct(s.t0);
        b.style.width = `${Math.max(0.35, (s.dur / total) * 100)}%`;
        b.title = `${s.tag}  ${s.t0.toFixed(2)}s → ${(s.t0 + s.dur).toFixed(2)}s`;
        track.appendChild(b);
      }
      row.append(name, track);
      this.rows.appendChild(row);
    }
    if (ents.length > MAX_LANES) {
      const more = document.createElement('div');
      more.className = 'lane-more';
      more.textContent = `… 另有 ${ents.length - MAX_LANES} 个对象`;
      this.rows.appendChild(more);
    }
  }
}
