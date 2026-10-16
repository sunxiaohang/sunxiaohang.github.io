import { evaluate } from '../core/runtime/evaluate.js';
import { clamp } from '../core/util/ease.js';
import { draw } from '../render/canvas2d.js';
import { buildCamera, screenToWorld } from '../render/ir.js';
import { aabb } from '../core/analysis/lint.js';

/** 不可点选的类型：图层是容器；镜头和发射器没有有意义的包围盒。其余保持原有行为 */
const NOT_PICKABLE = new Set(['layer', 'camera', 'emitter']);

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
    this.selection = null; // 当前选中的实体
    this.onPick = null;    // (entity|null) => void
    this.issues = new Set(); // 诊断对象 id（超框/重叠/出界），画红框
    new ResizeObserver(() => this.fit()).observe(wrap);
  }

  setScene(scene) {
    this.scene = scene;
    this.selection = null;
    this.issues = new Set();
    this.fit();
  }

  setIssues(ids) { this.issues = new Set(ids); }

  /** 命中检测：屏幕上的场景坐标 → 最上层命中的实体（先撤销镜头变换，再和世界坐标的包围盒比对） */
  pick(sx0, sy0) {
    if (!this.scene) return null;
    const frame = evaluate(this.scene, this.time);
    const [sx, sy] = screenToWorld(buildCamera(this.scene, frame), this.scene, sx0, sy0);
    let best = null, bestZ = -Infinity;
    this.scene.entities.forEach((e, i) => {
      if (e.internal || NOT_PICKABLE.has(e.type)) return;
      const L = frame.entities[i];
      if (L.hidden || L.alpha * L.ma < 0.02) return;
      const b = aabb(e, L);
      if (sx >= b.l && sx <= b.r && sy >= b.t && sy <= b.b) {
        const lz = e.layer >= 0 ? this.scene.entities[e.layer].z : 0;
        const z = lz * 1e6 + L.z;
        if (z > bestZ) { bestZ = z; best = e; }
      }
    });
    return best;
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
    if (this.selection && !this.locked) this.drawSelection(frame);
    if (this.issues.size && !this.locked) this.drawIssues(frame);
    return frame;
  }

  /**
   * 在"世界坐标"里画编辑器覆盖层（选框、问题框）。和 draw() 用同一个镜头变换，所以画面被推近 / 平移后框仍然贴着对象；
   * fn(k) 的 k 是"屏幕 1px 对应的世界长度"，线宽、虚线、外扩距离都乘它，保证无论怎么缩放，框在屏幕上粗细不变。
   */
  withWorld(frame, fn) {
    const pr = this.canvas.width / this.scene.width;
    const cam = buildCamera(this.scene, frame);
    const z = cam ? cam.z : 1;
    this.ctx.save();
    this.ctx.setTransform(pr, 0, 0, pr, 0, 0);
    if (cam) {
      this.ctx.translate(this.scene.width / 2, this.scene.height / 2);
      this.ctx.scale(z, z);
      this.ctx.translate(-cam.cx, -cam.cy);
    }
    fn(1 / (pr * z));
    this.ctx.restore();
  }

  /** 诊断高亮：超框/重叠/出界的对象画红框 */
  drawIssues(frame) {
    this.withWorld(frame, (k) => {
      this.ctx.strokeStyle = 'rgba(255,107,107,.95)';
      this.ctx.lineWidth = 2.5 * k;
      this.ctx.setLineDash([7 * k, 4 * k]);
      for (const e of this.scene.entities) {
        if (!this.issues.has(e.id)) continue;
        const L = frame.entities[e.index];
        if (L.hidden) continue;
        const b = aabb(e, L);
        const m = 3 * k;
        this.ctx.strokeRect(b.l - m, b.t - m, b.r - b.l + 2 * m, b.b - b.t + 2 * m);
      }
    });
  }

  /** 选中框：虚线描出选中对象 */
  drawSelection(frame) {
    const e = this.selection;
    const L = frame.entities[e.index];
    if (L.hidden) return;
    const b = aabb(e, L);
    this.withWorld(frame, (k) => {
      this.ctx.strokeStyle = '#7fe3d3';
      this.ctx.lineWidth = 2 * k;
      this.ctx.setLineDash([6 * k, 4 * k]);
      const m = 5 * k;
      this.ctx.strokeRect(b.l - m, b.t - m, b.r - b.l + 2 * m, b.b - b.t + 2 * m);
    });
  }
}
