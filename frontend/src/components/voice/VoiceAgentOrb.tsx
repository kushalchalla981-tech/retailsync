import React, { useEffect, useRef, useState } from 'react';
import { Mic, X, Radio } from 'lucide-react';
import type { VoiceStatus } from '../../hooks/useVoiceAgent';

interface Props {
  status: VoiceStatus;
  level: number;
  heard: string;
  reply: string;
  error: string | null;
  handsFree: boolean;
  wakeSupported: boolean;
  onToggleHandsFree: (on: boolean) => void;
  onActivate: () => void;
}

const LABEL: Record<VoiceStatus, string> = {
  standby: 'Standby',
  listening: 'Listening…',
  processing: 'Processing…',
  speaking: 'Speaking',
};

/** Live waveform: follows mic level while listening, a soft pulse while thinking or speaking. */
const Wave: React.FC<{ status: VoiceStatus; level: number }> = ({ status, level }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, smooth = 0;
    const draw = (t: number) => {
      const target = status === 'listening' ? levelRef.current : status === 'speaking' ? 0.45 + 0.25 * Math.sin(t / 180) : status === 'processing' ? 0.18 : 0.05;
      smooth += (target - smooth) * 0.25;
      const { width: w, height: h } = c;
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#00e5ff');
      grad.addColorStop(1, '#ff5c35');
      ctx.fillStyle = grad;
      const bars = 28, gap = 3, bw = (w - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        const phase = reduce ? 0 : Math.sin(t / 140 + i * 0.55) * 0.5 + 0.5;
        const bh = Math.max(3, h * smooth * (0.35 + 0.65 * phase));
        ctx.fillRect(i * (bw + gap), (h - bh) / 2, bw, bh);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [status]);
  return <canvas ref={canvas} width={280} height={40} className="w-full h-10" aria-hidden />;
};

export const VoiceAgentOrb: React.FC<Props> = ({ status, level, heard, reply, error, handsFree, wakeSupported, onToggleHandsFree, onActivate }) => {
  const [open, setOpen] = useState(false);
  const active = status !== 'standby';
  const showPanel = open || active || !!error;

  // Auto-collapse a while after the agent goes quiet.
  useEffect(() => {
    if (active || !open) return;
    const t = window.setTimeout(() => setOpen(false), 9000);
    return () => window.clearTimeout(t);
  }, [active, open, heard, reply]);
  useEffect(() => { if (active) setOpen(true); }, [active]);

  const hint = handsFree ? 'Say "Hey Sync"' : 'Tap the orb to talk';

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[115] flex flex-col items-end gap-3 pointer-events-none">
      {showPanel && (
        <section aria-label="Sync voice agent" className="pointer-events-auto w-[min(20rem,calc(100vw-2rem))] bg-[#141312] text-[#f5ebe0] border-3 border-[#1a1918] rounded-2xl shadow-pop-lg overflow-hidden animate-fadeIn">
          <header className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="font-mono text-[11px] font-black uppercase tracking-widest flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${active ? 'bg-[#a7f432] animate-pulse' : 'bg-white/40'}`} aria-hidden />
              <span role="status" aria-live="polite">{active ? LABEL[status] : `Standby · ${hint}`}</span>
            </span>
            <button onClick={() => setOpen(false)} aria-label="Hide voice panel" className="p-1 rounded-full hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
          </header>
          <div className="px-4 pt-3"><Wave status={status} level={level} /></div>
          <div className="px-4 py-3 space-y-2 text-sm min-h-[3rem]" aria-live="polite">
            {heard && <p className="text-white/70"><span className="font-mono text-[10px] uppercase text-[#00e5ff] mr-1.5">You</span>{heard}</p>}
            {reply && <p><span className="font-mono text-[10px] uppercase text-[#ff5c35] mr-1.5">Sync</span>{reply}</p>}
            {error && <p className="text-[#ff9b80]">{error}</p>}
            {!heard && !reply && !error && (
              <p className="text-white/60 text-xs leading-relaxed">Try "Go to CircuitHub", "Open cart", "Search for headphones", "Create a store called Zenith" or "What's the price of sunglasses?"</p>
            )}
          </div>
          <footer className="px-4 py-2.5 border-t border-white/10 flex items-center justify-between gap-2">
            {wakeSupported ? (
              <label className="flex items-center gap-2 font-mono text-[11px] cursor-pointer select-none">
                <input type="checkbox" checked={handsFree} onChange={(e) => onToggleHandsFree(e.target.checked)} className="accent-[#a7f432] w-4 h-4" />
                Hands-free ("Hey Sync")
              </label>
            ) : (
              <span className="font-mono text-[10px] text-white/50">Wake phrase needs Chrome, Edge or Safari</span>
            )}
            <span className="font-mono text-[10px] text-white/40">Gnani voice</span>
          </footer>
        </section>
      )}
      <button
        onClick={() => { setOpen(true); onActivate(); }}
        aria-label={active ? 'Stop the voice agent' : 'Talk to Sync, the voice agent'}
        aria-pressed={active}
        className={`pointer-events-auto relative w-14 h-14 sm:w-16 sm:h-16 rounded-full border-3 border-[#1a1918] shadow-pop flex items-center justify-center text-[#1a1918] transition-transform hover:-translate-y-0.5 active:translate-y-0 bg-[conic-gradient(from_180deg,#00e5ff,#ff5c35,#00e5ff)] ${active ? 'motion-safe:animate-pulse' : ''}`}
      >
        <span className="absolute inset-1.5 rounded-full bg-[#fdfaf6] flex items-center justify-center">
          {status === 'listening' ? <Radio className="w-6 h-6 text-[#ff5c35]" /> : <Mic className="w-6 h-6" />}
        </span>
        {handsFree && !active && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#a7f432] border-2 border-[#1a1918]" aria-hidden title="Hands-free on" />}
      </button>
    </div>
  );
};
