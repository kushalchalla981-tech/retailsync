import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, Database, Layers, Search, ArrowRight, Loader2 } from 'lucide-react';
import { CartItem, City, Order } from '../types';
import { apiService } from '../services/api';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  selectedCity: City;
  onOrderSuccess: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  selectedCity,
  onOrderSuccess,
}) => {
  const [customerName, setCustomerName] = useState('Priya Patel');
  const [customerEmail, setCustomerEmail] = useState('priya.patel@example.com');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  if (!isOpen) return null;

  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  const handleExecuteCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);
    setProcessStep(1); // PostgreSQL Row Lock

    try {
      // Step 1: PostgreSQL lock
      await new Promise((r) => setTimeout(r, 200));
      setProcessStep(2); // PostgreSQL Commit

      // Step 2: Call atomic checkout API
      const result = await apiService.checkout({
        customerName,
        customerEmail,
        city: selectedCity,
        items,
      });

      if (!result.success) {
        setError(result.error || 'Checkout failed due to stock contention');
        setIsProcessing(false);
        setProcessStep(0);
        return;
      }

      setProcessStep(3); // Kafka Producer
      await new Promise((r) => setTimeout(r, 200));

      setProcessStep(4); // OpenSearch Sync
      await new Promise((r) => setTimeout(r, 200));

      setCompletedOrder(result.order!);
      setIsProcessing(false);
      onOrderSuccess(result.order!);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during checkout');
      setIsProcessing(false);
      setProcessStep(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden z-10">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white">
              {completedOrder ? 'Order Confirmed!' : 'Secure Storefront Checkout'}
            </h2>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
              {selectedCity}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {completedOrder ? (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-glow-emerald">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">Transaction Successfully Committed</h3>
                <p className="text-xs text-slate-400 mt-1">
                  PostgreSQL row locks released; Kafka event streamed; OpenSearch synced.
                </p>
              </div>

              {/* Order & Telemetry Receipt */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left space-y-2.5 font-mono text-xs">
                <div className="flex justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Order ID:</span>
                  <span className="text-white font-bold">{completedOrder.id}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">PostgreSQL Transaction:</span>
                  <span className="text-emerald-400">{completedOrder.postgresTxId} (COMMIT)</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Kafka Topic:</span>
                  <span className="text-indigo-400">orders.placed (offset: #{completedOrder.kafkaOffset})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Paid:</span>
                  <span className="text-brand-400 font-bold tabular-nums">
                    ₹{completedOrder.totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm transition shadow-glow-brand"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <form onSubmit={handleExecuteCheckout} className="space-y-5">
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Customer Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Order Items Preview */}
              <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Items to Purchase ({items.length})
                </span>
                <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                  {items.map((i) => (
                    <div key={i.product.id} className="flex justify-between text-xs text-slate-200">
                      <span className="truncate pr-2">
                        {i.quantity}x {i.product.title}
                      </span>
                      <span className="font-semibold tabular-nums shrink-0">
                        ₹{(i.product.price * i.quantity).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between text-xs font-bold text-white">
                  <span>Total Amount</span>
                  <span className="text-brand-400 tabular-nums">₹{total.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Real-time 3-Service Pipeline Step Indicator during checkout */}
              {isProcessing && (
                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                    <span>Executing Distributed Atomic Transaction...</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div
                      className={`p-2 rounded border flex flex-col gap-1 items-center text-center ${
                        processStep >= 1
                          ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>PostgreSQL Lock</span>
                    </div>
                    <div
                      className={`p-2 rounded border flex flex-col gap-1 items-center text-center ${
                        processStep >= 3
                          ? 'bg-indigo-950/60 border-indigo-600/60 text-indigo-300'
                          : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Kafka Stream</span>
                    </div>
                    <div
                      className={`p-2 rounded border flex flex-col gap-1 items-center text-center ${
                        processStep >= 4
                          ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>OpenSearch Sync</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold text-sm transition shadow-glow-brand"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Committing Transaction...</span>
                  </>
                ) : (
                  <>
                    <span>Place Order (₹{total.toLocaleString('en-IN')})</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
