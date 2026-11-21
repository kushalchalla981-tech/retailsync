import React, { useEffect, useRef, useState } from 'react';
import { X, ArrowLeft, ArrowRight, CheckCircle2, ShoppingBag, ShoppingCart, Minus, Plus, Zap } from 'lucide-react';
import { DemoStore, StoreProduct } from '../data/stores';
import { ThunderLine } from './ThunderLine';
import { sound } from '../utils/sound';
import { useCart, MAX_QTY } from '../context/CartContext';
import { useCurrency } from '../context/CurrencyContext';
import { CurrencySelect } from './CurrencySelect';

interface StoreDetailModalProps {
  member: DemoStore | null;
  currentIndex: number;
  totalStores?: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const ProductCard: React.FC<{ product: StoreProduct; store: DemoStore }> = ({ product, store }) => {
  const { add, setOpen } = useCart();
  const { format } = useCurrency();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const stock = product.stock;
  const soldOut = stock !== undefined && stock <= 0;
  const maxQty = Math.min(MAX_QTY, stock ?? MAX_QTY);
  useEffect(() => { if (stock !== undefined && qty > Math.max(1, stock)) setQty(Math.max(1, stock)); }, [stock, qty]);

  const toCart = () => {
    if (soldOut) return;
    add({ storeId: store.id, productId: product.id, storeName: store.name, storeSlug: store.slug, storeColor: store.primaryColor, name: product.name, price: product.price, emoji: product.emoji, image: product.image }, qty);
    sound.playWhoosh(0.6);
    setAdded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAdded(false), 1400);
  };

