import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/core/index.js';
import { renderFrames } from '../src/export/offline.js';
import { WebmMuxer } from '../src/export/webm-mux.js';

/** 无头 canvas 替身：让 renderFrames 跑通 */
function mockCanvas() {
  const gradient = { addColorStop() {} };
  const store = {};
  const ctx = new Proxy(store, {
    get(t, p) {
      if (p === 'measureText') return (s) => ({ width: [...String(s)].length * 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => gradient;
      const v = t[p];
      return typeof v === 'function' ? v : (v === undefined ? (t[p] = () => {}) : v);
    },
    set(t, p, v) { t[p] = v; return true; },
  });
  return { width: 0, height: 0, getContext: () => ctx };
}

// ---------------- 离线逐帧渲染 ----------------
test('renderFrames：帧数 = round(duration*fps)+1，逐帧回调且可中止', async () => {
  const r = compile('<scene width="400" height="300" duration="2"><circle id="a" at="1,1"/><step say="x" dur="1"><a at="2,2"/></step></scene>');
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  // 手动设 duration（compile 未暴露 duration 属性，改用 1 步的时长）
  const n = await renderFrames(r.scene, { fps: 10, scale: 1, createCanvas: mockCanvas, onFrame: () => {} });
  assert.equal(n, Math.round(r.scene.duration * 10) + 1);

  let count = 0;
  const seen = [];
  await renderFrames(r.scene, { fps: 10, createCanvas: mockCanvas, onFrame: (_c, t) => { count++; seen.push(t); } });
  assert.equal(count, Math.round(r.scene.duration * 10) + 1);
  assert.equal(seen[0], 0);
  assert.equal(seen[seen.length - 1], r.scene.duration);
  for (let i = 1; i < seen.length; i++) assert.ok(Math.abs(seen[i] - seen[i - 1] - 0.1) < 1e-9, '均匀采样');
});

test('renderFrames：AbortSignal 中止后不再渲染', async () => {
  const r = compile('<scene width="400" height="300"><circle id="a" at="1,1"/><step say="x"/></scene>');
  const ctrl = new AbortController();
  let count = 0;
  await renderFrames(r.scene, { fps: 30, createCanvas: mockCanvas, signal: ctrl.signal, onFrame: () => { if (++count === 3) ctrl.abort(); } });
  assert.equal(count, 3);
});

// ---------------- WebM muxer ----------------
/** 最小 EBML 解析器：把字节流解析为嵌套元素，size 错误会导致越界/错位 */
function parseEBML(buf) {
  const out = [];
  let off = 0;
  const readId = () => {
    const first = buf[off++];
    let mask = 0x80, L = 1;
    while (L <= 4 && !(first & mask)) { mask >>= 1; L++; }
    let id = first;
    for (let i = 1; i < L; i++) id = id * 256 + buf[off++];
    return id;
  };
  const readVint = () => {
    const first = buf[off++];
    let mask = 0x80, L = 1;
    while (L <= 8 && !(first & mask)) { mask >>= 1; L++; }
    let v = first & (mask - 1);
    for (let i = 1; i < L; i++) v = v * 256 + buf[off++];
    // unknown size：单字节 0xFF 表示"延伸到父级末尾"
    return first === 0xff && L === 1 ? -1 : v;
  };
  const CONTAINER = new Set([0x1a45dfa3, 0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0x1f43b675, 0xe0, 0xe1]);
  function walk(end) {
    while (off < end) {
      const id = readId();
      let size = readVint();
      const start = off;
      out.push({ id, size });
      if (size === -1) size = end - off; // unknown → 延伸到父级末尾
      if (CONTAINER.has(id)) walk(start + size);
      off = start + size;
    }
  }
  walk(buf.length);
  assert.equal(off, buf.length, 'EBML 结构必须恰好解析到结尾（size 无误）');
  return out;
}

test('webm-mux：视频帧封装为含 Tracks/Cluster/SimpleBlock 的合法 EBML', () => {
  const mux = new WebmMuxer({ width: 640, height: 360, videoCodec: 'V_VP9' });
  mux.addVideoFrame(new Uint8Array([1, 2, 3, 4]), 0, true);
  mux.addVideoFrame(new Uint8Array([5, 6, 7, 8]), 33, false);
  mux.addVideoFrame(new Uint8Array([9]), 66, false);
  const bytes = mux.finalize();

  const els = parseEBML(bytes);
  const ids = els.map((e) => e.id);
  assert.ok(ids.includes(0x1a45dfa3), 'EBML 头');
  assert.ok(ids.includes(0x18538067), 'Segment');
  assert.ok(ids.includes(0x1654ae6b), 'Tracks');
  assert.ok(ids.includes(0xae), 'TrackEntry');
  assert.ok(ids.includes(0x1f43b675), 'Cluster');
  const blocks = els.filter((e) => e.id === 0xa3);
  assert.equal(blocks.length, 3, '3 个 SimpleBlock');
});

test('webm-mux：带音频轨道时包含 Opus TrackEntry 与 CodecPrivate', () => {
  const mux = new WebmMuxer({ width: 320, height: 240 });
  mux.addVideoFrame(new Uint8Array([0]), 0, true);
  mux.addAudioFrame(new Uint8Array([1, 2]), 20);
  const bytes = mux.finalize();
  const els = parseEBML(bytes);
  assert.equal(els.filter((e) => e.id === 0xae).length, 2, '视频 + 音频两个 TrackEntry');
  assert.ok(els.some((e) => e.id === 0x63a2), '存在 CodecPrivate（OpusHead）');
});

test('webm-mux：跨 int16 时间码自动切分多个 Cluster', () => {
  const mux = new WebmMuxer({ width: 100, height: 100 });
  mux.addVideoFrame(new Uint8Array([1]), 0, true);
  mux.addVideoFrame(new Uint8Array([2]), 40000, false); // 超出 32767，开新 Cluster
  const bytes = mux.finalize();
  const els = parseEBML(bytes);
  assert.equal(els.filter((e) => e.id === 0x1f43b675).length, 2, '两个 Cluster');
});
