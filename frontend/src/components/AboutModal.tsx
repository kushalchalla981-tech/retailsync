import React from 'react';
import { X, Store, Database, Zap, Search, ShieldCheck, GitBranch, ExternalLink } from 'lucide-react';
import { ThunderLine } from './ThunderLine';
import { sound } from '../utils/sound';

const REPO_URL = 'https://github.com/kushalchalla981-tech/retailsync';
const COMMIT = __COMMIT_SHA__;

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
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

          {/* 3 Services Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#f0e5d8] rounded-2xl p-4 border-2 border-[#1a1918] shadow-pop">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-5 h-5 text-[#ff5c35]" />
                <h4 className="font-mono text-xs font-black uppercase tracking-wider text-[#1a1918]">
                  PostgreSQL
                </h4>
              </div>
              <p className="text-xs text-[#524b44] leading-relaxed">
                Pessimistic row-locking (<code>SELECT ... FOR UPDATE</code>) guarantees 0% oversell during flash sales.
              </p>
            </div>

            <div className="bg-[#f0e5d8] rounded-2xl p-4 border-2 border-[#1a1918] shadow-pop">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-[#ffd600]" />
                <h4 className="font-mono text-xs font-black uppercase tracking-wider text-[#1a1918]">
                  Apache Kafka
                </h4>
              </div>
              <p className="text-xs text-[#524b44] leading-relaxed">
                Real-time event streaming for orders, inventory updates, and live cross-service telemetry.
              </p>
            </div>

            <div className="bg-[#f0e5d8] rounded-2xl p-4 border-2 border-[#1a1918] shadow-pop">
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-5 h-5 text-[#00e5ff]" />
                <h4 className="font-mono text-xs font-black uppercase tracking-wider text-[#1a1918]">
                  OpenSearch
                </h4>
              </div>
              <p className="text-xs text-[#524b44] leading-relaxed">
                Sub-100ms typo-tolerant fuzzy product search synchronized automatically via Kafka consumers.
              </p>
            </div>
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

          <div className="text-center pt-2">
            <button
              onClick={onClose}
              className="bg-[#1a1918] text-white px-6 py-2.5 rounded-full font-mono text-xs font-black uppercase tracking-wider hover:bg-[#ff5c35] transition-colors shadow-pop"
            >
              EXPLORE PLATFORM ➔
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
