import { compileWithImports } from '../core/index.js';
import { evaluate } from '../core/runtime/evaluate.js';
import { draw } from '../render/canvas2d.js';
import { Player } from '../player/player.js';

/** 站点各页共用：加载示例脚本、编译、并把场景实时画进一块 canvas。演示全部由真实引擎渲染，不是截图。 */

const EXAMPLES = () => new URL('examples/', location.href);

export async function fetchSource(file) {
  const r = await fetch(new URL(file, EXAMPLES()).href);
  if (!r.ok) throw new Error(`加载 ${file} 失败（HTTP ${r.status}）`);
  return r.text();
}

/** 编译脚本；<import src> 相对示例文件所在目录解析 */
export async function compileSource(src, file) {
  const base = new URL(file, EXAMPLES());
  const loader = async (p) => {
    const r = await fetch(new URL(p, base).href);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  };
  const res = await compileWithImports(src, loader);
  if (!res.scene) throw new Error(res.diagnostics?.[0]?.message || '编译失败');
  return res.scene;
}

// ---- 全站共用一个 rAF 循环：只推进正在播放的预览，全部停下就不再占用 CPU ----
const active = new Set();
let raf = 0;
let last = 0;
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  for (const p of active) p._tick(dt);
  raf = active.size ? requestAnimationFrame(loop) : 0;
}
function activate(p) {
  active.add(p);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 一块自适应容器大小的实时预览 */
export class Preview {
  constructor(canvas, { captions = true, loop = true, maxDpr = 2 } = {}) {
    this.canvas = canvas;
    this.media = canvas.parentElement;
    this.ctx = canvas.getContext('2d');
    this.captions = captions;
    this.maxDpr = maxDpr;
    this.scene = null;
    this.player = new Player();
    this.player.loop = loop;
    this.player.on('frame', (t) => this.render(t));
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.media);
  }

  setScene(scene, { keepTime = false } = {}) {
    this.scene = scene;
    this.player.setScene(scene, { keepTime });
    this.fit();
  }

  fit() {
    const sc = this.scene;
    if (!sc) return;
    const w = this.media.clientWidth, h = this.media.clientHeight;
    if (w < 2 || h < 2) return;
    const k = Math.min(w / sc.width, h / sc.height);
    const cssW = Math.floor(sc.width * k), cssH = Math.floor(sc.height * k);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.render(this.player.time);
  }

  render(t = this.player.time) {
    if (!this.scene || !this.canvas.width) return;
    draw(this.ctx, this.scene, evaluate(this.scene, t), {
      pixelRatio: this.canvas.width / this.scene.width,
      captions: this.captions,
    });
  }

  /** 海报帧：停在大约 70% 步骤处的静帧，画面最丰富又不是空白 */
  poster() {
    const sc = this.scene;
    if (!sc) return;
    this.pause();
    const n = sc.steps.length;
    this.player.seek(n ? sc.steps[Math.min(n - 1, Math.floor(n * 0.7))].freeze : sc.duration);
  }

  play() { if (!this.scene) return; this.player.play(); activate(this); }
  pause() { this.player.pause(); active.delete(this); }
  restart() { this.player.seek(0); this.play(); }

  _tick(dt) {
    if (!this.player.playing) { active.delete(this); return; }
    this.player.tick(dt);
  }

  /** 进入视口才播放，离开就暂停；系统要求减少动效时只显示海报帧 */
  autoplayWhenVisible() {
    if (prefersReducedMotion()) { this.poster(); return; }
    this._io = new IntersectionObserver(([e]) => { if (e.isIntersecting) this.play(); else this.pause(); }, { threshold: 0.15 });
    this._io.observe(this.media);
  }

  destroy() {
    this.pause();
    this.ro.disconnect();
    this._io?.disconnect();
  }
}
