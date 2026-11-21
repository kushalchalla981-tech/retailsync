import React, { useEffect, useState } from 'react';
import { X, ArrowLeft, ArrowRight, CheckCircle2, ShoppingBag, ShoppingCart } from 'lucide-react';
import confetti from 'canvas-confetti';
import { DemoStore } from '../data/stores';
import { ThunderLine } from './ThunderLine';
import { sound } from '../utils/sound';
import { CheckoutModal } from './CheckoutModal';

interface StoreDetailModalProps {
  member: DemoStore | null;
  currentIndex: number;
  totalStores?: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export const StoreDetailModal: React.FC<StoreDetailModalProps> = ({
  member,
  currentIndex,
  totalStores,
  onClose,
  onNavigate,
}) => {
  const [activated, setActivated] = useState(false);
  const [checkoutProduct, setCheckoutProduct] = useState<{ name: string; price: string; emoji: string } | null>(null);

  useEffect(() => {
    setActivated(false);
  }, [member]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !checkoutProduct) {
        onClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0 && !checkoutProduct) {
        onNavigate(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < (totalStores ?? 1) - 1 && !checkoutProduct) {
        onNavigate(currentIndex + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, onClose, onNavigate, checkoutProduct]);

  if (!member) return null;

  const triggerBrowse = () => {
    setActivated(true);
    sound.playSuperpower();

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: [member.primaryColor, member.accentColor, '#1a1918', '#ffffff'],
    });

    setTimeout(() => setActivated(false), 3000);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f4f0ed]/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
        {/* Click outside backdrop */}
        <div className="fixed inset-0 -z-10" onClick={onClose} />

        {/* Modal Dialog Card */}
        <div
          className="relative w-full max-w-4xl bg-[#fdfaf6] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg overflow-hidden my-auto max-h-[92vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Header Bar */}
          <div
            className="px-6 py-4 border-b-4 border-[#1a1918] flex items-center justify-between"
            style={{
              background: `linear-gradient(135deg, ${member.primaryColor}, ${member.accentColor})`
            }}
          >
            {/* Store sequence index */}
            <div className="flex items-center gap-2">
              <span className="bg-[#1a1918] text-[#f5ebe0] font-mono text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                STORE {String(currentIndex + 1).padStart(2, '0')}
              </span>
              <span className="font-mono text-xs font-extrabold uppercase tracking-wider text-[#1a1918] bg-white/70 px-2.5 py-1 rounded-full">
                STORE DOSSIER
              </span>
            </div>

