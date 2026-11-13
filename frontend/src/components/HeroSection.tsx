import React, { useState } from 'react';
import { Zap, Sparkles, Activity, ArrowRight, ShieldCheck, Play } from 'lucide-react';
import { Product, City } from '../types';

interface HeroSectionProps {
  onSimulateRaceClick: (product: Product) => void;
  onTypoSearchClick: () => void;
  onOpenTelemetryClick: () => void;
  spotlightProduct: Product;
  selectedCity: City;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onSimulateRaceClick,
  onTypoSearchClick,
  onOpenTelemetryClick,
  spotlightProduct,
  selectedCity,
}) => {
  const [activePipelineStep, setActivePipelineStep] = useState<number | null>(null);

  const handlePulseAndRace = () => {
    setActivePipelineStep(1);
    setTimeout(() => setActivePipelineStep(2), 300);
    setTimeout(() => setActivePipelineStep(3), 600);
    setTimeout(() => setActivePipelineStep(4), 900);
    setTimeout(() => {
      setActivePipelineStep(null);
      onSimulateRaceClick(spotlightProduct);
    }, 1200);
  };

  const spotlightStock = spotlightProduct.inventory[selectedCity] ?? 0;

  return (
    <section className="relative z-10 border-b border-slate-800/80 bg-[#070A12] px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      <div className="max-w-7xl mx-auto space-y-10">
        {/* Main Split Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Bold Editorial Pitch */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-slate-200">AIVEN CLUSTER ONLINE</span>
              <span className="text-slate-600">|</span>
              <span className="text-brand-400">P1 HACKATHON CORE</span>
            </div>

            <div className="space-y-3">
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white uppercase leading-[1.08]">
                Precision Commerce. <br />
                <span className="text-brand-500">Zero Overselling.</span>
              </h1>
              <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
                When two buyers checkout the last item simultaneously, conventional stores oversell. RetailSync locks inventory in PostgreSQL via <code className="text-blue-400 font-mono text-xs">SELECT ... FOR UPDATE</code>, streams telemetry through Apache Kafka, and synchronizes OpenSearch under 10ms.
              </p>
            </div>

            {/* Direct Action Triggers */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={handlePulseAndRace}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold bg-brand-500 text-white hover:bg-brand-600 transition shadow-sm active:scale-95"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>Simulate 2-Buyer Concurrency Race</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onTypoSearchClick}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-slate-900 text-slate-200 border border-slate-800 hover:border-slate-700 hover:text-white transition active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Test Typo Engine ("snikers")</span>
              </button>

              <button
                onClick={onOpenTelemetryClick}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-slate-900 text-slate-200 border border-slate-800 hover:border-slate-700 hover:text-white transition active:scale-95"
              >
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Open Engine Console</span>
              </button>
            </div>

            {/* Architecture Metrics Line */}
            <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-6 text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Oversell Deficit: <strong className="text-emerald-400">0.00%</strong></span>
              </div>
              <div>
                <span>Lock Latency: <strong className="text-white">1.8ms</strong></span>
              </div>
              <div>
                <span>Kafka Event Lag: <strong className="text-indigo-400">0 msg</strong></span>
              </div>
              <div>
                <span>OpenSearch: <strong className="text-white">&lt;10ms</strong></span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Spotlight Drop Item Card */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden p-6 space-y-5">
              {/* Card Header */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  HIGH-CONTENTION SPOTLIGHT
                </span>
                <span className="font-mono text-[11px] text-amber-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  STOCK: {spotlightStock} UNIT IN {selectedCity.toUpperCase()}
                </span>
              </div>

              {/* Spotlight Imagery */}
              <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                <img
                  src={spotlightProduct.image}
                  alt={spotlightProduct.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs">
                  <span className="bg-black/70 px-2 py-1 rounded backdrop-blur font-mono text-[11px]">
                    SKU: {spotlightProduct.sku}
                  </span>
                  <span className="bg-brand-500 font-bold px-2 py-1 rounded font-mono text-xs">
                    ₹{spotlightProduct.price.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Spotlight Meta */}
              <div>
                <h3 className="font-display font-bold text-base text-white">
                  {spotlightProduct.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Configured with single-unit stock in {selectedCity} to verify PostgreSQL row-level locks under simultaneous checkouts.
                </p>
              </div>

              {/* Action Trigger directly on Spotlight */}
              <button
                onClick={() => onSimulateRaceClick(spotlightProduct)}
                disabled={spotlightStock === 0}
                className="w-full py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
              >
                <Zap className="w-4 h-4 fill-amber-400" />
                <span>
                  {spotlightStock === 0
                    ? `Item Sold Out in ${selectedCity} (Oversell Prevented)`
                    : `Simulate 2-Buyer Flash Sale on This Item`}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Architecture Dataflow Visualizer */}
        <div className="pt-8 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-brand-500"></span>
              <span className="font-bold uppercase tracking-wider">Aiven Reactive Dataflow Pipeline</span>
            </div>
            <button
              onClick={handlePulseAndRace}
              className="text-xs font-mono text-brand-400 hover:text-brand-300 flex items-center gap-1 transition"
            >
              <Play className="w-3 h-3 fill-brand-400" />
              <span>Simulate Event Pulse</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
            {/* Step 1 */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                activePipelineStep === 1
                  ? 'bg-brand-500/20 border-brand-500 text-brand-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <div className="text-[10px] text-slate-500 uppercase mb-1">01 // INGRESS</div>
              <div className="font-bold text-white mb-0.5">Order Checkout</div>
              <p className="text-[11px] text-slate-400 font-sans">
                Cart submission triggered from storefront.
              </p>
            </div>

            {/* Step 2 */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                activePipelineStep === 2
                  ? 'bg-blue-500/20 border-blue-500 text-blue-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <div className="text-[10px] text-blue-400 uppercase mb-1">02 // POSTGRESQL</div>
              <div className="font-bold text-white mb-0.5">SELECT FOR UPDATE</div>
              <p className="text-[11px] text-slate-400 font-sans">
                Pessimistic lock holds row; serializes order.
              </p>
            </div>

            {/* Step 3 */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                activePipelineStep === 3
                  ? 'bg-indigo-500/20 border-indigo-500 text-indigo-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <div className="text-[10px] text-indigo-400 uppercase mb-1">03 // KAFKA</div>
              <div className="font-bold text-white mb-0.5">orders.placed</div>
              <p className="text-[11px] text-slate-400 font-sans">
                Event stream emits immutable audit log.
              </p>
            </div>

            {/* Step 4 */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                activePipelineStep === 4
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <div className="text-[10px] text-emerald-400 uppercase mb-1">04 // OPENSEARCH</div>
              <div className="font-bold text-white mb-0.5">Index Synced</div>
              <p className="text-[11px] text-slate-400 font-sans">
                Fuzzy catalog reflects real-time stock.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
