import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { X, Minus, Plus, Trash2, ShoppingCart, CheckCircle2, Loader2 } from 'lucide-react';
import { useCart, MAX_QTY, CartItem } from '../context/CartContext';
import { useCurrency } from '../context/CurrencyContext';
import { openRazorpayCheckout, type PaymentFailure } from '../utils/razorpay';
import { ReceiptModal, type Receipt } from './ReceiptModal';
import { storeManager } from '../data/storeManager';
import { ThunderLine } from './ThunderLine';

const FREE_SHIPPING_FROM_INR = 999;
const SHIPPING_INR = 99;
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

type Phase = 'cart' | 'paying' | 'done' | 'failed';

export const CartDrawer: React.FC = () => {
  const { items, count, subtotalInr, isOpen, setOpen, setQty, remove, clear } = useCart();
  const { format, currency } = useCurrency();
  const { user } = useUser();
  const [phase, setPhase] = useState<Phase>('cart');
  const [paymentId, setPaymentId] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [failure, setFailure] = useState<PaymentFailure | null>(null);
  const signedInEmail = user?.primaryEmailAddress?.emailAddress ?? '';
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  useEffect(() => { if (signedInEmail && !email) setEmail(signedInEmail); }, [signedInEmail, email]);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const shippingInr = subtotalInr === 0 || subtotalInr >= FREE_SHIPPING_FROM_INR ? 0 : SHIPPING_INR;
  const totalInr = subtotalInr + shippingInr;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'paying') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, phase, setOpen]);

  const receiptModal = <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />;
  if (!isOpen) return receiptModal;

  const close = () => {
    if (phase === 'paying') return;
    setOpen(false);
    if (phase !== 'cart') setPhase('cart');
  };

  const recordOrders = (paid: CartItem[], id: string, buyerEmail: string) => {
    const byStore = new Map<string, CartItem[]>();
    paid.forEach((i) => byStore.set(i.storeId, [...(byStore.get(i.storeId) ?? []), i]));
    byStore.forEach((lines, storeId) => {
      storeManager.addOrder({
        orderNumber: `#RS-${Math.floor(1000 + Math.random() * 9000)}`,
        storeId,
        storeName: lines[0].storeName,
        customerName: user?.fullName || 'Guest shopper',
        customerEmail: buyerEmail,
        customerCity: 'Bengaluru',
        items: lines.map((l) => ({ name: l.name, price: inr(l.priceInr), quantity: l.qty, emoji: l.emoji })),
        total: inr(lines.reduce((n, l) => n + l.priceInr * l.qty, 0)),
        status: 'Processing',
        paymentId: id,
      });
    });
  };

  const checkout = () => {
    if (!emailValid) { setEmailTouched(true); return; }
    const paid = items;
    const buyerEmail = email.trim();
    const lines = paid.map((i) => ({ name: i.name, storeName: i.storeName, qty: i.qty, unitPriceInr: i.priceInr, storeId: i.storeId, productId: i.productId }));
    setFailure(null);
    setPhase('paying');
    const stores = [...new Set(paid.map((i) => i.storeSlug))];
    openRazorpayCheckout({
      storeName: stores.length === 1 ? paid[0].storeName : 'RetailSync',
      storeSlug: stores.length === 1 ? stores[0] : 'multi-store',
      amount: totalInr * 100,
      productName: `${count} item${count === 1 ? '' : 's'} from ${stores.length} store${stores.length === 1 ? '' : 's'}`,
      invoice: { lines, customerName: user?.fullName || undefined, customerEmail: buyerEmail },
      onSuccess: (r) => {
        recordOrders(paid, r.paymentId, buyerEmail);
        setPaymentId(r.paymentId);
        setReceipt({
          paymentId: r.paymentId,
          issuedAt: new Date(),
          customerName: user?.fullName || undefined,
          customerEmail: buyerEmail,
          lines,
          shippingInr,
          totalInr: r.paidInr ?? totalInr,
          verified: r.paidInr !== null,
          demo: r.demo,
          email: r.invoice,
        });
        clear();
        setPhase('done');
      },
      onFailure: (f) => {
        setFailure(f);
        setPhase(f.reason === 'dismissed' ? 'cart' : 'failed');
      },
    });
  };

  return (
    <>
    {receiptModal}
    <div className="fixed inset-0 z-[110] flex justify-end">
      <div className="absolute inset-0 bg-[#1a1918]/60 backdrop-blur-sm animate-fadeIn" onClick={close} />
      <aside
        role="dialog"
        aria-label="Shopping cart"
        className="relative h-full w-full max-w-md bg-[#fdfaf6] border-l-4 border-[#1a1918] flex flex-col animate-slideInRight"
      >
        <header className="bg-[#1a1918] px-6 py-4 flex items-center justify-between">
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#a7f432]">Your cart · {count} item{count === 1 ? '' : 's'}</span>
            <h3 className="font-black text-lg uppercase tracking-tight text-white">
              {phase === 'done' ? 'Order confirmed' : phase === 'failed' ? 'Payment failed' : 'Cart'}
            </h3>
            <ThunderLine color="#a7f432" className="w-24 h-2 mt-1" />
          </div>
          <button onClick={close} aria-label="Close cart" className="p-1.5 rounded-full bg-white/10 text-white hover:bg-[#ff5c35] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </header>

        {phase === 'paying' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-10 h-10 text-[#ff5c35] animate-spin" />
            <p className="font-mono text-sm text-[#5a534d]">Waiting for payment…</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="w-16 h-16 bg-[#a7f432] border-4 border-[#1a1918] rounded-full flex items-center justify-center shadow-pop">
              <CheckCircle2 className="w-8 h-8 text-[#1a1918]" />
            </div>
            <h4 className="font-black text-xl text-[#1a1918]">Payment successful</h4>
            <p className="text-sm text-[#5a534d]">Your order is with the store{paymentId.startsWith('demo_') ? ' (demo payment)' : ''}.</p>
            <p className="font-mono text-xs break-all bg-[#f4f0ed] border-2 border-[#1a1918] rounded-xl p-3 w-full">{paymentId}</p>
            {!receipt && (
              <p className="text-xs text-[#786f66]">Receipt closed. Your payment ID is above.</p>
            )}
            <button onClick={close} className="bg-[#1a1918] text-white px-6 py-2.5 rounded-full font-mono text-xs uppercase tracking-wider font-black hover:bg-[#ff5c35] transition-colors shadow-pop">
              Keep shopping
            </button>
          </div>
        )}

        {phase === 'failed' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <h4 className="font-black text-lg text-[#1a1918]">{failure?.reason === 'out_of_stock' ? 'Some items just sold out' : "Payment didn't go through"}</h4>
            <p className="text-sm text-[#5a534d]">
              {failure?.reason === 'out_of_stock'
                ? 'Another shopper got there first. Lower the quantity or remove the item, then try again. Nothing was charged.'
                : failure?.message ? `${failure.message} Nothing was charged.` : 'Nothing was charged. Your cart is still here.'}
            </p>
            {failure?.items?.length ? (
              <ul className="font-mono text-xs text-left w-full bg-[#f4f0ed] border-2 border-[#1a1918] rounded-xl p-3 space-y-1">
                {failure.items.map((x) => (
                  <li key={`${x.storeId}/${x.productId}`}>
                    {items.find((i) => i.productId === x.productId && i.storeId === x.storeId)?.name ?? x.productId}: {x.stock > 0 ? `only ${x.stock} left` : 'sold out'}
                  </li>
                ))}
              </ul>
            ) : null}
            <button onClick={() => setPhase('cart')} className="bg-[#ff5c35] text-white px-6 py-2.5 rounded-full font-mono text-xs uppercase tracking-wider font-black hover:bg-[#1a1918] transition-colors shadow-pop">
              Back to cart
            </button>
          </div>
        )}

        {phase === 'cart' && items.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <ShoppingCart className="w-10 h-10 text-[#786f66]" />
            <h4 className="font-black text-lg text-[#1a1918]">Your cart is empty</h4>
            <p className="text-sm text-[#5a534d]">Open any store and add a few things.</p>
          </div>
        )}

        {phase === 'cart' && items.length > 0 && (
          <>
            <ul className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.map((i) => (
                <li key={`${i.storeId}-${i.name}`} className="flex gap-3 bg-white border-2 border-[#1a1918] rounded-2xl p-3 shadow-pop">
                  <div className="w-20 h-20 shrink-0 rounded-xl border-2 border-[#1a1918] overflow-hidden flex items-center justify-center text-3xl bg-[#f4f0ed]">
                    {i.image ? <img src={i.image} alt="" className="w-full h-full object-cover" loading="lazy" /> : i.emoji}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <span className="inline-block font-mono text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-[#1a1918]" style={{ background: i.storeColor }}>
                      {i.storeName}
                    </span>
                    <p className="font-black text-sm text-[#1a1918] leading-tight truncate">{i.name}</p>
                    <p className="font-mono text-xs text-[#786f66]">{format(i.priceInr)} each</p>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center border-2 border-[#1a1918] rounded-full overflow-hidden">
                        <button aria-label={`Fewer ${i.name}`} disabled={i.qty <= 1} onClick={() => setQty(i.storeId, i.name, i.qty - 1)} className="px-2 py-1 disabled:opacity-30 hover:bg-[#f4f0ed]"><Minus className="w-3 h-3" /></button>
                        <span className="font-mono text-xs font-black w-6 text-center" aria-live="polite">{i.qty}</span>
                        <button aria-label={`More ${i.name}`} disabled={i.qty >= MAX_QTY} onClick={() => setQty(i.storeId, i.name, i.qty + 1)} className="px-2 py-1 disabled:opacity-30 hover:bg-[#f4f0ed]"><Plus className="w-3 h-3" /></button>
                      </div>
                      <span className="font-mono text-sm font-black text-[#1a1918]">{format(i.priceInr * i.qty)}</span>
                      <button aria-label={`Remove ${i.name}`} onClick={() => remove(i.storeId, i.name)} className="p-1.5 rounded-full hover:bg-[#ff5c35] hover:text-white transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <footer className="border-t-4 border-[#1a1918] p-5 space-y-2 font-mono text-sm bg-[#f4f0ed]">
              <div className="flex justify-between text-[#5a534d]"><span>Subtotal (incl. GST)</span><span>{format(subtotalInr)}</span></div>
              <div className="flex justify-between text-[#5a534d]">
                <span>Shipping</span>
                <span>{shippingInr === 0 ? <b className="text-[#1a1918]">FREE</b> : format(shippingInr)}</span>
              </div>
              {shippingInr > 0 && (
                <p className="text-xs text-[#786f66]">Add {format(FREE_SHIPPING_FROM_INR - subtotalInr)} more for free shipping.</p>
              )}
              <div className="h-px bg-[#1a1918]/15" />
              <div className="flex justify-between text-[#1a1918] font-black text-base"><span>Total</span><span>{format(totalInr)}</span></div>
              {currency !== 'INR' && <p className="text-xs text-[#786f66]">Charged in INR: {inr(totalInr)}. Converted prices are indicative.</p>}
              <label className="block pt-2">
                <span className="text-xs font-black uppercase tracking-wider text-[#1a1918]">Receipt email *</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  placeholder="you@example.com"
                  aria-invalid={emailTouched && !emailValid}
                  aria-describedby="receipt-email-hint"
                  className={`mt-1 w-full bg-white border-2 rounded-xl px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#ff5c35] ${emailTouched && !emailValid ? 'border-[#c0392b]' : 'border-[#1a1918]'}`}
                />
                <span id="receipt-email-hint" className={`block mt-1 text-xs ${emailTouched && !emailValid ? 'text-[#c0392b]' : 'text-[#786f66]'}`}>
                  {emailTouched && !emailValid ? 'Enter a valid email for your receipt.' : 'We email your tax invoice here.'}
                </span>
              </label>
              <button
                onClick={checkout}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-[#1a1918] text-white py-3.5 rounded-xl text-sm uppercase tracking-widest font-black border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-all hover:bg-[#ff5c35]"
              >
                <ShoppingCart className="w-4 h-4" />
                Pay {format(totalInr)} with Razorpay
              </button>
              <p className="text-center text-xs text-[#9a938d]">UPI · Cards · Wallets</p>
            </footer>
          </>
        )}
      </aside>
    </div>
    </>
  );
};