            {/* Quick cycle & Close */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
                aria-label="Previous store"
                className="p-1.5 rounded-full bg-white border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ArrowLeft className="w-4 h-4 text-[#1a1918]" />
              </button>
              <button
                onClick={() => onNavigate(Math.min((totalStores ?? 1) - 1, currentIndex + 1))}
                disabled={currentIndex >= (totalStores ?? 1) - 1}
                aria-label="Next store"
                className="p-1.5 rounded-full bg-white border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ArrowRight className="w-4 h-4 text-[#1a1918]" />
              </button>

              <button
                onClick={() => {
                  sound.playWhoosh(0.8);
                  onClose();
                }}
                aria-label="Close modal"
                className="ml-2 p-2 rounded-full bg-[#1a1918] text-[#f5ebe0] hover:bg-[#ff5c35] border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Body Content */}
          <div className="overflow-y-auto p-6 md:p-8 space-y-8">
            {/* Main Hero row: Symbol + Identity */}
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              <div
                className="w-28 h-28 md:w-36 md:h-36 rounded-3xl border-4 border-[#1a1918] flex items-center justify-center text-5xl md:text-6xl shadow-pop shrink-0"
                style={{ backgroundColor: member.primaryColor }}
              >
                <span>{member.symbol}</span>
              </div>

              <div className="flex-1 text-center md:text-left space-y-2">
                <span className="font-mono text-xs font-black uppercase tracking-widest text-[#ff5c35] bg-[#ff5c35]/10 px-3 py-1 rounded-full border border-[#ff5c35]/20">
                  {member.category} STORE
                </span>
                <h1 className="font-black text-3xl md:text-5xl uppercase tracking-tighter text-[#1a1918]">
                  {member.name}
                </h1>
                <ThunderLine color={member.primaryColor} className="w-40 h-3 mx-auto md:mx-0" />
                <p className="font-mono text-sm md:text-base text-[#655e58] font-bold">
                  {member.tagline}
                </p>
              </div>
            </div>

            {/* Featured Products */}
            <div className="bg-[#f2ebe6] border-3 border-[#1a1918] rounded-2xl p-5 md:p-6 shadow-pop relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl p-2 bg-[#ffd600] rounded-xl border-2 border-[#1a1918]">
                    <ShoppingBag className="w-6 h-6 text-[#1a1918]" />
                  </span>
                  <div>
                    <span className="text-xs font-mono font-black text-[#ff5c35] tracking-wider uppercase block">
                      FEATURED PRODUCTS
                    </span>
                    <h3 className="font-black text-xl md:text-2xl uppercase tracking-tight text-[#1a1918]">
                      {member.cta}
                    </h3>
                  </div>
                </div>

                {/* Browse Store CTA Button */}
                <button
                  onClick={triggerBrowse}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-mono text-xs font-extrabold uppercase tracking-wider border-2 border-[#1a1918] shadow-pop transition-all ${
                    activated
                      ? 'bg-[#a7f432] text-[#1a1918] scale-105'
                      : 'bg-[#ff5c35] text-white hover:-translate-y-0.5 active:translate-y-0'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{activated ? 'EXPLORE CATALOG 🛍️' : 'EXPLORE CATALOG'}</span>
                </button>
              </div>

              {/* Products grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {member.products.map((product, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-xl border-2 border-[#1a1918] p-4 flex flex-col items-center gap-2 shadow-pop hover:-translate-y-0.5 transition-transform"
                  >
                    <span className="text-3xl">{product.emoji}</span>
                    <span className="font-bold text-xs text-center text-[#1a1918] leading-tight">{product.name}</span>
                    <span
                      className="font-mono text-sm font-extrabold rounded-full px-3 py-0.5 border-2 border-[#1a1918]"
                      style={{ color: member.primaryColor, backgroundColor: '#1a1918' }}
                    >
                      {product.price}
                    </span>
                    <button
                      onClick={() => setCheckoutProduct(product)}
                      className="mt-1 flex items-center gap-1.5 bg-[#1a1918] text-white px-3.5 py-1.5 rounded-full font-mono text-xs uppercase tracking-wider font-black hover:bg-[#ff5c35] transition-colors shadow-pop"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Buy Now</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Store Highlights */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5c35]" />
                <h4 className="font-mono text-xs uppercase tracking-widest font-black text-[#1a1918]">
                  WHAT MAKES US DIFFERENT
                </h4>
              </div>

              <div className="bg-[#f5ede4] rounded-2xl p-5 md:p-6 border-2 border-[#1a1918]/20 space-y-4">
                <div>
                  <h5 className="font-extrabold text-lg md:text-xl text-[#1a1918]">
                    {member.tagline}
                  </h5>
                  <p className="text-sm md:text-base text-[#524b44] mt-1 leading-relaxed">
                    {member.description}
                  </p>
                </div>

                <div className="border-t border-[#1a1918]/15 pt-3">
                  <span className="text-xs font-mono font-bold uppercase text-[#1a1918]/60 block mb-2">
                    KEY HIGHLIGHTS:
                  </span>
                  <ul className="space-y-2">
                    {member.highlights.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-sm md:text-base text-[#252422]">
                        <CheckCircle2 className="w-5 h-5 text-[#a7f432] bg-[#1a1918] rounded-full p-0.5 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Visit Store */}
            <div className="space-y-3 pt-2 border-t-2 border-[#1a1918]/15 flex items-center justify-between">
              <div>
                <h4 className="font-mono text-xs uppercase tracking-widest font-black text-[#1a1918]">
                  POWERED BY RETAILSYNC
                </h4>
                <p className="text-xs text-[#786f66] font-mono mt-0.5">Aiven PostgreSQL · Kafka Stream · OpenSearch</p>
              </div>
              <button
                onClick={() => setCheckoutProduct(member.products[0])}
                className="flex items-center gap-2 bg-[#ff5c35] text-white px-5 py-2.5 rounded-full text-xs font-mono font-black uppercase tracking-wider hover:bg-[#1a1918] transition-colors shadow-pop"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Quick Checkout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <CheckoutModal
        isOpen={!!checkoutProduct}
        onClose={() => setCheckoutProduct(null)}
        storeName={member.name}
        storeSlug={member.slug}
        product={checkoutProduct}
      />
    </>
  );
};
