import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Sparkles, Compass, CheckCircle2, Search, Database, Zap, Store, ExternalLink } from 'lucide-react';
import { ThunderLine } from './ThunderLine';
import { sound } from '../utils/sound';

interface StartGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLedger: (service: 'postgres' | 'kafka' | 'opensearch') => void;
  onOpenSearch: () => void;
  onOpenCreator: () => void;
}

interface TourStep {
  title: string;
  badge: string;
  icon: React.ReactNode;
  summary: string;
  bullets: string[];
  accentColor: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const StartGuideModal: React.FC<StartGuideModalProps> = ({
  isOpen,
  onClose,
  onOpenLedger,
  onOpenSearch,
  onOpenCreator,
}) => {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowRight' && step < 5) {
        setStep((s) => s + 1);
        sound.playWhoosh(1.1);
      } else if (e.key === 'ArrowLeft' && step > 1) {
        setStep((s) => s - 1);
        sound.playWhoosh(0.9);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, step, onClose]);

  if (!isOpen) return null;

  const STEPS: TourStep[] = [
    {
      title: '3D Interactive Storefronts',
      badge: 'CAROUSEL & CARDS',
      icon: <Store className="w-6 h-6 text-[#ff5c35]" />,
      summary:
        'Explore multi-tenant storefronts on an interactive 3D WebGL cylinder. Each card features real catalog items, authentic category artwork, live inventory counts, and holographic foil.',
      bullets: [
        'Drag horizontally or swipe on mobile to spin through stores.',
        'Hover over any card to trigger dynamic holographic chromatic dispersion.',
        'Click any card or tap "EXPLORE STORE" to view full catalog and direct checkout.',
      ],
      accentColor: '#ff5c35',
    },
    {
      title: 'Universal OpenSearch Engine',
      badge: 'SUB-100MS FUZZY SEARCH',
      icon: <Search className="w-6 h-6 text-[#00e5ff]" />,
      summary:
        'Typo-tolerant fuzzy product search across every store on the platform. Includes live external price comparisons against Amazon and Flipkart, automatically sorted ascending by cost.',
      bullets: [
        'Press ⌘K (or Ctrl+K) anywhere on the platform to open instant search.',
        'Live stock availability and store badges shown for each search result.',
        'One-click add to cart directly from the search modal.',
      ],
      accentColor: '#00e5ff',
      action: {
        label: 'Try Universal Search (⌘K)',
        onClick: () => {
          onClose();
          onOpenSearch();
        },
      },
    },
    {
      title: 'Instant Merchant Store Builder',
      badge: 'ZERO-APPROVAL LAUNCH',
      icon: <Zap className="w-6 h-6 text-[#ffd600]" />,
      summary:
        'Anyone can build and launch a branded storefront in 60 seconds with custom palettes, catalog management, and zero approval gates.',
      bullets: [
        'Choose from curated presets (Aurora, Sunset, Forest, Midnight, Obsidian).',
        'Custom catalogs with automated safety baseline (23) and top-line (129) stock caps.',
        'Newly built stores instantly appear on the homepage 3D carousel.',
      ],
      accentColor: '#ffd600',
      action: {
        label: 'Open Store Creator Wizard',
        onClick: () => {
          onClose();
          onOpenCreator();
        },
      },
    },
    {
      title: 'Real-Time Aiven Cloud Service Ledgers',
      badge: 'POSTGRESQL · KAFKA · OPENSEARCH',
      icon: <Database className="w-6 h-6 text-[#a7f432]" />,
      summary:
        'Inspect the real-time cloud backbone of RetailSync! Every checkout decrements PostgreSQL stock under SELECT ... FOR UPDATE locks, publishes to Apache Kafka, and synchronizes OpenSearch.',
      bullets: [
        'Live SSE telemetry stream (/api/telemetry/stream) powers real-time stock sync across devices.',
        'Zero-oversell guarantee verified by row-level locking.',
        'Click any service below to open its live streaming ledger board right now:',
      ],
      accentColor: '#a7f432',
    },
    {
      title: 'Hands-Free Voice Intelligence',
      badge: 'LOCAL GEMMA 3:4B + GNANI VOICE',
      icon: <Sparkles className="w-6 h-6 text-[#7b4eff]" />,
      summary:
        'Navigate RetailSync hands-free! Powered by Gnani Prisma (STT), Gnani Timbre (TTS), and your local Gemma 3:4B model running on Ollama.',
      bullets: [
        'Say "Hey Sync" or "Retail Up" to wake the agent, or tap the floating orb.',
        'Ask about catalog items, prices, low stock, or platform architecture.',
        'Commands like "Next store", "Open cart", or "Create store" execute immediately.',
      ],
      accentColor: '#7b4eff',
    },
  ];

  const current = STEPS[step - 1];

  const goToNext = () => {
    if (step < STEPS.length) {
      setStep((s) => s + 1);
      sound.playWhoosh(1.1);
    } else {
      sound.playCardSelect();
      onClose();
    }
  };

  const goToPrev = () => {
    if (step > 1) {
      setStep((s) => s - 1);
      sound.playWhoosh(0.9);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-[#1a1918]/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="fixed inset-0 -z-10" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl bg-[#fdfaf6] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg overflow-hidden my-auto flex flex-col animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-[#1a1918] text-white px-6 py-4 flex items-center justify-between border-b-4 border-[#1a1918]">
          <div className="flex items-center gap-2.5">
            <Compass className="w-5 h-5 text-[#a7f432] animate-spin-slow" />
            <span className="font-mono text-xs font-black uppercase tracking-wider text-[#a7f432]">
              RETAILSYNC START GUIDE
            </span>
            <span className="bg-white/20 text-white font-mono text-[10px] font-black px-2 py-0.5 rounded-full">
              STEP {step} OF {STEPS.length}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close tour"
            className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tour Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Step Category Badge */}
          <div className="flex items-center justify-between">
            <span
              className="font-mono text-xs font-extrabold uppercase px-3 py-1 rounded-full border border-[#1a1918] shadow-pop"
              style={{ backgroundColor: `${current.accentColor}25`, color: '#1a1918' }}
            >
              {current.badge}
            </span>
            {/* Step navigation dots */}
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setStep(i + 1);
                    sound.playCardSelect();
                  }}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    step === i + 1 ? 'w-6 bg-[#1a1918]' : 'bg-[#1a1918]/25 hover:bg-[#1a1918]/60'
                  }`}
                  aria-label={`Jump to step ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Title & Icon */}
          <div>
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl border-3 border-[#1a1918] shadow-pop flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${current.accentColor}30` }}
              >
                {current.icon}
              </div>
              <h2 className="font-black text-2xl sm:text-3xl uppercase tracking-tight text-[#1a1918]">
                {current.title}
              </h2>
            </div>
            <ThunderLine color={current.accentColor} className="w-48 h-3 mt-2" />
          </div>

          {/* Summary */}
          <p className="text-sm sm:text-base font-medium text-[#4a423a] leading-relaxed">
            {current.summary}
          </p>

          {/* Bullet Highlights */}
          <div className="bg-[#f4f0ed] p-4 sm:p-5 rounded-2xl border-2 border-[#1a1918]/20 space-y-2.5">
            {current.bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#ff5c35] shrink-0 mt-0.5" />
                <span className="text-xs sm:text-sm font-medium text-[#2d2823] leading-snug">{b}</span>
              </div>
            ))}
          </div>

          {/* Step 4 Special: Interactive Service Ledger Launchers */}
          {step === 4 && (
            <div className="space-y-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#1a1918]/70 block">
                Open Aiven Cloud Service Ledger Boards:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  onClick={() => {
                    sound.playCardSelect();
                    onClose();
                    onOpenLedger('postgres');
                  }}
                  className="flex items-center justify-center gap-2 p-3 bg-white rounded-xl border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-transform font-mono text-xs font-black uppercase text-[#1a1918] hover:bg-[#ff5c35] hover:text-white"
                >
                  <Database className="w-4 h-4 text-[#ff5c35] group-hover:text-white" />
                  <span>PostgreSQL</span>
                </button>
                <button
                  onClick={() => {
                    sound.playCardSelect();
                    onClose();
                    onOpenLedger('kafka');
                  }}
                  className="flex items-center justify-center gap-2 p-3 bg-white rounded-xl border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-transform font-mono text-xs font-black uppercase text-[#1a1918] hover:bg-[#ffd600] hover:text-[#1a1918]"
                >
                  <Zap className="w-4 h-4 text-[#ffd600]" />
                  <span>Apache Kafka</span>
                </button>
                <button
                  onClick={() => {
                    sound.playCardSelect();
                    onClose();
                    onOpenLedger('opensearch');
                  }}
                  className="flex items-center justify-center gap-2 p-3 bg-white rounded-xl border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-transform font-mono text-xs font-black uppercase text-[#1a1918] hover:bg-[#00e5ff] hover:text-[#1a1918]"
                >
                  <Search className="w-4 h-4 text-[#00e5ff]" />
                  <span>OpenSearch</span>
                </button>
              </div>
            </div>
          )}

          {/* Optional Direct Action Button for other steps */}
          {current.action && step !== 4 && (
            <div>
              <button
                onClick={() => {
                  sound.playCardSelect();
                  current.action!.onClick();
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1a1918] text-white rounded-xl font-mono text-xs uppercase font-extrabold shadow-pop hover:bg-[#ff5c35] transition-colors"
              >
                <span>{current.action.label}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Footer Navigation Strip */}
        <div className="bg-[#f4f0ed] px-6 py-4 border-t-3 border-[#1a1918] flex items-center justify-between">
          <button
            onClick={() => {
              sound.playWhoosh(0.8);
              onClose();
            }}
            className="font-mono text-xs font-extrabold uppercase text-[#6b6257] hover:text-[#1a1918] transition-colors"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2.5">
            {step > 1 && (
              <button
                onClick={goToPrev}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-[#1a1918] bg-white font-mono text-xs font-extrabold uppercase text-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}

            <button
              onClick={goToNext}
              className="flex items-center gap-1.5 px-6 py-2 rounded-xl border-2 border-[#1a1918] bg-[#ff5c35] font-mono text-xs font-black uppercase text-white shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-all hover:bg-[#1a1918]"
            >
              <span>{step === STEPS.length ? 'Got It!' : 'Next'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
