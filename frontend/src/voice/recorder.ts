/**
 * Records one spoken utterance from the microphone and returns it as a
 * 16 kHz mono 16-bit WAV (what Gnani Prisma expects), ending automatically
 * after a pause. Reports a 0..1 level for the waveform while recording.
 */
const TARGET_RATE = 16000;

export interface RecordOptions {
  onLevel?: (level: number) => void;
  /** Give up if no speech starts within this long. */
  waitForSpeechMs?: number;
  /** Stop after this much silence once speech has started. */
  silenceMs?: number;
  maxMs?: number;
  signal?: AbortSignal;
  /** Reuse an open microphone (kept open while the agent is awake); otherwise one is opened and closed here. */
  stream?: MediaStream;
}

export class NoSpeechError extends Error {
  constructor() { super("I didn't hear anything."); }
}

function downsample(chunks: Float32Array[], fromRate: number): Int16Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { input.set(c, off); off += c.length; }
  const ratio = fromRate / TARGET_RATE;
  const out = new Int16Array(Math.floor(total / ratio));
  for (let i = 0; i < out.length; i++) {
    // Average the source samples that fall in this output sample (cheap low-pass).
    const start = Math.floor(i * ratio), end = Math.min(total, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

export function encodeWav(pcm: Int16Array, rate = TARGET_RATE): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}

export const openMic = () =>
  navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });

export async function recordUtterance(opts: RecordOptions = {}): Promise<Blob> {
  const { onLevel, waitForSpeechMs = 6000, silenceMs = 1100, maxMs = 12000, signal } = opts;
  const stream = opts.stream ?? (await openMic());
  const ctx = new AudioContext();
  await ctx.resume().catch(() => {}); // Safari/Chrome may start it suspended outside the click handler
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  const started = performance.now();
  let floor = 0.01, calibrated = 0, speechAt = 0, lastVoice = 0;

  try {
    return await new Promise<Blob>((resolve, reject) => {
      const finish = (err?: Error) => {
        proc.onaudioprocess = null;
        if (err) return reject(err);
        resolve(encodeWav(downsample(chunks, ctx.sampleRate)));
      };
      signal?.addEventListener('abort', () => finish(new DOMException('Cancelled', 'AbortError')), { once: true });
      proc.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(data));
        let sq = 0;
        for (let i = 0; i < data.length; i++) sq += data[i] * data[i];
        const rms = Math.sqrt(sq / data.length);
        onLevel?.(Math.min(1, rms * 12));
        const now = performance.now();
        // Learn the room's noise floor from the first ~300 ms.
        if (now - started < 300) { floor = (floor * calibrated + rms) / ++calibrated; return; }
        const voiced = rms > Math.max(0.012, floor * 2.5);
        if (voiced) { lastVoice = now; if (!speechAt) speechAt = now; }
        if (!speechAt && now - started > waitForSpeechMs) return finish(new NoSpeechError());
        if (speechAt && now - lastVoice > silenceMs) return finish();
        if (now - started > maxMs) return finish();
      };
      source.connect(proc);
      proc.connect(ctx.destination);
    });
  } finally {
    onLevel?.(0);
    source.disconnect();
    proc.disconnect();
    if (!opts.stream) stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  }
}
