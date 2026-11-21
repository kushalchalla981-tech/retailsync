import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ShoppingCart, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useCurrency } from '../context/CurrencyContext';
import { storeManager } from '../data/storeManager';
import { API_BASE } from '../utils/api';
import { parseInr } from '../utils/currency';

interface Result {
  key: string;
  name: string;
  priceInr: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeColor: string;
  emoji: string;
  image?: string;
  source: 'store' | 'catalog';
  stock?: number;
}

interface ApiItem { id: string; name: string; price: number; imageUrl: string | null; category: { name: string }; totalStock: number; inStock: boolean }

const CATALOG_STORE = { id: 'rs-central', name: 'RetailSync Central', slug: 'retailsync-central', color: '#a7f432' };

/** Every query word must appear in the name, or be one edit away from a word in it (local typo tolerance). */
function matches(name: string, q: string): boolean {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) =>
    words.some((w) => w.includes(t) || (t.length > 3 && withinOneEdit(w.slice(0, t.length + 1), t))),
  );
}

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export const UniversalSearchModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { add } = useCart();
  const { format } = useCurrency();
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<Result[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [took, setTook] = useState<number | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (isOpen) setTimeout(() => input.current?.focus(), 30); }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // OpenSearch (typo-tolerant, server side), debounced.
  useEffect(() => {
    const term = q.trim();
    if (!isOpen || term.length < 2) { setRemote([]); setStatus('idle'); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus('loading');
      try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(term)}&limit=20`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items: ApiItem[]; tookMs: number };
        setRemote(data.items.map((it) => ({
          key: `catalog-${it.id}`, name: it.name, priceInr: it.price, storeId: CATALOG_STORE.id, storeName: CATALOG_STORE.name,
          storeSlug: CATALOG_STORE.slug, storeColor: CATALOG_STORE.color, emoji: '📦', image: it.imageUrl ?? undefined,
          source: 'catalog', stock: it.totalStock,
        })));
        setTook(data.tookMs);
        setStatus('ok');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') { setRemote([]); setStatus('error'); }
      }
    }, 220);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, isOpen]);

  const results = useMemo(() => {
    const term = q.trim();
    if (term.length < 2) return [];
    const local: Result[] = storeManager.getStores().flatMap((s) =>
      s.catalog.filter((p) => matches(p.name, term)).map((p) => ({
        key: `${s.id}-${p.id}`, name: p.name, priceInr: parseInr(p.price), storeId: s.id, storeName: s.name, storeSlug: s.slug,
        storeColor: s.primaryColor, emoji: p.emoji, image: p.image, source: 'store' as const, stock: p.stock,
      })),
    );
    return [...local, ...remote].sort((a, b) => a.priceInr - b.priceInr);
  }, [q, remote]);

  if (!isOpen) return null;

  const term = q.trim();
  const external = [
    { name: 'Amazon.in', url: `https://www.amazon.in/s?k=${encodeURIComponent(term)}` },
    { name: 'Flipkart', url: `https://www.flipkart.com/search?q=${encodeURIComponent(term)}` },
    { name: 'Google Shopping', url: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(term)}` },
  ];

  const addToCart = (r: Result) => {
    add({ storeId: r.storeId, storeName: r.storeName, storeSlug: r.storeSlug, storeColor: r.storeColor, name: r.name, price: String(r.priceInr), emoji: r.emoji, image: r.image }, 1);
    setAdded(r.key);
    setTimeout(() => setAdded((k) => (k === r.key ? null : k)), 1200);
  };

  return (
    <div className="fixed inset-0 z-[105] flex items-start justify-center p-3 sm:p-6 pt-[8vh]">
      <div className="absolute inset-0 bg-[#1a1918]/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-label="Search all stores" className="relative w-full max-w-2xl bg-[#fdfaf6] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg overflow-hidden flex flex-col max-h-[84vh] animate-fadeIn">
        <div className="flex items-center gap-3 px-5 py-4 border-b-4 border-[#1a1918]">
          <Search className="w-5 h-5 text-[#1a1918] shrink-0" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search every store… try “hedphones”"
            aria-label="Search products"
            className="flex-1 bg-transparent outline-none font-bold text-lg text-[#1a1918] placeholder:text-[#9a938d]"
          />
          {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-[#ff5c35]" />}
          <button onClick={onClose} aria-label="Close search" className="p-1.5 rounded-full bg-[#1a1918] text-white hover:bg-[#ff5c35]"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-6">
          {term.length < 2 ? (
            <p className="font-mono text-sm text-[#786f66]">Type at least 2 letters. Results from every RetailSync store, cheapest first. Spelling mistakes are fine.</p>
          ) : (
            <>
              <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-mono text-xs font-black uppercase tracking-widest text-[#1a1918]">RetailSync stores · cheapest first</h3>
                  <span className="font-mono text-[11px] text-[#786f66]">
                    {status === 'error' ? 'OpenSearch unreachable; showing store matches' : took !== null && status === 'ok' ? `OpenSearch ${took} ms` : ''}
                  </span>
                </div>
                {results.length === 0 && status !== 'loading' ? (
                  <p className="text-sm text-[#5a534d]">No products match “{term}”.</p>
                ) : (
                  <ul className="space-y-2">
                    {results.map((r) => (
                      <li key={r.key} className="flex items-center gap-3 bg-white border-2 border-[#1a1918] rounded-2xl p-2.5">
                        <div className="w-14 h-14 shrink-0 rounded-xl border-2 border-[#1a1918] overflow-hidden flex items-center justify-center text-2xl bg-[#f4f0ed]">
                          {r.image ? <img src={r.image} alt="" className="w-full h-full object-cover" loading="lazy" /> : r.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-sm text-[#1a1918] truncate">{r.name}</p>
                          <p className="font-mono text-[11px] text-[#786f66] truncate">
                            <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle border border-[#1a1918]" style={{ background: r.storeColor }} />
                            {r.storeName}{r.stock !== undefined ? ` · ${r.stock > 0 ? `${r.stock} in stock` : 'out of stock'}` : ''}
                          </p>
                        </div>
                        <span className="font-mono text-sm font-black text-[#1a1918] whitespace-nowrap">{format(r.priceInr)}</span>
                        <button
                          onClick={() => addToCart(r)}
                          disabled={r.stock === 0}
                          aria-label={`Add ${r.name} to cart`}
                          className={`p-2 rounded-full border-2 border-[#1a1918] transition-colors disabled:opacity-30 ${added === r.key ? 'bg-[#a7f432]' : 'bg-[#1a1918] text-white hover:bg-[#ff5c35]'}`}
                        >
                          {added === r.key ? <CheckCircle2 className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="font-mono text-xs font-black uppercase tracking-widest text-[#1a1918]">Compare elsewhere</h3>
                <div className="flex flex-wrap gap-2">
                  {external.map((x) => (
                    <a key={x.name} href={x.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-[#f4f0ed] border-2 border-[#1a1918] rounded-full px-3 py-1.5 font-mono text-xs font-black text-[#1a1918] hover:bg-[#ffd600]">
                      {x.name} <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
                <p className="text-xs text-[#786f66]">Opens their search for “{term}” so you can check prices yourself.</p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
