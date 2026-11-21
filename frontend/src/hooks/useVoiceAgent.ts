/**
 * The voice agent's state machine (v1.06):
 *   STANDBY -> LISTENING (mic, until a pause) -> PROCESSING (Gnani STT + intent) -> SPEAKING (Gnani TTS) -> STANDBY
 *
 * Wake phrases ("Hey Sync", "Retail Up", "Sync") use the browser's speech
 * recognizer only to spot the phrase when hands-free is on; the command
 * itself is recorded and transcribed by Gnani. "Stop" / "Cancel" while the
 * agent speaks, or clicking the orb, interrupts it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { classify, speak, transcribe, type Speech } from '../voice/api';
import { NoSpeechError, recordUtterance } from '../voice/recorder';
import { getCreateDraft, type VoiceAction } from '../voice/types';
import { sound } from '../utils/sound';

export type VoiceStatus = 'standby' | 'listening' | 'processing' | 'speaking';

export interface VoiceAgentOptions {
  stores: () => { id: string; name: string }[];
  /** Runs the action; may return a reply that replaces the server's (e.g. an AI answer). */
  execute: (action: VoiceAction) => string | null | undefined;
}

interface Recognition {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionCtor = new () => Recognition;
const Recognizer: RecognitionCtor | undefined = typeof window !== 'undefined'
  ? ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition)
  : undefined;

export const WAKE = /\b(hey,?\s*sync|retail\s*up|sync)\b/i;
const BARGE_IN = /\b(stop|cancel|quiet|enough)\b/i;
const HANDS_FREE_KEY = 'retailsync_voice_handsfree';

export function useVoiceAgent({ stores, execute }: VoiceAgentOptions) {
  const [status, setStatusState] = useState<VoiceStatus>('standby');
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [handsFree, setHandsFreeState] = useState(() => {
    try { return !!Recognizer && localStorage.getItem(HANDS_FREE_KEY) === '1'; } catch { return false; }
  });

  const statusRef = useRef<VoiceStatus>('standby');
  const abort = useRef<AbortController | null>(null);
  const speech = useRef<Speech | null>(null);
  const latest = useRef({ stores, execute });
  latest.current = { stores, execute };

  const setStatus = (s: VoiceStatus) => { statusRef.current = s; setStatusState(s); };

  const cancel = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    speech.current?.stop();
    speech.current = null;
    setLevel(0);
    setStatus('standby');
  }, []);

  const say = useCallback(async (text: string) => {
    setReply(text);
    setStatus('speaking');
    speech.current = speak(text);
    await speech.current.done;
    speech.current = null;
  }, []);

  const turn = useCallback(async (): Promise<void> => {
    if (statusRef.current !== 'standby') return cancel();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    setHeard('');
    setReply('');
    setStatus('listening');
    sound.playWhoosh(0.5);
    let followUp = false;
    try {
      const wav = await recordUtterance({ onLevel: setLevel, signal: ctrl.signal });
      setStatus('processing');
      const text = await transcribe(wav, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setHeard(text || '…');
      if (!text) { await say("Sorry, I didn't catch that."); return; }
      const { action, reply: serverReply } = await classify(text, latest.current.stores(), getCreateDraft());
      if (ctrl.signal.aborted) return;
      if (action.type === 'STOP') return;
      const answer = latest.current.execute(action) ?? serverReply;
      if (answer) {
        await say(answer);
        // Keep the store-building conversation going without another wake word.
        followUp = !ctrl.signal.aborted && !!getCreateDraft() && answer.trim().endsWith('?');
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const msg = e instanceof NoSpeechError ? e.message
        : (e as Error).name === 'NotAllowedError' ? 'Microphone access is blocked. Allow it in your browser to talk to Sync.'
        : (e as Error).message || 'Something went wrong.';
      setError(msg);
    } finally {
      if (abort.current === ctrl) {
        abort.current = null;
        setLevel(0);
        setStatus('standby');
      }
    }
    if (followUp) void turn();
  }, [cancel, say]);

  // Hands-free: the browser recognizer listens only for the wake phrase (and "stop" while speaking).
  useEffect(() => {
    if (!handsFree || !Recognizer) return;
    let alive = true;
    let lastWake = 0;
    const rec = new Recognizer();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-IN';
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (statusRef.current === 'speaking' && BARGE_IN.test(text)) { cancel(); return; }
        if (statusRef.current === 'standby' && WAKE.test(text) && Date.now() - lastWake > 2500) {
          lastWake = Date.now();
          void turn();
          return;
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        alive = false;
        setError('Microphone access is blocked, so hands-free is off.');
        setHandsFreeState(false);
      }
    };
    // Chrome ends recognition after a while; keep it running while hands-free is on.
    rec.onend = () => { if (alive) window.setTimeout(() => { if (alive) try { rec.start(); } catch { /* already started */ } }, 300); };
    try { rec.start(); } catch { /* ignore */ }
    return () => { alive = false; rec.onend = null; rec.abort(); };
  }, [handsFree, turn, cancel]);

  const setHandsFree = useCallback((on: boolean) => {
    setHandsFreeState(on);
    try { localStorage.setItem(HANDS_FREE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  /** Speak something outside a turn (e.g. "ZenTech is live"), after any current speech. */
  const announce = useCallback(async (text: string) => {
    for (let waited = 0; statusRef.current !== 'standby' && waited < 15000; waited += 200) await new Promise((r) => setTimeout(r, 200));
    if (statusRef.current !== 'standby') { setReply(text); return; }
    await say(text);
    if ((statusRef.current as VoiceStatus) === 'speaking') setStatus('standby');
  }, [say]);

  return { status, level, heard, reply, error, handsFree, setHandsFree, wakeSupported: !!Recognizer, activate: turn, cancel, say: announce };
}
