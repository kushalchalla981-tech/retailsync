import React, { useEffect, useState } from 'react';
import { X, Store, Database, Zap, Search, ShieldCheck, GitBranch, ExternalLink } from 'lucide-react';
import { ServiceLedgerModal } from './ServiceLedgerModal';
import type { Service } from '../utils/telemetry';
import { ThunderLine } from './ThunderLine';
import { sound } from '../utils/sound';

const REPO_URL = 'https://github.com/kushalchalla981-tech/retailsync';
const COMMIT = __COMMIT_SHA__;

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Opens this service's ledger when About opens (voice). */
  initialLedger?: Service | null;
  onOpenTour?: () => void;
}

const CARDS: { id: Service; name: string; icon: React.ReactNode; glow: string; text: React.ReactNode }[] = [
  { id: 'postgres', name: 'PostgreSQL', glow: '#ff5c35', icon: <Database className="w-5 h-5 text-[#ff5c35]" />, text: <>Pessimistic row-locking (<code>SELECT ... FOR UPDATE</code>) guarantees 0% oversell during flash sales.</> },
  { id: 'kafka', name: 'Apache Kafka', glow: '#ffd600', icon: <Zap className="w-5 h-5 text-[#ffd600]" />, text: 'Real-time event streaming for orders, inventory updates, and live cross-service telemetry.' },
  { id: 'opensearch', name: 'OpenSearch', glow: '#00e5ff', icon: <Search className="w-5 h-5 text-[#00e5ff]" />, text: 'Typo-tolerant fuzzy product search, kept in sync with stock by Kafka consumers.' },
];

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, initialLedger, onOpenTour }) => {
  const [ledger, setLedger] = useState<Service | null>(null);
  // Voice: "Show Kafka ledger" opens About straight onto that ledger.
  useEffect(() => { if (isOpen && initialLedger) setLedger(initialLedger); }, [isOpen, initialLedger]);
  useEffect(() => { if (!isOpen) setLedger(null); }, [isOpen]);

  useEffect(() => {
    if (!isOpen || ledger !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sound.playWhoosh(0.8);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, ledger, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#1a1918]/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="fixed inset-0 -z-10" onClick={onClose} />

      <div 
        className="relative w-full max-w-2xl bg-[#fdfaf6] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg overflow-hidden my-auto max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#ffd600] px-6 py-4 border-b-4 border-[#1a1918] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-[#1a1918]" />
            <h3 className="font-mono text-sm font-black uppercase tracking-wider text-[#1a1918]">
              ABOUT RETAILSYNC PLATFORM
            </h3>
          </div>
          <button
            onClick={() => {
              sound.playWhoosh(0.8);
              onClose();
            }}
            className="p-1.5 rounded-full bg-[#1a1918] text-white hover:bg-[#ff5c35] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 space-y-6 overflow-y-auto">
          <div>
            <span className="font-mono text-xs font-bold uppercase text-[#ff5c35]">
              MULTI-TENANT E-COMMERCE INFRASTRUCTURE
            </span>
            <h2 className="font-black text-3xl uppercase tracking-tighter text-[#1a1918] mt-1">
              BUILD STORES. POWER SALES.
            </h2>
            <ThunderLine color="#ff5c35" className="w-48 h-3 my-2" />
            <p className="text-[#3c3732] text-sm md:text-base leading-relaxed mt-2">
              RetailSync is a high-performance e-commerce platform where merchants can launch modern online storefronts powered by real-time cloud infrastructure.
            </p>
          </div>

          {/* 3 Services Grid: each opens its live ledger */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {CARDS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { sound.playWhoosh(0.6); setLedger(c.id); }}
                className="group text-left bg-[#f0e5d8] rounded-2xl p-4 border-2 border-[#1a1918] shadow-pop transition-all hover:-translate-y-1 focus-visible:-translate-y-1 focus:outline-none"
                style={{ ['--glow' as string]: c.glow }}
              >
                <div className="flex items-center gap-2 mb-2">
                  {c.icon}
                  <h4 className="font-mono text-xs font-black uppercase tracking-wider text-[#1a1918]">{c.name}</h4>
                </div>
                <p className="text-xs text-[#524b44] leading-relaxed">{c.text}</p>
                <span className="mt-3 inline-block font-mono text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-[#1a1918] text-[#fdfaf6] group-hover:shadow-[0_0_14px_var(--glow)] group-focus-visible:shadow-[0_0_14px_var(--glow)] transition-shadow">
                  Click to view live ledger ↗
                </span>
              </button>
            ))}
          </div>

          {/* Quick Guide */}
          <div className="bg-[#f0e5d8] rounded-2xl p-5 border-2 border-[#1a1918] space-y-3 shadow-pop">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#a7f432]" />
              <h4 className="font-mono text-xs font-black uppercase tracking-wider text-[#1a1918]">
                SECURE AUTH & PAYMENTS
              </h4>
            </div>
            
            <p className="text-xs md:text-sm text-[#4a453f]">
              Protected at the edge with Clerk authentication, role intent routing (Store Owner vs Buyer), and instant checkout via Razorpay.
            </p>
          </div>

          {/* Source code */}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-[#1a1918] text-white rounded-2xl p-5 border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 transition-transform"
          >
            <span className="p-2.5 bg-[#a7f432] rounded-xl border-2 border-[#fdfaf6]"><GitBranch className="w-5 h-5 text-[#1a1918]" /></span>
            <span className="flex-1 min-w-0">
              <span className="block font-mono text-xs font-black uppercase tracking-wider text-[#a7f432]">Open source on GitHub</span>
              <span className="block font-bold text-sm truncate">kushalchalla981-tech/retailsync</span>
              {COMMIT && <span className="block font-mono text-[11px] text-white/60">Running commit {COMMIT.slice(0, 7)}</span>}
            </span>
            <ExternalLink className="w-4 h-4 shrink-0" />
          </a>

          <div className="flex items-center justify-center gap-3 pt-2">
            {onOpenTour && (
              <button
                onClick={() => {
                  onClose();
                  onOpenTour();
                }}
                className="bg-[#f0e5d8] text-[#1a1918] px-5 py-2.5 rounded-full font-mono text-xs font-black uppercase tracking-wider hover:bg-[#a7f432] transition-colors border-2 border-[#1a1918] shadow-pop"
              >
                START GUIDE 🧭
              </button>
            )}
            <button
              onClick={onClose}
              className="bg-[#1a1918] text-white px-6 py-2.5 rounded-full font-mono text-xs font-black uppercase tracking-wider hover:bg-[#ff5c35] transition-colors shadow-pop"
            >
              EXPLORE PLATFORM ➔
            </button>
          </div>
        </div>
      </div>
      <ServiceLedgerModal service={ledger} onClose={() => setLedger(null)} />
    </div>
  );
};
