import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/core/index.js';
import { exportWebm, webCodecsSupported } from '../src/export/encode.js';

/**
 * 假的 WebCodecs，行为严格对照真实 API：
 *  - EncodedVideoChunk / EncodedAudioChunk 的 copyTo(dest) 把数据写进 dest，**返回 undefined**
 *    （以前的导出代码把返回值当字节数组用，封装时报 “Cannot read properties of undefined (reading 'length')”）
 *  - encode() 之后输出回调是异步触发的，flush() 才保证全部输出完毕
 *  - 编码器出错时通过 error 回调通知，而不是抛给 encode() 的调用方
 */
const G = globalThis;
const saved = {};
const NAMES = ['VideoEncoder', 'VideoFrame', 'OffscreenCanvas', 'AudioEncoder', 'AudioData', 'OfflineAudioContext'];

const ctxMock = () => new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return (s) => ({ width: String(s).length * 10 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    return typeof t[p] === 'function' ? t[p] : (t[p] ??= () => {});
  },
  set(t, p, v) { t[p] = v; return true; },
});

let behavior;

function install() {
  for (const n of NAMES) saved[n] = G[n];
  behavior = { videoError: null, audioError: null, unsupported: false, videoChunks: 0, audioChunks: 0 };

  G.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctxMock(); } };
  G.VideoFrame = class { constructor(src, init) { this.timestamp = init.timestamp; } close() {} };

  G.VideoEncoder = class {
    static async isConfigSupported() { return { supported: !behavior.unsupported }; }
    constructor({ output, error }) { this.output = output; this.error = error; this.pending = []; }
    configure() {}
    encode(frame, opts) {
      const data = new Uint8Array([opts?.keyFrame ? 1 : 0, 2, 3, 4, 5]);
      this.pending.push({ type: opts?.keyFrame ? 'key' : 'delta', timestamp: frame.timestamp, byteLength: data.length, copyTo(dest) { dest.set(data); /* 返回 undefined */ } });
    }
    async flush() {
      await Promise.resolve();
      if (behavior.videoError) { this.error(new Error(behavior.videoError)); return; }
      for (const c of this.pending) { behavior.videoChunks++; this.output(c); }
      this.pending = [];
    }
    close() {}
  };

  G.AudioData = class { constructor(init) { this.timestamp = init.timestamp; } close() {} };
  G.AudioEncoder = class {
    constructor({ output, error }) { this.output = output; this.error = error; this.n = 0; }
    configure() {}
    encode(ad) { this.n++; this.last = ad.timestamp; }
    async flush() {
      await Promise.resolve();
      if (behavior.audioError) { this.error(new Error(behavior.audioError)); return; }
      const data = new Uint8Array([9, 9, 9]);
      for (let i = 0; i < this.n; i++) { behavior.audioChunks++; this.output({ byteLength: 3, timestamp: i * 20000, copyTo(dest) { dest.set(data); } }); }
    }
    close() {}
  };
  G.OfflineAudioContext = class {
    constructor(ch, len) { this.len = len; }
    async startRendering() { const n = this.len; return { getChannelData: () => new Float32Array(n) }; }
    // Web Audio 的 connect(dest) 返回 dest，音色代码依赖这个链式调用：o.connect(g).connect(ctx.destination)
    createOscillator() { return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (x) => x, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect: (x) => x }; }
    get destination() { return {}; }
    get currentTime() { return 0; }
  };
}
const restore = () => { for (const n of NAMES) { if (saved[n] === undefined) delete G[n]; else G[n] = saved[n]; } };

beforeEach(install);
afterEach(restore);

const scene = (extra = '') => {
  const r = compile(`<scene width="320" height="200" grid="4x3" ${extra}><circle id="a" at="1,1" size=".8c"/><step say="走" dur=".5"><a at="3,2"/></step></scene>`);
  assert.ok(r.scene, JSON.stringify(r.diagnostics));
  return r.scene;
};
const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());
// 数 SimpleBlock（0xA3）出现次数不可靠；这里只检查 EBML 头与 Segment 头，并且确认体积随帧数增长
const startsWithEbml = (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;

test('导出 WebM：copyTo 返回 undefined 的真实 API 语义下，能生成合法文件（回归：reading \'length\'）', async () => {
  assert.ok(webCodecsSupported());
  const blob = await exportWebm(scene(), { fps: 10, withAudio: false });
  const b = await bytesOf(blob);
  assert.ok(startsWithEbml(b), '应以 EBML 头开头');
  assert.equal(blob.type, 'video/webm');
  assert.ok(behavior.videoChunks >= 5, `应编码出视频帧：${behavior.videoChunks}`);
});

test('导出 WebM：每一帧的字节数据都真的写进了文件（不是空帧）', async () => {
  const one = await bytesOf(await exportWebm(scene(), { fps: 5, withAudio: false }));
  behavior.videoChunks = 0;
  const many = await bytesOf(await exportWebm(scene(), { fps: 20, withAudio: false }));
  assert.ok(many.length > one.length + 20, `帧数更多时文件应更大：${one.length} → ${many.length}`);
  // 假编码器每帧 5 字节、首字节 0/1：文件里应能找到这些载荷
  let hits = 0;
  for (let i = 0; i + 4 < many.length; i++) if ((many[i] === 0 || many[i] === 1) && many[i + 1] === 2 && many[i + 2] === 3 && many[i + 3] === 4 && many[i + 4] === 5) hits++;
  assert.ok(hits >= behavior.videoChunks, `载荷应写入文件：找到 ${hits}，编码了 ${behavior.videoChunks} 帧`);
});

test('导出 WebM：带音效的场景同样能导出，音轨数据写入文件', async () => {
  const sc = scene();
  sc.sounds = [{ name: 'pop', at: 0.1 }, { name: 'pop', at: 0.3 }];
  const blob = await exportWebm(sc, { fps: 10, withAudio: true });
  const b = await bytesOf(blob);
  assert.ok(startsWithEbml(b));
  assert.ok(behavior.audioChunks > 0, '应编码出音频帧');
  let hits = 0;
  for (let i = 0; i + 2 < b.length; i++) if (b[i] === 9 && b[i + 1] === 9 && b[i + 2] === 9) hits++;
  assert.ok(hits >= behavior.audioChunks, `音频载荷应写入文件：找到 ${hits}，编码了 ${behavior.audioChunks}`);
});

test('导出 WebM：视频编码器报错时，抛出带原因的清晰错误，而不是静默产出坏文件', async () => {
  behavior.videoError = '编码器内部错误 XYZ';
  await assert.rejects(() => exportWebm(scene(), { fps: 10, withAudio: false }), /XYZ/);
});

test('导出 WebM：音轨编码失败不拖垮视频——仍然得到只有画面的合法文件', async () => {
  behavior.audioError = '音频不支持';
  const sc = scene();
  sc.sounds = [{ name: 'pop', at: 0.1 }];
  const blob = await exportWebm(sc, { fps: 10, withAudio: true });
  assert.ok(startsWithEbml(await bytesOf(blob)));
  assert.ok(behavior.videoChunks > 0);
});

test('导出 WebM：浏览器不支持所选编码配置时，给出明确提示', async () => {
  behavior.unsupported = true;
  await assert.rejects(() => exportWebm(scene(), { fps: 10, withAudio: false }), /不支持|VP9/);
});

test('导出 WebM：用户中途取消，抛出“已取消”而不是产出残缺文件', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(() => exportWebm(scene(), { fps: 10, withAudio: false, signal: ac.signal }), /取消/);
});
