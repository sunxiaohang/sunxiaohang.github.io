import { renderFrames } from './offline.js';
import { WebmMuxer } from './webm-mux.js';
import { PRESETS } from '../audio/sound.js';

export const webCodecsSupported = () =>
  typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

/** 在 OfflineAudioContext 上合成整条音轨（复用内置音色），返回立体声 Float32 PCM */
async function synthesizePcm(scene, { sampleRate = 48000 } = {}) {
  const dur = scene.duration;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(dur * sampleRate)), sampleRate);
  for (const s of scene.sounds || []) {
    (PRESETS[s.name] || PRESETS.pop)(ctx, Math.min(s.at, dur));
  }
  const buf = await ctx.startRendering();
  return { sampleRate, frames: [buf.getChannelData(0), buf.getChannelData(1)] };
}

/** 把 PCM 分 20ms 帧编码为 Opus 并喂给 muxer */
async function encodeOpus(pcm, mux) {
  const enc = new AudioEncoder({
    output: (chunk) => mux.addAudioFrame(chunk.copyTo(new Uint8Array(chunk.byteLength)), Math.round(chunk.timestamp / 1000)),
    error: () => {},
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
  const mux = new WebmMuxer({ width, height, videoCodec: 'V_VP9', sampleRate: 48000, channels: 2 });
  const canvas = new OffscreenCanvas(width, height);

  // ---- 视频编码 ----
  const encoder = new VideoEncoder({
    output: (chunk) =>
      mux.addVideoFrame(chunk.copyTo(new Uint8Array(chunk.byteLength)), Math.round(chunk.timestamp / 1000), chunk.type === 'key'),
    error: (e) => { throw e; },
  });
  encoder.configure({ codec: 'vp09.00.41.08', width, height, bitrate, framerate: fps });

  let i = 0;
  const total = Math.round(scene.duration * fps) + 1;
  await renderFrames(scene, {
    fps, scale, signal,
    createCanvas: () => canvas,
    onFrame: async (c) => {
      const frame = new VideoFrame(c, { timestamp: Math.round((i / fps) * 1e6), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: i === 0 || i % fps === 0 });
      frame.close();
      i++;
      onProgress?.(0.9 * (i / total));
    },
  });
  await encoder.flush();
  encoder.close();

  // ---- 音轨（可选，尽力而为）----
  if (withAudio && scene.sounds?.length && typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined') {
    try {
      await encodeOpus(await synthesizePcm(scene), mux);
    } catch { /* 音轨编码失败不影响视频导出 */ }
  }

  onProgress?.(1);
  return new Blob([mux.finalize()], { type: 'video/webm' });
}
