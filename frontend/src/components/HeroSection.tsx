import React, { useState } from 'react';
import { Database, Layers, Search, Zap, Sparkles, Activity, ArrowRight, Play } from 'lucide-react';

interface HeroSectionProps {
  onSimulateRaceClick: () => void;
  onTypoSearchClick: () => void;
  onOpenTelemetryClick: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onSimulateRaceClick,
  onTypoSearchClick,
  onOpenTelemetryClick,
}) => {
  const [activePipelineStep, setActivePipelineStep] = useState<number | null>(null);

  const triggerPipelineAnimation = () => {
    setActivePipelineStep(1);
    setTimeout(() => setActivePipelineStep(2), 350);
    setTimeout(() => setActivePipelineStep(3), 700);
    setTimeout(() => setActivePipelineStep(4), 1050);
    setTimeout(() => {
      setActivePipelineStep(null);
      onSimulateRaceClick();
    }, 1400);
  };

  return (
    <section className="relative z-10 border-b border-slate-800 bg-slate-900 px-4 sm:px-6 lg:px-8 py-10 sm:py-16 overflow-hidden">
      <div className="max-w-7xl mx-auto space-y-10">
        {/* Main Hero Header */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Heading, Subtitle & Action Triggers */}
          <div className="lg:col-span-7 space-y-5">
            {/* Live Infrastructure Status Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-850 border border-slate-750 text-xs text-slate-300">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-white">Aiven Managed Cloud Active</span>
              <span className="text-slate-500">•</span>
              <span className="text-emerald-400 font-mono text-[11px]">PostgreSQL + Kafka + OpenSearch</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.15]">
              Retail Storefront with Guaranteed Stock Integrity
            </h1>

            <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
              Zero overselling under high-concurrency flash sales. PostgreSQL serializes purchase transactions via pessimistic row locks, Apache Kafka streams events across decoupled microservices, and OpenSearch powers instant typo-tolerant product search.
            </p>

            {/* Direct Action Triggers */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={triggerPipelineAnimation}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold bg-brand-500 text-white hover:bg-brand-600 transition shadow-sm active:scale-95"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>Simulate 2-Buyer Concurrency Flash Sale</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onTypoSearchClick}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-750 hover:text-white transition active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Try Typo Search ("snikers")</span>
              </button>

              <button
                onClick={onOpenTelemetryClick}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-750 hover:text-white transition active:scale-95"
              >
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Open Live Console</span>
              </button>
            </div>
          </div>

          {/* Right Column: Live Service Cards & Proof Metrics */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3.5">
            {/* Card 1: PostgreSQL */}
            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 hover:border-blue-500/80 transition-all duration-200">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">PostgreSQL</h3>
                    <span className="text-[11px] text-slate-400">Single Source of Truth</span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-750">
                  0% Oversell
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Pessimistic locking with <code className="text-blue-300 font-mono text-[11px]">SELECT ... FOR UPDATE</code> serializes checkouts to prevent race conditions.
              </p>
            </div>

            {/* Card 2: Kafka */}
            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 hover:border-indigo-500/80 transition-all duration-200">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">Apache Kafka</h3>
                    <span className="text-[11px] text-slate-400">Event Stream Backbone</span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-indigo-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-750">
                  Real-time Log
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Decoupled pipeline producing <code className="text-indigo-300 font-mono text-[11px]">orders.placed</code> and consuming <code className="text-indigo-300 font-mono text-[11px]">inventory.updated</code> events.
              </p>
            </div>

            {/* Card 3: OpenSearch */}
            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 hover:border-emerald-500/80 transition-all duration-200">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                    <Search className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">OpenSearch</h3>
                    <span className="text-[11px] text-slate-400">Typo-Tolerant Engine</span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-750">
                  &lt;10ms Query
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Fuzzy multi-match search (<code className="text-emerald-300 font-mono text-[11px]">fuzziness: AUTO</code>) with faceted filters for category, price, and city inventory.
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Live Architecture Dataflow Pipeline */}
        <div className="pt-6 border-t border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-500"></span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                End-to-End Reactive Dataflow Architecture
              </h2>
            </div>
            <button
              onClick={triggerPipelineAnimation}
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1 transition"
            >
              <Play className="w-3 h-3 fill-brand-400" />
              <span>Simulate Live Event Pulse</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Step 1 */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                activePipelineStep === 1
                  ? 'bg-brand-950 border-brand-500 shadow-glow-brand scale-[1.02]'
                  : 'bg-slate-850 border-slate-750'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono text-slate-400">Step 1</span>
                <span className="text-xs font-bold text-white">Customer Checkout</span>
              </div>
              <p className="text-xs text-slate-300">
                Customer places order in Bangalore, Mumbai, or Delhi store.
              </p>
            </div>

            {/* Step 2 */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                activePipelineStep === 2
                  ? 'bg-blue-950 border-blue-500 scale-[1.02]'
                  : 'bg-slate-850 border-slate-750'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono text-blue-400">Step 2: PostgreSQL</span>
                <span className="text-xs font-bold text-blue-300">Row-Level Lock</span>
              </div>
              <p className="text-xs text-slate-300">
                <code className="text-blue-300 font-mono text-[11px]">SELECT ... FOR UPDATE</code> locks stock row, preventing concurrent oversells.
              </p>
            </div>

            {/* Step 3 */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                activePipelineStep === 3
                  ? 'bg-indigo-950 border-indigo-500 scale-[1.02]'
                  : 'bg-slate-850 border-slate-750'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono text-indigo-400">Step 3: Kafka</span>
                <span className="text-xs font-bold text-indigo-300">Event Streamed</span>
              </div>
              <p className="text-xs text-slate-300">
                Emits <code className="text-indigo-300 font-mono text-[11px]">orders.placed</code>; consumer dispatches <code className="text-indigo-300 font-mono text-[11px]">inventory.updated</code>.
              </p>
            </div>

            {/* Step 4 */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                activePipelineStep === 4
                  ? 'bg-emerald-950 border-emerald-500 scale-[1.02]'
                  : 'bg-slate-850 border-slate-750'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono text-emerald-400">Step 4: OpenSearch</span>
                <span className="text-xs font-bold text-emerald-300">Real-Time Sync</span>
              </div>
              <p className="text-xs text-slate-300">
                Consumer updates OpenSearch index within &lt;10ms. Search results reflect live availability.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
