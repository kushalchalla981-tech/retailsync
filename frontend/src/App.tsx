import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, ShoppingBag, Swords } from 'lucide-react';
import { api, ApiError, connectTelemetry } from './services/api';
import { useFeedStatus } from './services/ledger';
import { Ledger } from './components/Ledger';
import { ProductTag } from './components/ProductTag';
import { CartDrawer } from './components/CartDrawer';
import { RaceDialog } from './components/RaceDialog';
import { FitLine } from './components/FitLine';
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

  const searchNote: [string, string][] | string | null = !q.trim()
    ? null
    : searchHits
      ? [
          ['OpenSearch', `${searchHits.ids.length} hits`],
          ['took', searchHits.took === undefined ? 'not reported' : `${searchHits.took} ms`],
          ['round trip', `${searchHits.rt.toFixed(0)} ms`],
        ]
      : feed.search === 'unavailable'
        ? 'Search service unreachable. Filtering the loaded catalog in the browser, exact words only.'
        : 'Searching…';

  return (
    <div className="lg:grid lg:h-screen lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
      <main className="min-w-0 pb-24 lg:h-screen lg:overflow-y-auto lg:pb-0">
        <header className="sticky top-0 z-30 border-b border-ink bg-paper">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-8">
            <p className="wordmark mr-auto text-[1.375rem]">RetailSync</p>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-2">Store</span>
              <select value={storeId ?? ''} onChange={(e) => changeStore(e.target.value)} className="field text-sm font-semibold">
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setCartOpen(true)} className="btn btn--frame">
              <ShoppingBag className="h-4 w-4" aria-hidden="true" /> Cart
              <span className="figures">{cart?.itemCount ?? 0}</span>
            </button>
          </div>
        </header>

        <section className="mx-auto max-w-[1200px] px-4 pt-8 sm:px-8" aria-labelledby="shelf-title">
          <div className="grid items-end gap-x-10 gap-y-6 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <h1 id="shelf-title" className="min-w-0">
              <FitLine>Live stock from</FitLine>
              <FitLine>three stores.</FitLine>
              <FitLine className="text-accent">No sale promised twice.</FitLine>
            </h1>
            <div className="min-w-0 border-t-[5px] border-ink pt-4">
              <p className="text-[1.0625rem] leading-snug">
                Every checkout locks its stock row in PostgreSQL, then tells Kafka and the search index.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => setRaceOpen(true)} className="btn">
                  <Swords className="h-4 w-4" aria-hidden="true" /> Run the last-unit race
                </button>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t-[5px] border-ink pt-5">
            <label htmlFor="search" className="sr-only">
              Search products
            </label>
            <div className="flex items-center gap-3 border-b border-ink pb-2">
              <Search className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
              <input
                id="search"
                ref={searchInput}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the catalog, a typo is fine"
                className="min-w-0 flex-1 bg-transparent text-xl placeholder:text-ink-2 focus:outline-none"
              />
              <kbd className="figures hidden border border-rule px-1.5 py-0.5 text-xs text-ink-2 sm:block">/</kbd>
            </div>
            <div className="mt-2 min-h-[1.5rem] text-sm text-ink-2" role="status">
              {Array.isArray(searchNote) ? (
                <dl className="flex flex-wrap gap-x-6">
                  {searchNote.map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt>{k}</dt>
                      <dd className="figures font-semibold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                searchNote
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
              <Select label="Category" value={category} onChange={setCategory} options={[['', 'All'], ...categories.map((c) => [c.slug, `${c.name} (${c.productCount})`] as [string, string])]} />
              <Select label="City" value={city} onChange={setCity} options={[['', 'All cities'], ...cities.map((c) => [c, c] as [string, string])]} />
              <fieldset className="flex items-end gap-2">
                <legend className="mb-1 text-xs text-ink-2">Price in ₹</legend>
                <PriceInput label="Minimum price" value={minPrice} onChange={setMinPrice} placeholder="From" />
                <span className="pb-3 text-ink-2">to</span>
                <PriceInput label="Maximum price" value={maxPrice} onChange={setMaxPrice} placeholder="To" />
              </fieldset>
              <p className="figures ml-auto pb-3 text-sm text-ink-2">
                {visible.length} of {total} shown
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 pb-10 pt-6 sm:px-8" aria-label="Products" aria-busy={loading}>
          {cartError && (
            <p role="alert" className="mb-4 border border-fail px-3 py-2 text-sm text-fail">
              {cartError}
            </p>
          )}
          {loadError ? (
            <div role="alert" className="border-t-[5px] border-fail pt-4">
              <h2 className="text-xl text-fail">The catalog did not load</h2>
              <p className="mt-2 text-sm text-ink-2">{loadError}</p>
              <button type="button" onClick={() => setReload((n) => n + 1)} className="btn btn--frame mt-4">
                Try again
              </button>
            </div>
          ) : loading && products.length === 0 ? (
            <ul aria-hidden="true" className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="h-28 border-t border-rule bg-sheet/60" />
              ))}
            </ul>
          ) : visible.length === 0 ? (
            <div className="border-t border-rule pt-4">
              <p className="font-semibold">Nothing matches.</p>
              <p className="mt-1 text-sm text-ink-2">Clear a filter or try another word.</p>
            </div>
          ) : (
            <ul className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((p) => (
                <li key={p.id} className="min-w-0">
                  <ProductTag product={p} store={selectedStore} inCart={qty(p.id)} busy={cartBusy} onAdd={add} />
                </li>
              ))}
            </ul>
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
      <span className="mb-1 text-xs text-ink-2">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field text-sm">
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
      className="field figures w-24 text-sm placeholder:text-ink-2"
    />
  );
}
