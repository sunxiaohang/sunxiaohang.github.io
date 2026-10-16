/**
 * 零依赖 Web Audio 合成器：为动画 / 教程提供轻量音效，无需任何音频文件。
 * 每个音色用一个 (ctx, t) => void 函数合成；浏览器里按需懒建 AudioContext。
 * Node（无头渲染 / 测试）环境下 SoundEngine 自动退化为空操作，不影响编译与导出。
 */

import { SOUND_NAMES } from '../core/lang/schema.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** 起一个振荡器并包络到 destination */
function tone(ctx, { type = 'sine', from, to, t, dur, peak = 0.4, attack = 0.008 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, from), t);
  if (to && to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** 低频振荡（LFO）叠加在主频上，用于"摆动"类音色 */
function wobble(ctx, t, base, depth, rate, dur, peak, type = 'sine') {
  const o = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(base, t);
  lfo.frequency.setValueAtTime(rate, t);
  lfoGain.gain.setValueAtTime(depth, t);
  lfo.connect(lfoGain).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.03);
  lfo.stop(t + dur + 0.03);
}

export const PRESETS = {
  // 登场 / 弹跳：圆润的"啵"
  pop: (ctx, t) => tone(ctx, { type: 'sine', from: 560, to: 180, t, dur: 0.13, peak: 0.5 }),
  // 步进 / 点击：清脆短促
  tick: (ctx, t) => tone(ctx, { type: 'square', from: 1100, to: 900, t, dur: 0.045, peak: 0.22 }),
  // 提示 / 完成：双音铃
  ding: (ctx, t) => {
    tone(ctx, { type: 'sine', from: 880, t, dur: 0.5, peak: 0.35, attack: 0.004 });
    tone(ctx, { type: 'sine', from: 1318.5, t, dur: 0.4, peak: 0.18, attack: 0.004 });
  },
  // 命中 / 强调：高频短促
  snap: (ctx, t) => tone(ctx, { type: 'triangle', from: 2100, to: 900, t, dur: 0.06, peak: 0.3 }),
  // 移动 / 跳跃：上滑再回落
  whoosh: (ctx, t) => tone(ctx, { type: 'sine', from: 320, to: 820, t, dur: 0.22, peak: 0.26 }),
  // 脉冲 / 摆动：频率抖动的"咕噜"
  wobble: (ctx, t) => wobble(ctx, t, 320, 90, 18, 0.28, 0.32),
  // 胜利 / 收尾：C-E-G-C 上行琶音
  success: (ctx, t) => {
    [60, 64, 67, 72].forEach((n, i) =>
      tone(ctx, { type: 'triangle', from: midi(n), t: t + i * 0.09, dur: 0.34, peak: 0.3, attack: 0.006 }));
  },
  // 回弹 / 弹簧：上升再弹回
  spring: (ctx, t) => tone(ctx, { type: 'sine', from: 220, to: 980, t, dur: 0.16, peak: 0.34 }),
};

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.buffers = new Map();   // src → AudioBuffer（解码缓存）
    this.playing = new Map();   // src → { source, gain }，用于停止 BGM
  }

  ensure() {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === 'undefined') return null;
    this.ctx = new AudioContext();
    return this.ctx;
  }

  /** 播放一个预设音色；不存在的名字回退到 pop */
  play(name) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const fn = PRESETS[name] || PRESETS.pop;
    fn(ctx, ctx.currentTime);
  }

  /**
   * 加载并缓存一段外部音频。data 为 ArrayBuffer（编译时预加载），或 fetchUrl(src) 懒加载。
   * 返回 Promise<AudioBuffer|null>；无 AudioContext（Node）时返回 null。
   */
  async loadAudio(src, data, fetchUrl) {
    const ctx = this.ensure();
    if (!ctx) return null;
    if (this.buffers.has(src)) return this.buffers.get(src);
    try {
      const bytes = data || (fetchUrl ? await (await fetch(fetchUrl)).arrayBuffer() : null);
      if (!bytes) return null;
      const buf = await ctx.decodeAudioData(bytes.slice(0));
      this.buffers.set(src, buf);
      return buf;
    } catch { return null; }
  }

  /** 播放一段外部音频（已 loadAudio 缓存）。cue: { src, volume, loop, fadein, fadeout } */
  playAudio(cue) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    const buf = ctx && this.buffers.get(cue.src);
    if (!buf) return;
    if (ctx.state === 'suspended') ctx.resume();
    this.stopAudio(cue.src);
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = !!cue.loop;
    const gain = ctx.createGain();
    const t = ctx.currentTime, vol = cue.volume ?? 1;
    if (cue.fadein > 0) { gain.gain.setValueAtTime(0.0001, t); gain.gain.linearRampToValueAtTime(vol, t + cue.fadein); }
    else gain.gain.setValueAtTime(vol, t);
    source.connect(gain).connect(ctx.destination);
    source.start(t);
    this.playing.set(cue.src, { source, gain });
  }

  stopAudio(src) {
    const p = this.playing.get(src);
    if (p) { try { p.source.stop(); } catch { /* 已停止 */ } this.playing.delete(src); }
  }

  /** 停止所有外部音频（seek / 切场景 / 暂停时调用） */
  stopAllAudio() {
    for (const src of [...this.playing.keys()]) this.stopAudio(src);
  }
}
