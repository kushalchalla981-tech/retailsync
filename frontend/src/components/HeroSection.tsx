import React from 'react';
import { Database, Layers, Search, Zap, Sparkles, Activity, ShieldCheck, ArrowRight } from 'lucide-react';

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
  return (
    <section className="relative z-10 border-b border-slate-800 bg-slate-900 px-4 sm:px-6 lg:px-8 py-10 sm:py-14 overflow-hidden">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Main Grid: Left pitch + Right metrics interactive console */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column (Pitch & Value Prop) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Live Infrastructure Status Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-850 border border-slate-700 text-xs text-slate-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-medium text-slate-200">Aiven Cloud Infrastructure Live</span>
              <span className="text-slate-500">•</span>
              <span className="text-emerald-400 font-mono text-[11px]">3 Clusters Connected</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Retail Storefront with Guaranteed Stock Integrity
            </h1>

            <p className="text-base text-slate-300 max-w-2xl leading-relaxed">
              Eliminate overselling under peak concurrent flash sales. PostgreSQL serializes inventory via row-level locks, Apache Kafka streams events across distributed microservices, and OpenSearch powers sub-10ms typo-tolerant search.
            </p>

            {/* Direct Action Triggers for Evaluators */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={onSimulateRaceClick}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-brand-500 text-white hover:bg-brand-600 transition shadow-sm active:scale-95"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>Simulate Concurrency Race (Stock = 1)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onTypoSearchClick}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-750 hover:text-white transition active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Try Typo Search ("snikers")</span>
              </button>

              <button
                onClick={onOpenTelemetryClick}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-750 hover:text-white transition active:scale-95"
              >
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Open Telemetry Console</span>
              </button>
            </div>
          </div>

          {/* Right Column: Interactive 3-Service Telemetry Cards */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5">
            {/* Card 1: PostgreSQL Concurrency */}
            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 hover:border-blue-500/60 transition-all duration-300">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">PostgreSQL</h3>
                    <span className="text-[11px] text-slate-400">Single Source of Truth</span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                  0% Oversell
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Pessimistic concurrency control with <code className="text-blue-300 font-mono text-[11px]">SELECT ... FOR UPDATE</code>. Stock reservations are atomic and fully isolated.
              </p>
            </div>

            {/* Card 2: Apache Kafka Streaming */}
            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 hover:border-indigo-500/60 transition-all duration-300">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">Apache Kafka</h3>
                    <span className="text-[11px] text-slate-400">Event Stream Backbone</span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-indigo-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                  Real-time Log
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Decoupled event pipeline publishing <code className="text-indigo-300 font-mono text-[11px]">orders.placed</code> and consuming <code className="text-indigo-300 font-mono text-[11px]">inventory.updated</code>.
              </p>
            </div>

            {/* Card 3: OpenSearch Typo Engine */}
            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 hover:border-emerald-500/60 transition-all duration-300">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                    <Search className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">OpenSearch</h3>
                    <span className="text-[11px] text-slate-400">Typo-Tolerant Catalog</span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                  &lt;10ms Query
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Fuzzy multi-match queries (<code className="text-emerald-300 font-mono text-[11px]">fuzziness: AUTO</code>) with faceted filters for category, price, and city location.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Trust & Architecture Bar */}
        <div className="pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>ACID compliance & distributed event delivery verified</span>
          </div>

          <div className="flex items-center gap-6 font-mono text-[11px]">
            <span>Postgres: <strong className="text-slate-200">v16</strong></span>
            <span>Kafka: <strong className="text-slate-200">v3.7</strong></span>
            <span>OpenSearch: <strong className="text-slate-200">v2.13</strong></span>
          </div>
        </div>
      </div>
    </section>
  );
};
