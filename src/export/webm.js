/**
 * WebM 实时录制：把 canvas 的画面流交给 MediaRecorder。
 * start() 返回 { stop, done }；done 在录制结束后 resolve 为 Blob。
 */
export function startWebmRecording(canvas, { fps = 60, bitrate = 16_000_000 } = {}) {
  if (typeof MediaRecorder === 'undefined') throw new Error('当前浏览器不支持 MediaRecorder，请使用 Chrome / Edge');
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(canvas.captureStream(fps), { mimeType: mime, videoBitsPerSecond: bitrate });
  const chunks = [];
  const done = new Promise((resolve) => {
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });
  rec.start();
  return { stop: () => rec.state !== 'inactive' && rec.stop(), done };
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
