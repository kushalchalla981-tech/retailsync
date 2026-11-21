import React from 'react';
import { ArrowRight } from 'lucide-react';
import { DemoStore } from '../data/stores';

/** 2D home for browsers that cannot run the WebGL carousel. */
export const StoreGrid: React.FC<{ stores: DemoStore[]; onOpen: (index: number) => void }> = ({ stores, onOpen }) => (
  <div className="fixed inset-0 overflow-y-auto pt-28 pb-40 px-4 sm:px-8">
    <div className="max-w-6xl mx-auto">
      <h1 className="font-black text-3xl sm:text-5xl uppercase tracking-tighter text-[#1a1918] mb-6">Explore stores</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {stores.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onOpen(i)}
            className="text-left rounded-3xl border-4 border-[#1a1918] shadow-pop overflow-hidden bg-[#fdfaf6] hover:-translate-y-1 transition-transform"
          >
            <div className="h-36 flex items-center justify-center text-6xl border-b-4 border-[#1a1918]" style={{ background: `linear-gradient(135deg, ${s.primaryColor}, ${s.accentColor})` }}>
              <span aria-hidden>{s.symbol}</span>
            </div>
            <div className="p-5 space-y-1">
              <span className="font-mono text-[11px] font-black uppercase tracking-widest text-[#ff5c35]">{s.category}</span>
              <h2 className="font-black text-2xl uppercase tracking-tight text-[#1a1918]">{s.name}</h2>
              <p className="text-sm text-[#524b44]">{s.tagline}</p>
              <span className="inline-flex items-center gap-1.5 pt-2 font-mono text-xs font-black uppercase tracking-wider text-[#1a1918]">
                Open store <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  </div>
);
