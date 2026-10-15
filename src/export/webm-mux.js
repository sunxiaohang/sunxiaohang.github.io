/**
 * 零依赖 WebM（EBML/Matroska）封装器。
 * 把 WebCodecs 输出的裸编码帧（VP8/VP9 视频 + Opus 音频）封装成可播放的 .webm。
 * 仅实现离线导出所需的最小结构：EBML 头、Segment、Info、Tracks、Cluster、SimpleBlock。
 */

const concat = (parts) => {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
};

/** VINT（EBML 变长整数）：返回编码 value 所需的字节数（1~8） */
function vintLen(v) {
  for (let L = 1; L <= 8; L++) if (v < 2 ** (6 * L + 1)) return L;
  return 8;
}

/** 把 value 编码为 L 字节 VINT（含首字节 marker 位） */
function writeVint(v, L = vintLen(v)) {
  const out = new Uint8Array(L);
  let x = v;
  for (let i = L - 1; i >= 0; i--) { out[i] = x % 256; x = Math.floor(x / 256); }
  out[0] |= 1 << (8 - L);
  return out;
}

function writeUint(v, size) {
  const out = new Uint8Array(size);
  let x = v;
  for (let i = size - 1; i >= 0; i--) { out[i] = x % 256; x = Math.floor(x / 256); }
  return out;
}

function writeFloat32(v) {
  const b = new ArrayBuffer(4);
  new DataView(b).setFloat32(0, v, false);
  return new Uint8Array(b);
}

/** EBML 元素：ID + size(VINT) + payload */
function el(id, payload) {
  return concat([id, writeVint(payload.length), payload]);
}

const ID = {
  EBML: [0x1a, 0x45, 0xdf, 0xa3],
  Segment: [0x18, 0x53, 0x80, 0x67],
  Info: [0x15, 0x49, 0xa9, 0x66],
  TimecodeScale: [0x2a, 0xd7, 0xb1],
  MuxingApp: [0x4d, 0x80],
  WritingApp: [0x57, 0x41],
  Duration: [0x44, 0x89],
  Tracks: [0x16, 0x54, 0xae, 0x6b],
  TrackEntry: [0xae],
  TrackNumber: [0xd7],
  TrackUID: [0x73, 0xc5],
  TrackType: [0x83],
  CodecID: [0x86],
  CodecPrivate: [0x63, 0xa2],
  Video: [0xe0],
  PixelWidth: [0xb0],
  PixelHeight: [0xba],
  Audio: [0xe1],
  SamplingFrequency: [0xb5],
  Channels: [0x9f],
  Cluster: [0x1f, 0x43, 0xb6, 0x75],
  Timecode: [0xe7],
  SimpleBlock: [0xa3],
};

const str = (s) => new TextEncoder().encode(s);

/** OpusHead：WebM 里 Opus 轨道的 CodecPrivate（19 字节） */
function opusHead(channels, sampleRate = 48000, preSkip = 0) {
  const out = new Uint8Array(19);
  out.set(str('OpusHead'), 0);
  out[8] = 1;                       // version
  out[9] = channels;                // channel count
  out.set(writeUint(preSkip, 2), 10); // pre-skip（LE 按 Matroska 惯例）
  const sr = new DataView(out.buffer);
  sr.setUint32(12, sampleRate, true); // input sample rate（LE）
  sr.setInt16(16, 0, true);           // output gain
  out[18] = 0;                        // mapping family
  return out;
}

export class WebmMuxer {
  constructor({ width, height, videoCodec = 'V_VP9', sampleRate = 48000, channels = 2 } = {}) {
    this.width = width;
    this.height = height;
    this.videoCodec = videoCodec;
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.frames = [];      // { track, tsMs, keyframe, data }
    this.maxTs = 0;
  }

  /** 追加一帧编码数据；timestamp 单位毫秒 */
  addVideoFrame(data, tsMs, keyframe) {
    this.frames.push({ track: 1, tsMs, keyframe: !!keyframe, data });
    this.maxTs = Math.max(this.maxTs, tsMs);
  }

  addAudioFrame(data, tsMs) {
    this.frames.push({ track: 2, tsMs, keyframe: true, data });
    this.maxTs = Math.max(this.maxTs, tsMs);
  }

  finalize() {
    const frames = [...this.frames].sort((a, b) => a.tsMs - b.tsMs || a.track - b.track);

    // ---- 按 Cluster 切分：相对时间码必须在 int16 范围内 ----
    const clusters = [];
    let cur = null;
    for (const f of frames) {
      if (!cur || f.tsMs - cur.base > 32767) {
        cur = { base: f.tsMs, blocks: [] };
        clusters.push(cur);
      }
      cur.blocks.push(f);
    }

    const clusterBytes = clusters.map((c) => {
      const blocks = c.blocks.map((f) => {
        const rel = Math.max(-32768, Math.min(32767, Math.round(f.tsMs - c.base)));
        const head = concat([writeVint(f.track, 1), writeUint(rel & 0xffff, 2), new Uint8Array([f.keyframe ? 0x80 : 0x00])]);
        return el(ID.SimpleBlock, concat([head, f.data]));
      });
      return el(ID.Cluster, concat([el(ID.Timecode, writeUint(Math.round(c.base), 2)), ...blocks]));
    });

    const tracks = [
      // 视频轨道
      el(ID.TrackEntry, concat([
        el(ID.TrackNumber, writeVint(1, 1)),
        el(ID.TrackUID, writeUint(1, 4)),
        el(ID.TrackType, writeUint(1, 1)),
        el(ID.CodecID, str(this.videoCodec)),
        el(ID.Video, concat([el(ID.PixelWidth, writeUint(this.width, 2)), el(ID.PixelHeight, writeUint(this.height, 2))])),
      ])),
      // 音频轨道（若有过音频帧）
      ...(this.frames.some((f) => f.track === 2)
        ? [el(ID.TrackEntry, concat([
          el(ID.TrackNumber, writeVint(2, 1)),
          el(ID.TrackUID, writeUint(2, 4)),
          el(ID.TrackType, writeUint(2, 1)),
          el(ID.CodecID, str('A_OPUS')),
          el(ID.CodecPrivate, opusHead(this.channels, this.sampleRate)),
          el(ID.Audio, concat([el(ID.SamplingFrequency, writeFloat32(this.sampleRate)), el(ID.Channels, writeUint(this.channels, 1))])),
        ]))]
        : []),
    ];

    const info = el(ID.Info, concat([
      el(ID.TimecodeScale, writeUint(1_000_000, 4)), // 1ms
      el(ID.MuxingApp, str('CodeMotion')),
      el(ID.WritingApp, str('CodeMotion')),
      el(ID.Duration, writeFloat32(this.maxTs)),
    ]));

    const ebml = el(ID.EBML, concat([el([0x42, 0x86], writeUint(1, 2)), el([0x42, 0xf7], writeUint(1, 4)), el([0x42, 0xf2], writeUint(4, 4)), el([0x42, 0xf3], writeUint(8, 4)), el([0x42, 0x82], str('webm')), el([0x42, 0x87], writeUint(4, 4)), el([0x42, 0x85], writeUint(2, 2))]));

    // Segment size 用 unknown（单字节 0xFF），避免预计算总长度
    const segment = concat([ID.Segment, new Uint8Array([0xff]), info, el(ID.Tracks, concat(tracks)), ...clusterBytes]);

    return concat([ebml, segment]);
  }
}
