/**
 * The voice agent's state machine (v1.06.1):
 *
 *   SLEEPING --"Sync" / tap--> awake loop: LISTENING -> PROCESSING -> SPEAKING -> LISTENING -> ...
 *   awake loop --"sleep" / tap / 2 min idle--> SLEEPING
 *
 * While awake it keeps taking commands without a wake word. Commands are
 * recorded and transcribed by Gnani. The wake word itself is spotted by the
 * browser's speech recognizer (when "wake word" is on); "Sync, open cart" in
 * one breath runs the command straight away. "Stop" while it speaks cuts the
 * reply short but stays awake.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { classify, speak, transcribe, type Speech } from '../voice/api';
import { NoSpeechError, openMic, recordUtterance } from '../voice/recorder';
import { getCreateDraft, type VoiceAction } from '../voice/types';
import { sound } from '../utils/sound';

export type VoiceStatus = 'sleeping' | 'listening' | 'processing' | 'speaking';

export interface VoiceAgentOptions {
  stores: () => { id: string; name: string }[];
  /** Runs the action; may return a reply that replaces the server's (e.g. an AI answer). */
  execute: (action: VoiceAction) => string | null | undefined | Promise<string | null | undefined>;
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

/** Wake word; anything said after it in the same breath is run as the first command. */
export const WAKE = /\b(?:hey,?\s*)?(sync|retail\s*up)\b[\s,.!]*(.*)$/i;
const BARGE_IN = /\b(stop|cancel|quiet|enough)\b/i;
const SLEEP_WORD = /\b(sleep|good ?night)\b/i;
const HANDS_FREE_KEY = 'retailsync_voice_handsfree';
const IDLE_SLEEP_MS = 120_000;

