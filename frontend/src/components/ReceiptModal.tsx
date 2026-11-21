import React, { useEffect } from 'react';
import { Printer, X, CheckCircle2 } from 'lucide-react';
import type { DeliveryStatus } from '../utils/razorpay';

export interface Receipt {
  paymentId: string;
  issuedAt: Date;
  customerName?: string;
  customerEmail?: string;
  lines: { name: string; storeName: string; qty: number; unitPriceInr: number }[];
  shippingInr: number;
  /** Razorpay-verified amount when known; otherwise the cart total. */
  totalInr: number;
  verified: boolean;
  demo: boolean;
  email: { owner: DeliveryStatus; buyer: DeliveryStatus } | null;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** In-app tax receipt shown right after checkout, printable / savable as PDF. */
export const ReceiptModal: React.FC<{ receipt: Receipt | null; onClose: () => void }> = ({ receipt, onClose }) => {
  useEffect(() => {
    if (!receipt) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [receipt, onClose]);
  if (!receipt) return null;

  const stores = [...new Set(receipt.lines.map((l) => l.storeName))].join(', ');
  const itemsTotal = receipt.lines.reduce((n, l) => n + l.qty * l.unitPriceInr, 0);
  const emailNote = receipt.demo
    ? 'Demo payment: no money moved and no email was sent.'
    : receipt.email?.buyer === 'sent'
      ? `A copy was emailed to ${receipt.customerEmail}.`
      : receipt.customerEmail
        ? 'We could not email this receipt, so please save it now.'
        : 'Save or print this receipt for your records.';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#1a1918]/60 backdrop-blur-sm no-print" onClick={onClose} />
      <section role="dialog" aria-label="Payment receipt" className="print-area relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white border-4 border-[#1a1918] rounded-2xl shadow-pop-lg">
        <header className="bg-[#1a1918] text-white px-6 py-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#a7f432]">Tax invoice · receipt</p>
            <h2 className="font-black text-xl uppercase tracking-tight">RetailSync</h2>
            <p className="font-mono text-xs text-white/70">{receipt.issuedAt.toLocaleString('en-IN')}</p>
          </div>
          <button onClick={onClose} aria-label="Close receipt" className="no-print p-1.5 rounded-full bg-white/10 hover:bg-[#ff5c35] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-6 space-y-4 text-sm text-[#1a1918]">
          <div className="flex items-center gap-2 font-black">
            <CheckCircle2 className="w-5 h-5 text-[#2e7d32]" />
            {receipt.demo ? 'Demo payment recorded' : receipt.verified ? 'Payment verified by Razorpay' : 'Payment received'}
          </div>
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 font-mono text-xs">
            <dt className="text-[#786f66]">Payment ID</dt><dd className="break-all">{receipt.paymentId}</dd>
            <dt className="text-[#786f66]">Sold by</dt><dd>{stores}</dd>
            {(receipt.customerName || receipt.customerEmail) && (<><dt className="text-[#786f66]">Billed to</dt><dd className="break-all">{[receipt.customerName, receipt.customerEmail].filter(Boolean).join(' · ')}</dd></>)}
          </dl>
          <table className="w-full font-mono text-xs border-y-2 border-[#1a1918]">
            <thead><tr className="bg-[#f4f0ed]"><th className="text-left p-2">Item</th><th className="p-2">Qty</th><th className="text-right p-2">Amount</th></tr></thead>
            <tbody>
              {receipt.lines.map((l, i) => (
                <tr key={i} className="border-t border-[#1a1918]/10">
                  <td className="p-2"><b>{l.name}</b><br /><span className="text-[#786f66]">{l.storeName} · {inr(l.unitPriceInr)} each</span></td>
                  <td className="p-2 text-center">{l.qty}</td>
                  <td className="p-2 text-right">{inr(l.qty * l.unitPriceInr)}</td>
                </tr>
              ))}
              <tr className="border-t border-[#1a1918]/10"><td className="p-2" colSpan={2}>Subtotal (incl. GST)</td><td className="p-2 text-right">{inr(itemsTotal)}</td></tr>
              <tr><td className="p-2" colSpan={2}>Shipping</td><td className="p-2 text-right">{receipt.shippingInr ? inr(receipt.shippingInr) : 'FREE'}</td></tr>
              <tr className="border-t-2 border-[#1a1918] font-black text-sm"><td className="p-2" colSpan={2}>Total paid (INR)</td><td className="p-2 text-right">{inr(receipt.totalInr)}</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-[#5a534d]">{emailNote}</p>
          <div className="flex gap-2 no-print">
            <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-2 bg-[#1a1918] text-white py-3 rounded-xl font-mono text-xs uppercase tracking-widest font-black hover:bg-[#ff5c35] transition-colors shadow-pop">
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
            <button onClick={onClose} className="px-5 py-3 rounded-xl border-2 border-[#1a1918] font-mono text-xs uppercase tracking-widest font-black hover:bg-[#f4f0ed]">Done</button>
          </div>
        </div>
      </section>
    </div>
  );
};
