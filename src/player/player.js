import { clamp } from '../core/util/ease.js';

/**
 * 动画控制器：只管"现在是几秒"，不碰 DOM / Canvas。
 * 状态：time / playing / speed / loop；事件：frame、play、pause、end、scene。
 * 用 tick(dtSeconds) 推进，宿主（requestAnimationFrame 或测试）负责调用。
 */
export class Player {
  constructor(scene = null) {
    this.scene = scene;
    this.time = 0;
    this.playing = false;
    this.speed = 1;
    this.loop = true;
    this._on = new Map();
  }

  on(type, fn) {
    if (!this._on.has(type)) this._on.set(type, new Set());
    this._on.get(type).add(fn);
    return () => this._on.get(type).delete(fn);
  }

  emit(type, data) {
    for (const fn of this._on.get(type) ?? []) fn(data, this);
  }

  get duration() { return this.scene ? this.scene.duration : 0; }
  get steps() { return this.scene ? this.scene.steps : []; }

  setScene(scene, { keepTime = true } = {}) {
    this.scene = scene;
    this.time = keepTime ? clamp(this.time, 0, this.duration) : 0;
    this.emit('scene', scene);
    this.emit('frame', this.time);
  }

  seek(t) {
    this.time = clamp(t, 0, this.duration);
    this.emit('frame', this.time);
  }

  play() {
    if (!this.scene) return;
    if (this.time >= this.duration - 0.01) this.time = 0;
    if (!this.playing) { this.playing = true; this.emit('play'); }
  }

  pause() {
    if (this.playing) { this.playing = false; this.emit('pause'); }
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  /** 推进 dt 秒；循环模式回绕，否则停在结尾并触发 end */
  tick(dt) {
    if (!this.scene || !this.playing) return false;
    this.time += Math.min(dt, 0.1) * this.speed;
    if (this.time >= this.duration) {
      if (this.loop) this.time %= Math.max(this.duration, 1e-6);
      else { this.time = this.duration; this.playing = false; this.emit('pause'); this.emit('end'); }
    }
    this.emit('frame', this.time);
    return true;
  }

  // ---------- 步骤导航：跳到某一步"结束时的静帧" ----------
  /** 当前所处的步骤序号；还没进入任何步骤时为 -1 */
  get stepIndex() {
    let cur = -1;
    for (let i = 0; i < this.steps.length; i++) {
      if (this.steps[i].t0 <= this.time) cur = i;
      else break;
    }
    return cur;
  }

  goStep(i) {
    if (!this.steps.length) return;
    this.pause();
    this.seek(this.steps[clamp(i, 0, this.steps.length - 1)].freeze);
  }

  next() {
    const cur = this.stepIndex;
    if (cur < 0) return this.goStep(0);
    // 当前步还没播完：先跳到它的静帧；已经在静帧上：进入下一步
    this.goStep(this.time < this.steps[cur].freeze - 0.02 ? cur : cur + 1);
  }

  prev() {
    const cur = this.stepIndex;
    if (cur <= 0) { this.pause(); this.seek(0); return; }
    this.goStep(cur - 1);
  }
}

/** 按时间均匀采样的帧序列：导出 GIF/视频/测试都用它 */
export function* frameTimes(duration, fps) {
  const n = Math.max(1, Math.round(duration * fps));
  for (let i = 0; i <= n; i++) yield Math.min(duration, i / fps);
}