export function useVoiceAgent({ stores, execute }: VoiceAgentOptions) {
  const [status, setStatusState] = useState<VoiceStatus>('sleeping');
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [handsFree, setHandsFreeState] = useState(() => {
    try { return !!Recognizer && localStorage.getItem(HANDS_FREE_KEY) === '1'; } catch { return false; }
  });

  const statusRef = useRef<VoiceStatus>('sleeping');
  const awake = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const speech = useRef<Speech | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const releaseMic = () => { mic.current?.getTracks().forEach((t) => t.stop()); mic.current = null; };
  const lastActive = useRef(0);
  const latest = useRef({ stores, execute });
  latest.current = { stores, execute };

  const setStatus = (s: VoiceStatus) => { statusRef.current = s; setStatusState(s); };

  const say = useCallback(async (text: string) => {
    setReply(text);
    setStatus('speaking');
    speech.current = speak(text);
    await speech.current.done;
    speech.current = null;
  }, []);

  /** Stop speaking only (barge-in); the agent stays awake. */
  const hush = useCallback(() => { speech.current?.stop(); speech.current = null; }, []);

  const sleep = useCallback(async (goodbye?: string) => {
    awake.current = false;
    abort.current?.abort();
    abort.current = null;
    hush();
    releaseMic();
    setLevel(0);
    if (goodbye) await say(goodbye);
    setStatus('sleeping');
  }, [hush, say]);

  /** One command: transcript -> action -> spoken reply. */
  const handle = useCallback(async (text: string, signal: AbortSignal) => {
    setHeard(text || '…');
    if (!text) return say("Sorry, I didn't catch that.");
    setStatus('processing');
    const { action, reply: serverReply } = await classify(text, latest.current.stores(), getCreateDraft());
    if (signal.aborted) return;
    lastActive.current = Date.now();
    if (action.type === 'SLEEP') return sleep(serverReply ?? 'Going to sleep.');
    if (action.type === 'STOP') return;
    const answer = (await latest.current.execute(action)) ?? serverReply;
    if (answer && !signal.aborted) await say(answer);
  }, [say, sleep]);

  /** Keep taking commands until put to sleep. */
  const loop = useCallback(async (first?: string) => {
    lastActive.current = Date.now();
    let firstCommand = first;
    while (awake.current) {
      if (pending.current) await pending.current;
      if (!awake.current) break;
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        if (firstCommand) {
          const text = firstCommand;
          firstCommand = undefined;
          await handle(text, ctrl.signal);
          continue;
        }
        setStatus('listening');
        if (!mic.current || mic.current.getAudioTracks().every((t) => t.readyState === 'ended')) mic.current = await openMic();
        const wav = await recordUtterance({ onLevel: setLevel, signal: ctrl.signal, waitForSpeechMs: 8000, stream: mic.current });
        setStatus('processing');
        const text = await transcribe(wav, ctrl.signal, latest.current.stores().map((s) => s.name));
        if (ctrl.signal.aborted) continue;
        setError(null);
        await handle(text, ctrl.signal);
      } catch (e) {
        if ((e as Error).name === 'AbortError') continue;
        if (e instanceof NoSpeechError) {
          if (Date.now() - lastActive.current > IDLE_SLEEP_MS) await sleep('No one there? Going to sleep. Say Sync to wake me.');
          continue;
        }
        if ((e as Error).name === 'NotAllowedError') {
          setError('Microphone access is blocked. Allow it in your browser to talk to Sync.');
          await sleep();
          break;
        }
        setError((e as Error).message || 'Something went wrong.');
        await new Promise((r) => setTimeout(r, 1000)); // don't spin on a failing network
      } finally {
        if (abort.current === ctrl) abort.current = null;
        setLevel(0);
      }
    }
  }, [handle, sleep]);

  const wake = useCallback((first?: string) => {
    if (awake.current) return;
    awake.current = true;
    setError(null);
    setHeard('');
    setReply('');
    sound.playWhoosh(0.5);
    void loop(first);
  }, [loop]);

  /** Orb tap: wake when asleep, sleep when awake. */
  const toggle = useCallback(() => {
    if (awake.current) void sleep();
    else wake();
  }, [sleep, wake]);

  // Wake word ("Sync"), plus "stop" / "sleep" while the agent is talking, via the browser recognizer.
  useEffect(() => {
    if (!handsFree || !Recognizer) return;
    let alive = true;
    const rec = new Recognizer();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-IN';
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript;
        if (statusRef.current === 'speaking') {
          if (SLEEP_WORD.test(text)) { void sleep(); return; }
          if (BARGE_IN.test(text)) { hush(); return; }
        }
        // Wait for the final result so "Sync, open cart" arrives whole.
        if (!awake.current && r.isFinal) {
          const m = WAKE.exec(text);
          if (m) { wake(m[2]?.trim().length > 1 ? m[2].trim() : undefined); return; }
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        alive = false;
        setError('Microphone access is blocked, so the wake word is off.');
        setHandsFreeState(false);
      }
    };
    // Chrome ends recognition after a while; keep it running.
    rec.onend = () => { if (alive) window.setTimeout(() => { if (alive) try { rec.start(); } catch { /* already started */ } }, 300); };
    try { rec.start(); } catch { /* ignore */ }
    return () => { alive = false; rec.onend = null; rec.abort(); };
  }, [handsFree, wake, sleep, hush]);

  const setHandsFree = useCallback((on: boolean) => {
    setHandsFreeState(on);
    try { localStorage.setItem(HANDS_FREE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  useEffect(() => () => { awake.current = false; abort.current?.abort(); speech.current?.stop(); releaseMic(); }, []);

  /** Speak something outside a command (e.g. "Zenith is live") without the mic hearing it. */
  const announce = useCallback(async (text: string) => {
    const run = (async () => {
      if (statusRef.current === 'listening') abort.current?.abort();
      while (statusRef.current === 'speaking' || statusRef.current === 'processing') await new Promise((r) => setTimeout(r, 150));
      const wasAwake = awake.current;
      await say(text);
      if (!wasAwake && !awake.current) setStatus('sleeping');
    })();
    pending.current = run;
    await run;
    if (pending.current === run) pending.current = null;
  }, [say]);

  return { status, level, heard, reply, error, handsFree, setHandsFree, wakeSupported: !!Recognizer, toggle, say: announce };
}
