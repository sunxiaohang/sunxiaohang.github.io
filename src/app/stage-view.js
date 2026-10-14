import { evaluate } from '../core/runtime/evaluate.js';
import { clamp } from '../core/util/ease.js';
import { draw } from '../render/canvas2d.js';

/** 舞台视图：把 scene + 时间画到 canvas 上，并随容器大小自适应清晰度 */
export class StageView {
  constructor({ canvas, wrap }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wrap = wrap;
    this.scene = null;
    this.time = 0;
    this.showGuide = false;
    this.locked = false; // 导出期间锁定画布尺寸，不随容器变化
    new ResizeObserver(() => this.fit()).observe(wrap);
  }

  setScene(scene) {
    this.scene = scene;
    this.fit();
  }

  fit() {
    const sc = this.scene;
    if (!sc || this.locked) return;
    const cs = getComputedStyle(this.wrap);
    const aw = this.wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = this.wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const k = Math.max(0.05, Math.min(aw / sc.width, ah / sc.height));
    this.canvas.style.width = `${Math.floor(sc.width * k)}px`;
    this.canvas.style.height = `${Math.floor(sc.height * k)}px`;
    const ratio = clamp((window.devicePixelRatio || 1) * k, 0.5, 3);
    const w = Math.round(sc.width * ratio), h = Math.round(sc.height * ratio);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // 改尺寸会清空画布：立即同步重绘，避免空白闪烁
    this.render();
  }

  /** 以固定倍率重设画布（导出用），返回恢复函数 */
  lock(scale) {
    this.locked = true;
    this.canvas.width = this.scene.width * scale;
    this.canvas.height = this.scene.height * scale;
    return () => { this.locked = false; this.fit(); };
  }

  render(t = this.time) {
    if (!this.scene) return null;
    this.time = t;
    const frame = evaluate(this.scene, t);
    draw(this.ctx, this.scene, frame, {
      pixelRatio: this.canvas.width / this.scene.width,
      grid: this.showGuide && !this.locked,
    });
    return frame;
  }
}
