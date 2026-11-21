import React, { useState } from 'react';
import { X, ShoppingCart, CheckCircle2, Loader2 } from 'lucide-react';
import { openRazorpayCheckout } from '../utils/razorpay';
import { ThunderLine } from './ThunderLine';

interface Product {
  name: string;
  price: string;
  emoji: string;
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeName: string;
  storeSlug: string;
  product: Product | null;
}

type CheckoutState = 'summary' | 'processing' | 'success' | 'failed';

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen, onClose, storeName, storeSlug, product
}) => {
  const [state, setState] = useState<CheckoutState>('summary');
  const [paymentId, setPaymentId] = useState('');

  if (!isOpen || !product) return null;

  // Parse price string like "₹8,999" to paise
  const paise = parseInt(product.price.replace(/[₹,]/g, ''), 10) * 100;

  const handlePay = () => {
    setState('processing');
    openRazorpayCheckout({
      storeName,
      storeSlug,
      amount: paise,
      productName: product.name,
      onSuccess: (id) => {
        setPaymentId(id);
        setState('success');
      },
      onFailure: () => setState('failed'),
    });
  };

  const handleClose = () => {
    setState('summary');
    setPaymentId('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#1a1918]/75 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="fixed inset-0 -z-10" onClick={handleClose} />
      <div className="relative w-full max-w-md bg-[#fdfaf6] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="bg-[#1a1918] px-6 py-4 border-b-4 border-[#1a1918] flex items-center justify-between">
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#a7f432]">{storeName}</span>
            <h3 className="font-black text-lg uppercase tracking-tight text-white">
              {state === 'success' ? 'Order Confirmed!' : state === 'failed' ? 'Payment Failed' : 'Checkout'}
            </h3>
            <ThunderLine color="#a7f432" className="w-24 h-2 mt-1" />
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-full bg-white/10 text-white hover:bg-[#ff5c35] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {state === 'summary' && (
            <>
              {/* Product card */}
              <div className="flex items-center gap-4 p-4 bg-[#f4f0ed] rounded-2xl border-2 border-[#1a1918]">
                <span className="text-4xl">{product.emoji}</span>
                <div className="flex-1">
                  <div className="font-black text-sm text-[#1a1918]">{product.name}</div>
                  <div className="font-mono text-lg font-black text-[#ff5c35]">{product.price}</div>
                </div>
              </div>
              {/* Order summary */}
              <div className="space-y-2 font-mono text-sm">
                <div className="flex justify-between text-[#5a534d]"><span>Subtotal</span><span>{product.price}</span></div>
                <div className="flex justify-between text-[#5a534d]"><span>Delivery</span><span className="text-[#a7f432] font-black">FREE</span></div>
                <div className="h-px bg-[#1a1918]/10" />
                <div className="flex justify-between text-[#1a1918] font-black"><span>Total</span><span>{product.price}</span></div>
              </div>
              <button
                onClick={handlePay}
                className="w-full flex items-center justify-center gap-2 bg-[#1a1918] text-white py-3.5 rounded-xl font-mono text-sm uppercase tracking-widest font-black border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-all hover:bg-[#ff5c35]"
              >
                <ShoppingCart className="w-4 h-4" />
                Pay {product.price} with Razorpay
              </button>
              <p className="text-center text-xs text-[#9a938d] font-mono">Secured by Razorpay · UPI · Cards · Wallets</p>
            </>
          )}

          {state === 'processing' && (
            <div className="text-center py-10 space-y-3">
              <Loader2 className="w-10 h-10 mx-auto text-[#ff5c35] animate-spin" />
              <p className="font-mono text-sm text-[#5a534d]">Processing payment…</p>
            </div>
          )}

          {state === 'success' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-[#a7f432] border-4 border-[#1a1918] rounded-full flex items-center justify-center mx-auto shadow-pop">
                <CheckCircle2 className="w-8 h-8 text-[#1a1918]" />
              </div>
              <div>
                <h4 className="font-black text-xl text-[#1a1918]">Payment Successful!</h4>
                <p className="text-sm text-[#5a534d] mt-1">Your order has been placed on <strong>{storeName}</strong>.</p>
              </div>
              {paymentId && (
                <div className="bg-[#f4f0ed] rounded-xl p-3 border-2 border-[#1a1918]">
                  <p className="font-mono text-xs text-[#7a736d]">Payment ID</p>
                  <p className="font-mono text-xs font-black text-[#1a1918] break-all">{paymentId}</p>
                </div>
              )}
              <button onClick={handleClose} className="bg-[#1a1918] text-white px-6 py-2.5 rounded-full font-mono text-xs uppercase tracking-wider font-black hover:bg-[#ff5c35] transition-colors shadow-pop">
                Continue Shopping
              </button>
            </div>
          )}

          {state === 'failed' && (
            <div className="text-center py-6 space-y-4">
              <div className="text-5xl">❌</div>
              <h4 className="font-black text-lg text-[#1a1918]">Payment Failed</h4>
              <p className="text-sm text-[#5a534d]">Something went wrong. Please try again.</p>
              <button onClick={() => setState('summary')} className="bg-[#ff5c35] text-white px-6 py-2.5 rounded-full font-mono text-xs uppercase tracking-wider font-black hover:bg-[#1a1918] transition-colors shadow-pop">
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
