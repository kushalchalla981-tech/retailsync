/** Voice API calls, with the browser's own speech synthesis as a fallback voice. */
import { API_BASE } from '../utils/api';
import type { CreateDraft, VoiceAction } from './types';

export async function transcribe(wav: Blob, signal?: AbortSignal, hints: string[] = []): Promise<string> {
  const q = hints.length ? `?hints=${encodeURIComponent(hints.slice(0, 40).join(','))}` : '';
  const res = await fetch(`${API_BASE}/api/voice/transcribe${q}`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav, signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Transcription failed (${res.status})`);
  return (body.text as string) ?? '';
}

export async function classify(transcript: string, stores: { id: string; name: string }[], creating: CreateDraft | null): Promise<{ action: VoiceAction; reply: string | null }> {
  const res = await fetch(`${API_BASE}/api/voice/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript, stores, creating }) });
  if (!res.ok) throw new Error(`Could not understand that (${res.status})`);
  return res.json();
}

export interface Speech { done: Promise<void>; stop: () => void }

/** Speak with Gnani Timbre; fall back to the browser voice if the server can't. */
export function speak(text: string, voice: 'Shivani' | 'Avinash' = 'Shivani'): Speech {
  const ctrl = new AbortController();
  let audio: HTMLAudioElement | null = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    ctrl.abort();
    if (audio) { audio.pause(); audio.src = ''; }
    window.speechSynthesis?.cancel();
  };
  const done = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/voice/synthesize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice }), signal: ctrl.signal });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      if (stopped) return URL.revokeObjectURL(url);
      audio = new Audio(url);
      await new Promise<void>((resolve) => {
        audio!.onended = audio!.onerror = audio!.onpause = () => resolve();
        audio!.play().catch(() => resolve());
      });
      URL.revokeObjectURL(url);
    } catch {
      if (stopped || !window.speechSynthesis) return;
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-IN';
        u.onend = u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      });
    }
  })();
  return { done, stop };
}