  return (
    <article className="bg-white rounded-2xl border-3 border-[#1a1918] shadow-pop overflow-hidden flex flex-col hover:-translate-y-1 transition-transform">
      <div className="relative aspect-square bg-[#f4f0ed] border-b-3 border-[#1a1918] flex items-center justify-center">
        {product.image && !imgFailed ? (
          <img src={product.image} alt={product.name} loading="lazy" onError={() => setImgFailed(true)} className="w-full h-full object-cover" />
        ) : (
          <span className="text-6xl" aria-hidden>{product.emoji}</span>
        )}
        <span className="absolute top-2 left-2 text-xl bg-white border-2 border-[#1a1918] rounded-full w-9 h-9 flex items-center justify-center" aria-hidden>
          {product.emoji}
        </span>
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">
        <h4 className="font-black text-sm text-[#1a1918] leading-tight flex-1">{product.name}</h4>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-extrabold rounded-full px-3 py-0.5 border-2 border-[#1a1918] bg-[#1a1918]" style={{ color: store.primaryColor }}>
            {format(product.price)}
          </span>
          {stock !== undefined && (
            <span aria-live="polite" className={`font-mono text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border-2 border-[#1a1918] ${soldOut ? 'bg-[#1a1918] text-white' : stock <= 5 ? 'bg-[#ff5c35] text-white' : 'bg-[#f4f0ed] text-[#1a1918]'}`}>
              {soldOut ? 'Sold out' : stock <= 5 ? `Only ${stock} left` : `${stock} in stock`}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center border-2 border-[#1a1918] rounded-full overflow-hidden" role="group" aria-label={`Quantity for ${product.name}`}>
            <button aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)} className="px-2.5 py-1.5 disabled:opacity-30 hover:bg-[#f4f0ed]"><Minus className="w-3.5 h-3.5" /></button>
            <span className="font-mono text-sm font-black w-7 text-center" aria-live="polite">{qty}</span>
            <button aria-label="Increase quantity" disabled={qty >= maxQty} onClick={() => setQty((q) => q + 1)} className="px-2.5 py-1.5 disabled:opacity-30 hover:bg-[#f4f0ed]"><Plus className="w-3.5 h-3.5" /></button>
          </div>
          <button
            onClick={toCart}
            disabled={soldOut}
            className={`disabled:opacity-40 disabled:cursor-not-allowed flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full font-mono text-xs uppercase tracking-wider font-black border-2 border-[#1a1918] transition-colors ${added ? 'bg-[#a7f432] text-[#1a1918]' : 'bg-[#1a1918] text-white hover:bg-[#ff5c35]'}`}
          >
            {added ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
            <span>{added ? 'Added' : 'Add'}</span>
          </button>
        </div>
        <button
          onClick={() => { toCart(); setOpen(true); }}
          disabled={soldOut}
          className="disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 bg-[#ff5c35] text-white px-3 py-2 rounded-full font-mono text-xs uppercase tracking-wider font-black border-2 border-[#1a1918] hover:bg-[#1a1918] transition-colors"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Buy now</span>
        </button>
      </div>
    </article>
  );
};

export const StoreDetailModal: React.FC<StoreDetailModalProps> = ({ member, currentIndex, totalStores, onClose, onNavigate }) => {
  const { count, setOpen, isOpen: cartOpen } = useCart();
  const scroller = useRef<HTMLDivElement>(null);
  const last = (totalStores ?? 1) - 1;

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [member]);

  useEffect(() => {
    if (!member) return;
    const onKey = (e: KeyboardEvent) => {
      if (cartOpen) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1);
      else if (e.key === 'ArrowRight' && currentIndex < last) onNavigate(currentIndex + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [member, currentIndex, last, onClose, onNavigate, cartOpen]);

  if (!member) return null;

  const navBtn = 'p-2 rounded-full bg-white border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-30 disabled:cursor-not-allowed transition-all';

  return (
    <div ref={scroller} className="fixed inset-0 z-[101] overflow-y-auto bg-[#fdfaf6] animate-fadeIn" role="dialog" aria-label={`${member.name} store`}>
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 px-4 sm:px-8 py-3 border-b-4 border-[#1a1918] flex items-center justify-between gap-3 bg-[#fdfaf6]/95 backdrop-blur">
        <button onClick={() => { sound.playWhoosh(0.8); onClose(); }} className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-wider text-[#1a1918] hover:text-[#ff5c35]">
          <ArrowLeft className="w-4 h-4" /> All stores
        </button>
        <span className="hidden sm:inline font-mono text-xs font-bold uppercase tracking-wider bg-[#1a1918] text-[#f5ebe0] px-3 py-1 rounded-full">
          Store {String(currentIndex + 1).padStart(2, '0')} / {String(last + 1).padStart(2, '0')}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => onNavigate(currentIndex - 1)} disabled={currentIndex === 0} aria-label="Previous store" className={navBtn}><ArrowLeft className="w-4 h-4" /></button>
          <button onClick={() => onNavigate(currentIndex + 1)} disabled={currentIndex >= last} aria-label="Next store" className={navBtn}><ArrowRight className="w-4 h-4" /></button>
          <CurrencySelect />
          <button onClick={() => setOpen(true)} aria-label={`Open cart, ${count} items`} className="relative p-2 rounded-full bg-[#a7f432] border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 transition-all">
            <ShoppingCart className="w-4 h-4 text-[#1a1918]" />
            {count > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[#ff5c35] text-white font-mono text-[10px] font-black flex items-center justify-center border-2 border-[#1a1918]">{count}</span>}
          </button>
          <button onClick={() => { sound.playWhoosh(0.8); onClose(); }} aria-label="Close store" className="p-2 rounded-full bg-[#1a1918] text-[#f5ebe0] hover:bg-[#ff5c35] border-2 border-[#1a1918] shadow-pop transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 1. Store identity */}
      <section className="border-b-4 border-[#1a1918]" style={{ background: `linear-gradient(135deg, ${member.primaryColor}, ${member.accentColor})` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 md:py-14 flex flex-col md:flex-row items-center md:items-end gap-6">
          <div className="w-28 h-28 md:w-36 md:h-36 rounded-3xl border-4 border-[#1a1918] flex items-center justify-center text-5xl md:text-6xl shadow-pop-lg shrink-0 bg-[#fdfaf6]">
            <span aria-hidden>{member.symbol}</span>
          </div>
          <div className="text-center md:text-left space-y-2">
            <span className="inline-block font-mono text-xs font-black uppercase tracking-widest bg-[#1a1918] text-[#fdfaf6] px-3 py-1 rounded-full">
              {member.category} store
            </span>
            <h1 className="font-black text-4xl md:text-6xl uppercase tracking-tighter text-[#1a1918]">{member.name}</h1>
            <ThunderLine color="#1a1918" className="w-40 h-3 mx-auto md:mx-0" />
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 space-y-12">
        {/* 2. What makes us different */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5c35]" />
            <h2 className="font-mono text-xs uppercase tracking-widest font-black text-[#1a1918]">What makes us different</h2>
          </div>
          <div className="bg-[#f5ede4] rounded-3xl p-6 md:p-8 border-3 border-[#1a1918] shadow-pop grid md:grid-cols-[1.4fr_1fr] gap-6">
            <div>
              <p className="font-black text-2xl md:text-3xl text-[#1a1918] leading-tight">{member.tagline}</p>
              <p className="text-sm md:text-base text-[#524b44] mt-3 leading-relaxed">{member.description}</p>
            </div>
            <ul className="space-y-2.5">
              {member.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2.5 bg-white border-2 border-[#1a1918] rounded-xl px-3 py-2.5 text-sm text-[#252422]">
                  <CheckCircle2 className="w-5 h-5 text-[#a7f432] bg-[#1a1918] rounded-full p-0.5 shrink-0" />
                  <span className="font-bold">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 3. Catalog */}
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-[#ffd600] rounded-xl border-2 border-[#1a1918]"><ShoppingBag className="w-6 h-6 text-[#1a1918]" /></span>
            <div>
              <span className="text-xs font-mono font-black text-[#ff5c35] tracking-wider uppercase block">{member.products.length} products</span>
              <h2 className="font-black text-2xl md:text-3xl uppercase tracking-tight text-[#1a1918]">{member.cta}</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {member.products.map((p) => <ProductCard key={p.name} product={p} store={member} />)}
          </div>
        </section>

        <footer className="pt-6 border-t-2 border-[#1a1918]/15">
          <h4 className="font-mono text-xs uppercase tracking-widest font-black text-[#1a1918]">Powered by RetailSync</h4>
          <p className="text-xs text-[#786f66] font-mono mt-0.5">Aiven PostgreSQL · Kafka · OpenSearch · Razorpay</p>
        </footer>
      </div>
    </div>
  );
};
