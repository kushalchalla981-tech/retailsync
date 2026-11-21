/**
 * Gnani (Vachana) speech API client, server side only.
 *   STT: Prisma v3.0  POST https://api.vachana.ai/stt/v3            (multipart)
 *   TTS: Timbre v3.0  POST https://api.vachana.ai/api/v1/tts/inference (JSON -> audio/wav)
 *
 * The key comes from GNANI_API_KEY and is sent as X-API-Key-ID; it never reaches the browser.
 */
import { loadDotEnv } from '../config.js';
import { AppError } from '../http/contract.js';

const BASE = 'https://api.vachana.ai';
export const STT_LANGUAGES = 'en-IN,hi-IN';
/** Words Gnani tends to mishear without a hint ("store" -> "door", PostgreSQL -> "path rescue"). */
export const COMMAND_TERMS = ['Sync', 'store', 'shop', 'cart', 'sleep', 'dashboard', 'ledger', 'PostgreSQL', 'Kafka', 'OpenSearch', 'Aurora', 'Sunset', 'Forest', 'Midnight', 'Obsidian', 'launch', 'kholo', 'band karo'];
export const TTS_VOICES = ['Shivani', 'Avinash'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

export interface Transcript {
  text: string;
  language: string | null;
  latencyMs: number;
}

export interface SpeechClient {
  /** `keyterms` bias recognition toward expected words (store names, command vocabulary). */
  transcribe(audio: Buffer, mime: string, keyterms?: string[]): Promise<Transcript>;
  synthesize(text: string, voice: TtsVoice): Promise<Buffer>;
}

function apiKey(): string {
  loadDotEnv();
  const key = process.env.GNANI_API_KEY?.trim();
  if (!key) throw new AppError(503, 'VOICE_NOT_CONFIGURED', 'Voice is not configured on this server');
  return key;
}

/** Gnani errors come in three shapes (gateway `detail`, STT `error`, TTS flat `message`). */
async function fail(res: Response, what: string): Promise<never> {
  const body = (await res.json().catch(() => null)) as { detail?: { message?: string }; error?: { message?: string }; message?: string } | null;
  const message = body?.detail?.message ?? body?.error?.message ?? body?.message ?? `HTTP ${res.status}`;
  if (res.status === 429) throw new AppError(429, 'VOICE_BUSY', 'The voice service is busy, please try again');
  if (res.status === 400 || res.status === 422) throw new AppError(400, 'VOICE_BAD_AUDIO', `${what}: ${message}`);
  throw new AppError(502, 'VOICE_PROVIDER_ERROR', `${what} failed: ${message}`);
}

/** Retry only what Gnani documents as retryable (429/5xx), briefly. */
async function call(url: string, init: () => RequestInit): Promise<Response> {
  let res: Response | undefined;
  for (const wait of [0, 400, 1000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    res = await fetch(url, { ...init(), signal: AbortSignal.timeout(15_000) });
    if (res.status !== 429 && res.status < 500) return res;
  }
  return res!;
}

export const gnaniClient: SpeechClient = {
  async transcribe(audio, mime, keyterms = []) {
    const key = apiKey();
    const ext = mime.includes('wav') ? 'wav' : mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') ? 'mp3' : 'bin';
    const started = performance.now();
    const res = await call(`${BASE}/stt/v3`, () => {
      const form = new FormData();
      form.append('audio_file', new Blob([new Uint8Array(audio)], { type: mime }), `speech.${ext}`);
      form.append('language_code', STT_LANGUAGES);
      form.append('model', 'prisma-v3.0');
      // Latin-script output for Hindi/Hinglish too ("Circuit hub kholo"), so commands match one vocabulary.
      form.append('format', 'transliterate');
      const terms = [...new Set([...COMMAND_TERMS, ...keyterms])].slice(0, 60);
      form.append('keyterms', terms.join(','));
      return { method: 'POST', headers: { 'X-API-Key-ID': key }, body: form };
    });
    if (!res.ok) await fail(res, 'Transcription');
    const body = (await res.json()) as { transcript?: string; detected_language_code?: string };
    return { text: (body.transcript ?? '').trim(), language: body.detected_language_code ?? null, latencyMs: Math.round(performance.now() - started) };
  },

  async synthesize(text, voice) {
    const key = apiKey();
    const res = await call(`${BASE}/api/v1/tts/inference`, () => ({
      method: 'POST',
      headers: { 'X-API-Key-ID': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        voice,
        model: 'timbre-v3.0',
        language: 'en-IN',
        audio_config: { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' },
      }),
    }));
    if (!res.ok) await fail(res, 'Speech synthesis');
    return Buffer.from(await res.arrayBuffer());
  },
};

/** TTS reads text literally: say "rupees" instead of the symbol, drop markup-ish characters. */
export function speakable(text: string): string {
  return text
    .replace(/₹\s?([\d,]+(?:\.\d+)?)/g, (_, n: string) => `${n.replace(/,/g, '')} rupees`)
    .replace(/[*_#`>•⚠️]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}
