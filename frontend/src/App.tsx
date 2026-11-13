import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, ShoppingBag, Swords } from 'lucide-react';
import { api, ApiError, connectTelemetry } from './services/api';
import { useFeedStatus } from './services/ledger';
import { Ledger } from './components/Ledger';
import { ProductTag } from './components/ProductTag';
import { CartDrawer } from './components/CartDrawer';
import { RaceDialog } from './components/RaceDialog';
import type { Cart, Category, Product, StoreLocation } from './types';

const CART_KEY = 'retailsync.cartId';
const STORE_KEY = 'retailsync.storeId';
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage blocked: cart lives for this tab only */
    }
  },
};

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [q, setQ] = useState('');
  const [searchHits, setSearchHits] = useState<{ ids: string[]; items: Product[]; took?: number; rt: number } | null>(null);

  const [storeId, setStoreId] = useState<string | null>(store.get(STORE_KEY));
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [raceOpen, setRaceOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const feed = useFeedStatus();
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => connectTelemetry(), []);

  // Reference data + saved cart
  useEffect(() => {
    (async () => {
      try {
        const [cats, locs] = await Promise.all([api.categories(), api.locations()]);
        setCategories(cats);
        setLocations(locs);
        setStoreId((s) => (s && locs.some((l) => l.id === s) ? s : (locs.find((l) => /bangalore|bengaluru/i.test(l.city)) ?? locs[0])?.id ?? null));
        const saved = store.get(CART_KEY);
        if (saved) {
          try {
            const c = await api.getCart(saved);
            if (c.status === 'active') setCart(c);
            else store.set(CART_KEY, null);
          } catch {
            store.set(CART_KEY, null);
          }
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Could not reach the API.');
      }
    })();
  }, []);

  useEffect(() => store.set(STORE_KEY, storeId), [storeId]);

  // Catalog page (PostgreSQL)
  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      .products({ category: category || undefined, city: city || undefined, limit: 100 })
      .then((page) => {
        if (!live) return;
        setProducts(page.items);
        setTotal(page.total);
        setLoadError(null);
      })
      .catch((err) => live && setLoadError(err instanceof Error ? err.message : 'Could not load products.'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [category, city, reload]);

  // Search (OpenSearch, phase 3); falls back to filtering the loaded page.
  useEffect(() => {
    const term = q.trim();
    if (!term || feed.search === 'unavailable') {
      setSearchHits(null);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const r = await api.search(
          { q: term, category: category || undefined, city: city || undefined, minPrice: minPrice ? Number(minPrice) : undefined, maxPrice: maxPrice ? Number(maxPrice) : undefined },
          ctrl.signal,
        );
        setSearchHits({ ids: r.items.map((p) => p.id), items: r.items, took: r.tookMs ?? r.took, rt: r.roundTripMs });
      } catch (err) {
        if (!(err instanceof ApiError && err.notDeployed)) setSearchHits(null);
      }
    }, 220);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q, category, city, minPrice, maxPrice, feed.search]);

  const selectedStore = locations.find((l) => l.id === storeId);
  const cities = useMemo(() => Array.from(new Set(locations.map((l) => l.city))), [locations]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = searchHits ? searchHits.items : products;
    if (!searchHits && term) list = list.filter((p) => `${p.name} ${p.sku} ${p.description} ${p.category.name}`.toLowerCase().includes(term));
    const lo = minPrice ? Number(minPrice) : -Infinity;
    const hi = maxPrice ? Number(maxPrice) : Infinity;
    return list.filter((p) => p.price >= lo && p.price <= hi);
  }, [products, searchHits, q, minPrice, maxPrice]);

  const qty = (id: string) => cart?.items.find((i) => i.productId === id)?.quantity ?? 0;

  const cartAction = useCallback(async (fn: () => Promise<Cart>) => {
    setCartBusy(true);
    setCartError(null);
    try {
      const c = await fn();
      setCart(c);
      store.set(CART_KEY, c.id);
    } catch (err) {
      setCartError(err instanceof Error ? err.message : 'Cart update failed.');
    } finally {
      setCartBusy(false);
    }
  }, []);

  const add = (p: Product) =>
    selectedStore &&
    cartAction(async () => {
      const c = cart ?? (await api.createCart(selectedStore.id));
      const existing = c.items.find((i) => i.productId === p.id);
      return existing ? api.setQuantity(c.id, p.id, existing.quantity + 1) : api.addItem(c.id, p.id, 1);
    });

  const changeStore = (id: string) => {
    setStoreId(id);
    if (cart) void cartAction(() => api.setCartLocation(cart.id, id));
  };

  const onCheckedOut = () => {
    store.set(CART_KEY, null);
    setCart(null);
    setReload((n) => n + 1);
  };

  // "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const searchNote = !q.trim()
    ? null
    : searchHits
      ? `OpenSearch · ${searchHits.ids.length} hits · took ${searchHits.took === undefined ? 'not reported' : `${searchHits.took} ms`} · ${searchHits.rt.toFixed(0)} ms round trip`
      : feed.search === 'unavailable'
        ? 'OpenSearch endpoint not available yet. Filtering the loaded catalog in the browser, exact text only.'
        : 'Searching…';

  return (
    <div className="lg:grid lg:h-screen lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
      <main className="min-w-0 pb-24 lg:h-screen lg:overflow-y-auto lg:pb-0">
        <header className="sticky top-0 z-30 border-b border-ink bg-paper/95 backdrop-blur-[2px]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
            <div className="mr-auto">
              <p className="text-xl font-extrabold tracking-tight">RetailSync</p>
              <p className="figures text-[0.625rem] text-ink-2">Every sale on the ledger</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-2">Store</span>
              <select value={storeId ?? ''} onChange={(e) => changeStore(e.target.value)} className="border border-ink bg-sheet px-2 py-1.5 text-sm font-semibold">
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setRaceOpen(true)} className="flex items-center gap-2 border border-ink px-3 py-2 text-sm font-semibold hover:bg-ink hover:text-sheet">
              <Swords className="h-4 w-4" aria-hidden="true" /> Run the last-unit race
            </button>
            <button type="button" onClick={() => setCartOpen(true)} className="flex items-center gap-2 bg-ink px-3 py-2 text-sm font-semibold text-sheet hover:bg-[#33312c]">
              <ShoppingBag className="h-4 w-4" aria-hidden="true" /> Cart
              <span className="figures text-[0.75rem]">{cart?.itemCount ?? 0}</span>
            </button>
          </div>
        </header>

        <section className="px-4 pt-8 sm:px-6" aria-labelledby="shelf-title">
          <h1 id="shelf-title" className="max-w-[22ch] text-[clamp(1.75rem,3.2vw,2.75rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            Live stock from three stores. No sale is promised twice.
          </h1>
          <p className="mt-3 max-w-[62ch] text-[0.9375rem] text-ink-2">
            Prices and stock come straight from PostgreSQL. Each checkout locks its inventory rows, and every request prints on the ledger beside you.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <label htmlFor="search" className="sr-only">
              Search products
            </label>
            <div className="flex items-center gap-2 border-b-2 border-ink pb-2">
              <Search className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
              <input
                id="search"
                ref={searchInput}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the catalog, try a typo"
                className="min-w-0 flex-1 bg-transparent text-lg placeholder:text-ink-2 focus:outline-none"
              />
              <kbd className="figures hidden border border-rule px-1.5 py-0.5 text-[0.625rem] text-ink-2 sm:block">/</kbd>
            </div>
            {searchNote && (
              <p className="figures text-[0.6875rem]" style={{ color: searchHits ? 'var(--os)' : 'var(--ink-2)' }} role="status">
                {searchNote}
              </p>
            )}

            <div className="flex flex-wrap items-end gap-x-5 gap-y-3 text-sm">
              <Select label="Category" value={category} onChange={setCategory} options={[['', 'All'], ...categories.map((c) => [c.slug, `${c.name} (${c.productCount})`] as [string, string])]} />
              <Select label="City" value={city} onChange={setCity} options={[['', 'All cities'], ...cities.map((c) => [c, c] as [string, string])]} />
              <fieldset className="flex items-end gap-2">
                <legend className="mb-1 text-[0.75rem] text-ink-2">Price, ₹</legend>
                <PriceInput label="Minimum price" value={minPrice} onChange={setMinPrice} placeholder="min" />
                <span className="pb-1.5 text-ink-2">to</span>
                <PriceInput label="Maximum price" value={maxPrice} onChange={setMaxPrice} placeholder="max" />
              </fieldset>
              <p className="figures ml-auto pb-1.5 text-[0.6875rem] text-ink-2">
                {visible.length} shown · {total} in catalog
              </p>
            </div>
          </div>
        </section>

        <div className="perf mx-4 mt-5 sm:mx-6" />

        <section className="px-4 py-6 sm:px-6" aria-label="Products" aria-busy={loading}>
          {cartError && (
            <p role="alert" className="mb-4 border border-fail px-3 py-2 text-sm text-fail">
              {cartError}
            </p>
          )}
          {loadError ? (
            <div role="alert" className="border border-fail p-6">
              <p className="font-semibold text-fail">The catalog did not load</p>
              <p className="mt-1 text-sm text-ink-2">{loadError}</p>
              <button type="button" onClick={() => setReload((n) => n + 1)} className="mt-3 border border-ink px-3 py-1.5 text-sm font-semibold hover:bg-ink hover:text-sheet">
                Retry
              </button>
            </div>
          ) : loading && products.length === 0 ? (
            <p className="text-sm text-ink-2">Reading the catalog from PostgreSQL…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-ink-2">Nothing matches. Clear a filter or try another word.</p>
          ) : (
            <div className="grid gap-px bg-rule [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
              {visible.map((p) => (
                <ProductTag key={p.id} product={p} store={selectedStore} inCart={qty(p.id)} busy={cartBusy} onAdd={add} />
              ))}
            </div>
          )}
        </section>
      </main>

      <aside
        aria-label="Live ledger"
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-ink lg:static lg:z-auto lg:h-screen lg:border-l lg:border-t-0 ${ledgerOpen ? 'h-[75vh]' : 'h-auto'} lg:h-screen`}
      >
        <Ledger expanded={ledgerOpen} onToggle={() => setLedgerOpen((o) => !o)} />
      </aside>

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        busy={cartBusy}
        onQuantity={(id, n) => cart && cartAction(() => api.setQuantity(cart.id, id, n))}
        onRemove={(id) => cart && cartAction(() => api.removeItem(cart.id, id))}
        onCheckedOut={onCheckedOut}
      />
      <RaceDialog open={raceOpen} onClose={() => setRaceOpen(false)} locations={locations} onFinished={() => setReload((n) => n + 1)} />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col">
      <span className="mb-1 text-[0.75rem] text-ink-2">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="border border-ink bg-sheet px-2 py-1.5 text-sm">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function PriceInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      placeholder={placeholder}
      className="figures w-24 border border-ink bg-sheet px-2 py-1.5 text-[0.75rem] placeholder:text-ink-2"
    />
  );
}
