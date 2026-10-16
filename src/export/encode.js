import { renderFrames } from './offline.js';
import { WebmMuxer } from './webm-mux.js';
import { PRESETS } from '../audio/sound.js';

export const webCodecsSupported = () =>
  typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

const VIDEO_CONFIG = { codec: 'vp09.00.41.08' };

/**
 * 取出编码块里的字节。
 * 注意：EncodedVideoChunk / EncodedAudioChunk 的 copyTo(dest) 是把数据**写进 dest**，返回值是 undefined，
 * 所以必须先分配好缓冲区、调用 copyTo、再用缓冲区本身——不能把 copyTo 的返回值当数据用。
 */
export function chunkBytes(chunk) {
  const data = new Uint8Array(chunk.byteLength);
  chunk.copyTo(data);
  return data;
}

/** 在 OfflineAudioContext 上合成整条音轨：内置音色 + 外部音频（<audio>），返回立体声 Float32 PCM */
async function synthesizePcm(scene, { sampleRate = 48000 } = {}) {
  const dur = scene.duration;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(dur * sampleRate)), sampleRate);
  for (const s of scene.sounds || []) {
    (PRESETS[s.name] || PRESETS.pop)(ctx, Math.min(s.at, dur));
  }
  // 外部音频：解码后按 at 时间点接入；超出时长的部分由 OfflineAudioContext 自动截断
  for (const a of scene.audios || []) {
    if (a.at >= dur) continue;
    let bytes = a.data;
    if (!bytes && typeof fetch === 'function') {
      try { bytes = await (await fetch(a.src)).arrayBuffer(); } catch { bytes = null; }
    }
    if (!bytes) continue;
    try {
      const buf = await ctx.decodeAudioData(bytes.slice(0));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = !!a.loop;
      const g = ctx.createGain();
      const vol = a.volume ?? 1;
      if (a.fadein > 0) { g.gain.setValueAtTime(0.0001, a.at); g.gain.linearRampToValueAtTime(vol, a.at + a.fadein); }
      else g.gain.setValueAtTime(vol, a.at);
      if (a.fadeout > 0 && !a.loop) { const end = Math.min(dur, a.at + buf.duration); g.gain.setValueAtTime(vol, Math.max(a.at, end - a.fadeout)); g.gain.linearRampToValueAtTime(0.0001, end); }
      src.connect(g).connect(ctx.destination);
      src.start(a.at);
    } catch { /* 单个音频解码失败：跳过，不影响其余音轨 */ }
  }
  const buf = await ctx.startRendering();
  return { sampleRate, frames: [buf.getChannelData(0), buf.getChannelData(1)] };
}

/** 把 PCM 分 20ms 帧编码为 Opus 并喂给 muxer */
async function encodeOpus(pcm, mux) {
  const enc = new AudioEncoder({
    output: (chunk) => mux.addAudioFrame(chunkBytes(chunk), Math.round(chunk.timestamp / 1000)),
    error: () => {}, // 出错时 flush() 会拒绝，由调用方的 try/catch 处理
  });
  enc.configure({ codec: 'opus', sampleRate: pcm.sampleRate, numberOfChannels: 2, bitrate: 128000 });
  const frame = 960; // 20ms @ 48kHz
  const [l, r] = pcm.frames;
  for (let off = 0; off < l.length; off += frame) {
    const n = Math.min(frame, l.length - off);
    const data = new Float32Array(n * 2);
    data.set(l.subarray(off, off + n), 0);
    data.set(r.subarray(off, off + n), n);
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate: pcm.sampleRate,
      numberOfFrames: n,
      numberOfChannels: 2,
      timestamp: Math.round((off / pcm.sampleRate) * 1e6),
      data,
    });
    enc.encode(ad);
    ad.close();
  }
  await enc.flush();
  enc.close();
}

/**
 * 离线导出 WebM：WebCodecs 逐帧编码视频 + 离线合成并编码音轨，再由 WebmMuxer 封装。
 * 不依赖实时播放；帧率 / 分辨率 / 时长 / 音轨全部精确可控。仅浏览器（Chromium）可用。
 * 失败一律抛出带原因的 Error：编码器错误、不支持的配置、用户取消，都不会产出残缺文件。
 */
export async function exportWebm(scene, {
  fps = 30,
  scale = 1,
  bitrate = 8_000_000,
  withAudio = true,
  onProgress,
  signal,
} = {}) {
  if (!webCodecsSupported()) throw new Error('当前浏览器不支持 WebCodecs（需要 Chrome 94+ / Edge）');

  const width = Math.round(scene.width * scale);
  const height = Math.round(scene.height * scale);
  const config = { ...VIDEO_CONFIG, width, height, bitrate, framerate: fps };

  // 提前检测编码配置：不支持就明确告诉用户，而不是编到一半才失败
  if (typeof VideoEncoder.isConfigSupported === 'function') {
    let supported = true;
    try { supported = (await VideoEncoder.isConfigSupported(config)).supported !== false; } catch { supported = false; }
    if (!supported) throw new Error(`当前浏览器不支持 VP9 编码（${width}×${height}，${fps}fps）。请换用最新版 Chrome / Edge，或降低分辨率`);
  }

  const mux = new WebmMuxer({ width, height, videoCodec: 'V_VP9', sampleRate: 48000, channels: 2 });
  const canvas = new OffscreenCanvas(width, height);

  // ---- 视频编码 ----
  // 编码器的 error 回调发生在异步上下文里，throw 到不了调用方：先记下来，在每一帧和 flush 之后检查
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk) => mux.addVideoFrame(chunkBytes(chunk), Math.round(chunk.timestamp / 1000), chunk.type === 'key'),
    error: (e) => { failure = e instanceof Error ? e : new Error(String(e)); },
  });
  encoder.configure(config);
  const check = () => {
    if (signal?.aborted) throw new Error('导出已取消');
    if (failure) throw new Error(`视频编码失败：${failure.message}`);
  };

  try {
    check();
    let i = 0;
    const total = Math.round(scene.duration * fps) + 1;
    await renderFrames(scene, {
      fps, scale, signal,
      createCanvas: () => canvas,
      onFrame: async (c) => {
        check();
        const frame = new VideoFrame(c, { timestamp: Math.round((i / fps) * 1e6), duration: Math.round(1e6 / fps) });
        encoder.encode(frame, { keyFrame: i === 0 || i % fps === 0 });
        frame.close();
        i++;
        onProgress?.(0.9 * (i / total));
        // 反压：编码队列积压太多时让出一下，避免长动画把内存撑爆
        if (encoder.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 0));
      },
    });
    check();
    await encoder.flush();
    check();
  } finally {
    try { encoder.close(); } catch { /* 已关闭 */ }
  }

  // ---- 音轨（可选，尽力而为：失败只丢音轨，不影响视频）----
  if (withAudio && (scene.sounds?.length || scene.audios?.length) && typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined') {
    try {
      await encodeOpus(await synthesizePcm(scene), mux);
    } catch { /* 音轨编码失败不影响视频导出 */ }
  }

  onProgress?.(1);
  return new Blob([mux.finalize()], { type: 'video/webm' });
}
