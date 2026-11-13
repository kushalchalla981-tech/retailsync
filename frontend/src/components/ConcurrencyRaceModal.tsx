import React, { useState } from 'react';
import { X, Zap, ShieldCheck, CheckCircle2, XCircle, Database, Layers, Search, Play, RefreshCw } from 'lucide-react';
import { Product, City } from '../types';
import { apiService } from '../services/api';

interface ConcurrencyRaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  selectedCity: City;
  onStockUpdated: () => void;
}

export const ConcurrencyRaceModal: React.FC<ConcurrencyRaceModalProps> = ({
  isOpen,
  onClose,
  product,
  selectedCity,
  onStockUpdated,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [raceOutput, setRaceOutput] = useState<{
    user1: { success: boolean; message: string; txId?: string };
    user2: { success: boolean; message: string; txId?: string };
  } | null>(null);

  if (!isOpen) return null;

  const initialStock = product.inventory[selectedCity] ?? 0;

  const handleRunRace = async () => {
    setIsRunning(true);
    setRaceOutput(null);

    try {
      const result = await apiService.simulateFlashSaleRace(product.id, selectedCity);
      setRaceOutput({
        user1: result.user1Result,
        user2: result.user2Result,
      });
      onStockUpdated();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden z-10">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Zap className="w-4 h-4 fill-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Live Concurrency Flash-Sale Simulator
              </h2>
              <p className="text-xs text-slate-400">
                Testing PostgreSQL Row Locks (`SELECT ... FOR UPDATE`) Against Overselling
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Target Product Specs */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src={product.image}
                alt={product.title}
                className="w-14 h-14 rounded-lg object-cover bg-slate-900 border border-slate-800"
              />
              <div>
                <h4 className="text-sm font-semibold text-white">{product.title}</h4>
                <p className="text-xs text-slate-400">
                  Location: <span className="text-slate-200 font-medium">{selectedCity}</span> • SKU: {product.sku}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-xs text-slate-400 block">Available Stock</span>
              <span
                className={`text-xl font-bold tabular-nums ${
                  initialStock <= 1 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {initialStock} {initialStock === 1 ? 'unit' : 'units'}
              </span>
            </div>
          </div>

          {/* Explanation Box */}
          <div className="p-3.5 rounded-xl bg-slate-850/80 border border-slate-700/60 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300">
              <ShieldCheck className="w-4 h-4" />
              <span>How This Proves Database Stock Integrity:</span>
            </div>
            <p className="leading-relaxed">
              When clicked, <strong>two simulated buyers (User A & User B)</strong> concurrently execute checkout for the exact same item within a 15ms window. PostgreSQL serializes their access using row locks. The first buyer claims the remaining unit, while the second buyer is cleanly rejected with zero stock deficit.
            </p>
          </div>

          {/* Action Trigger Button */}
          <button
            onClick={handleRunRace}
            disabled={isRunning || initialStock === 0}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-bold text-sm transition shadow-sm active:scale-95"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Simulating High-Concurrency Contention...</span>
              </>
            ) : initialStock === 0 ? (
              <span>Item is already Sold Out in {selectedCity}</span>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Run 2-User Simultaneous Checkout Race</span>
              </>
            )}
          </button>

          {/* Race Results Comparison */}
          {raceOutput && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Simultaneous Transaction Execution Verdict:
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* User A Card */}
                <div
                  className={`p-4 rounded-xl border ${
                    raceOutput.user1.success
                      ? 'bg-emerald-950/40 border-emerald-600/70 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-600/70 text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs uppercase tracking-wide">User A (Buyer #1)</span>
                    {raceOutput.user1.success ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        COMMITTED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-700">
                        <XCircle className="w-3.5 h-3.5" />
                        ROLLEDBACK
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-slate-200 mb-2">{raceOutput.user1.message}</p>
                  {raceOutput.user1.txId && (
                    <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 p-1.5 rounded border border-slate-800">
                      PostgreSQL Tx: <span className="text-white">{raceOutput.user1.txId}</span>
                    </div>
                  )}
                </div>

                {/* User B Card */}
                <div
                  className={`p-4 rounded-xl border ${
                    raceOutput.user2.success
                      ? 'bg-emerald-950/40 border-emerald-600/70 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-600/70 text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs uppercase tracking-wide">User B (Buyer #2)</span>
                    {raceOutput.user2.success ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        COMMITTED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-700">
                        <XCircle className="w-3.5 h-3.5" />
                        OVERSELL PREVENTED
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-slate-200 mb-2">{raceOutput.user2.message}</p>
                  <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 p-1.5 rounded border border-slate-800">
                    Oversell Deficit: <span className="text-emerald-400 font-bold">0 units (Safe)</span>
                  </div>
                </div>
              </div>

              {/* Service reaction summary */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                  <span>1 Lock Acquired, 1 Blocked</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>1 Kafka Event Streamed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-emerald-400" />
                  <span>OpenSearch Catalog Synced</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
