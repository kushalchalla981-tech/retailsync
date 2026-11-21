import { DEMO_STORES, DemoStore } from './stores';
import { API_BASE } from '../utils/api';
import { onReconnect, onTelemetry, type TelemetryEvent } from '../utils/telemetry';

export interface ProductItem {
  id: string;
  name: string;
  price: string;
  emoji: string;
  image?: string;
  stock: number;
  sku: string;
  category: string;
  description?: string;
}

export interface StoreOrder {
  id: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  customerName: string;
  customerEmail: string;
  customerCity: string;
  items: { name: string; price: string; quantity: number; emoji: string }[];
  total: string;
  status: 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  paymentId: string;
  createdAt: string;
}

export interface ExtendedStore extends DemoStore {
  /** Clerk user id of the owner (merchant stores only; set by the server). */
  ownerId?: string;
  ownerEmail?: string;
  ownerName?: string;
  createdDate?: string;
  businessType?: string;
  themeName?: 'Aurora' | 'Sunset' | 'Forest' | 'Midnight' | 'Obsidian';
  announcement?: string;
  bannerTitle?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  catalog: ProductItem[];
}

const STORAGE_KEY_STORES = 'retailsync_custom_stores_v1';
const STORAGE_KEY_ORDERS = 'retailsync_orders_v1';

export const STOCK_BASELINE = 23;
export const STOCK_TOPLINE = 129;
export const STOCK_TIERS = [23, 38, 54, 72, 88, 105, 118, 129];

const toProducts = (catalog: ProductItem[]) => catalog.map(c => ({ id: c.id, name: c.name, price: c.price, emoji: c.emoji, image: c.image, stock: c.stock }));

function demoCatalog(s: DemoStore, idx: number): ProductItem[] {
  return s.products.map((p, pIdx) => ({
    id: `${s.id}-prod-${pIdx + 1}`,
    name: p.name,
    price: p.price,
    emoji: p.emoji,
    image: p.image,
    stock: STOCK_TIERS[(idx + pIdx) % STOCK_TIERS.length],
    sku: `RS-${s.category.slice(0, 3).toUpperCase()}-${100 + pIdx}`,
    category: s.category,
    description: `Official genuine item curated by ${s.name}. Zero oversell stock locked in PostgreSQL.`
  }));
}

/**
 * Saved demo stores predate the v1.01 catalog (3 products, no photos). Add the
 * new demo products and photos while keeping the owner's edits (stock, deletions
 * of other items, store settings) and any stores they created.
 * Enforces baseline (23) and top line (129) threshold rules across all stored items.
 */
function upgradeDemoStores(stores: ExtendedStore[]): ExtendedStore[] {
  return stores.map(st => {
    const idx = DEMO_STORES.findIndex(d => d.id === st.id);
    if (idx < 0) {
      // User-created store: clamp all products to baseline and top line bounds [23, 129]
      const catalog = st.catalog.map(c => ({
        ...c,
        stock: Math.min(STOCK_TOPLINE, Math.max(STOCK_BASELINE, c.stock || STOCK_BASELINE))
      }));
      return { ...st, catalog, products: toProducts(catalog) };
    }
    const fresh = demoCatalog(DEMO_STORES[idx], idx);
    const byName = new Map(fresh.map(f => [f.name, f]));
    const kept = st.catalog.map(c => {
      const freshProd = byName.get(c.name);
      return {
        ...c,
        image: c.image ?? freshProd?.image,
        // Upgrade product stock to fresh tiered distribution [23, 129]
        stock: freshProd ? freshProd.stock : Math.min(STOCK_TOPLINE, Math.max(STOCK_BASELINE, c.stock || STOCK_BASELINE))
      };
    });
    const have = new Set(kept.map(c => c.name));
    const catalog = [...kept, ...fresh.filter(f => !have.has(f.name))];
    return { ...st, catalog, products: toProducts(catalog) };
  });
}

function initializeExtendedStores(): ExtendedStore[] {
  return DEMO_STORES.map((s, idx) => ({
    ...s,
    businessType: s.category,
    themeName: idx % 2 === 0 ? 'Aurora' : 'Sunset',
    announcement: `Free express shipping on all orders over ₹999 across India!`,
    bannerTitle: s.tagline,
    contactEmail: `support@${s.slug}.retailsync.app`,
    contactPhone: '+91 98765 43210',
    contactAddress: 'Bengaluru, Karnataka, India',
    catalog: demoCatalog(s, idx)
  }));
}

const INITIAL_ORDERS: StoreOrder[] = [
  {
    id: 'ord-101',
    orderNumber: '#RS-8904',
    storeId: 'store-1',
    storeName: 'CircuitHub',
    customerName: 'Kushal Challa',
    customerEmail: 'kushalchalla981@gmail.com',
    customerCity: 'Bengaluru',
    items: [{ name: 'Noise-Cancelling Headphones', price: '₹8,999', quantity: 1, emoji: '🎧' }],
    total: '₹8,999',
    status: 'Delivered',
    paymentId: 'pay_rzp_live_890472',
    createdAt: '10 mins ago'
  },
  {
    id: 'ord-102',
    orderNumber: '#RS-8903',
    storeId: 'store-2',
    storeName: 'Threadline',
    customerName: 'Aarav Sharma',
    customerEmail: 'aarav@example.com',
    customerCity: 'Mumbai',
    items: [{ name: 'Linen Overshirt', price: '₹3,299', quantity: 1, emoji: '👔' }],
    total: '₹3,299',
    status: 'Shipped',
    paymentId: 'pay_rzp_live_890321',
    createdAt: '35 mins ago'
  },
  {
    id: 'ord-103',
    orderNumber: '#RS-8902',
    storeId: 'store-3',
    storeName: 'Peel & Pour',
    customerName: 'Priya Nair',
    customerEmail: 'priya.nair@example.com',
    customerCity: 'Delhi',
    items: [
      { name: 'Cold-Brew Coffee (500ml)', price: '₹349', quantity: 2, emoji: '☕' },
      { name: 'Mango Chilli Jam', price: '₹249', quantity: 1, emoji: '🍯' }
    ],
    total: '₹947',
    status: 'Processing',
    paymentId: 'pay_rzp_live_890288',
    createdAt: '2 hours ago'
  },
  {
    id: 'ord-104',
    orderNumber: '#RS-8901',
    storeId: 'store-4',
    storeName: 'Folio & Spine',
    customerName: 'Rohan Mehta',
    customerEmail: 'rohan.m@example.com',
    customerCity: 'Bengaluru',
    items: [{ name: 'The Design of Everyday Things', price: '₹699', quantity: 1, emoji: '📐' }],
    total: '₹699',
    status: 'Processing',
    paymentId: 'pay_rzp_live_890114',
    createdAt: '5 hours ago'
  }
];

/** Merchant stores live in PostgreSQL (v1.04); demo stores stay built in. */
const isRemote = (id: string) => id.startsWith('ms_');
const STORAGE_KEY_REMOTE_CACHE = 'retailsync_remote_stores_v1';

export interface StoreUser {
  id: string;
  email: string;
}

type TokenGetter = () => Promise<string | null>;

/** Fill derived fields the UI relies on (server stores the document as sent). */
function normalize(s: ExtendedStore): ExtendedStore {
  const catalog = Array.isArray(s.catalog) ? s.catalog : [];
  return {
    ...s,
    catalog,
    products: toProducts(catalog),
    highlights: Array.isArray(s.highlights) ? s.highlights : [],
    avatarTheme: s.avatarTheme ?? {
      primaryColor: s.primaryColor,
      accentColor: s.accentColor,
      textColor: s.textColor || '#1a1918',
      symbol: s.symbol || '✦',
      bgGradient: 'from-amber-400 to-orange-500',
    },
  };
}

class StoreManager {
  private stores: ExtendedStore[] = [];
  private orders: StoreOrder[] = [];
  private listeners: (() => void)[] = [];
  private getToken: TokenGetter | null = null;
  /** Latest error from a server write, shown by the dashboard. */
  lastError: string | null = null;

  constructor() {
    this.load();
    void this.refresh();
    // v1.05: live stock and orders from every device (PostgreSQL commit -> SSE).
    onTelemetry(e => this.applyLive(e));
    onReconnect(() => void this.refreshStock());
  }

  /** Overwrite catalog stock with the server's live numbers. */
  private applyStock(rows: { storeId: string; productId: string; stock: number }[]) {
    if (!rows.length) return;
    const byStore = new Map<string, Map<string, number>>();
    rows.forEach(r => {
      if (!byStore.has(r.storeId)) byStore.set(r.storeId, new Map());
      byStore.get(r.storeId)!.set(r.productId, r.stock);
    });
    let changed = false;
    this.stores = this.stores.map(s => {
      const live = byStore.get(s.id);
      if (!live) return s;
      let storeChanged = false;
      const catalog = s.catalog.map(p => {
        const n = live.get(p.id);
        if (n === undefined || n === p.stock) return p;
        storeChanged = true;
        return { ...p, stock: n };
      });
      changed ||= storeChanged;
      return storeChanged ? { ...s, catalog, products: toProducts(catalog) } : s;
    });
    if (changed) this.save();
  }

  async refreshStock() {
    try {
      const res = await fetch(`${API_BASE}/api/stock`);
      if (!res.ok) return;
      const { items } = (await res.json()) as { items: { storeId: string; productId: string; stock: number }[] };
      this.applyStock(items);
    } catch {
      // offline: keep what we have
    }
  }

  private applyLive(e: TelemetryEvent) {
    if ((e.type === 'inventory.decrement' || e.type === 'stock.updated') && e.storeId && e.productId && typeof e.stockAfter === 'number') {
      this.applyStock([{ storeId: e.storeId, productId: e.productId, stock: e.stockAfter }]);
    }
    if (e.type === 'order.placed' && e.items?.length && e.paymentId) {
      // Orders placed on other devices; the buyer's own device already recorded them.
      const byStore = new Map<string, NonNullable<TelemetryEvent['items']>>();
      e.items.forEach(i => byStore.set(i.storeId, [...(byStore.get(i.storeId) ?? []), i]));
      let added = false;
      byStore.forEach((lines, storeId) => {
        const store = this.getStore(storeId);
        if (!store || this.orders.some(o => o.paymentId === e.paymentId && o.storeId === storeId)) return;
        const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
        this.orders.unshift({
          id: `ord-${e.paymentId}-${storeId}`,
          orderNumber: `#RS-${e.paymentId!.slice(-4).toUpperCase()}`,
          storeId,
          storeName: store.name,
          customerName: 'Online shopper',
          customerEmail: '—',
          customerCity: '—',
          items: lines.map(l => ({ name: l.name, price: inr(l.unitPriceInr), quantity: l.qty, emoji: store.catalog.find(p => p.id === l.productId)?.emoji ?? '🛍️' })),
          total: inr(lines.reduce((n, l) => n + l.unitPriceInr * l.qty, 0)),
          status: 'Processing',
          paymentId: e.paymentId!,
          createdAt: 'Just now',
        });
        added = true;
      });
      if (added) this.saveOrders();
    }
  }

  /** Persist a stock level server-side (owner-only; demo stores need the platform owner). */
  private pushStock(storeId: string, productId: string, stock: number) {
    this.lastError = null;
    this.api('PUT', `/stock/${encodeURIComponent(storeId)}/${encodeURIComponent(productId)}`, { stock }).catch(e => {
      this.fail(e);
      void this.refreshStock();
    });
  }

  private load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_STORES);
      const local: ExtendedStore[] = stored ? upgradeDemoStores(JSON.parse(stored)).filter(s => !isRemote(s.id)) : initializeExtendedStores();
      const cached = localStorage.getItem(STORAGE_KEY_REMOTE_CACHE);
      const remote: ExtendedStore[] = cached ? (JSON.parse(cached) as ExtendedStore[]).map(normalize) : [];
      this.stores = [...remote, ...local];
      if (!stored) this.save();

      const storedOrders = localStorage.getItem(STORAGE_KEY_ORDERS);
      if (storedOrders) {
        this.orders = JSON.parse(storedOrders);
      } else {
        this.orders = INITIAL_ORDERS;
        this.saveOrders();
      }
    } catch {
      this.stores = initializeExtendedStores();
      this.orders = INITIAL_ORDERS;
    }
  }

  /** Local (demo/legacy) stores go to localStorage; merchant stores only to a read cache. */
  private save() {
    try {
      localStorage.setItem(STORAGE_KEY_STORES, JSON.stringify(this.stores.filter(s => !isRemote(s.id))));
      localStorage.setItem(STORAGE_KEY_REMOTE_CACHE, JSON.stringify(this.stores.filter(s => isRemote(s.id))));
    } catch {
      // ignore quota errors
    }
    this.notify();
  }

  private saveOrders() {
    try {
      localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(this.orders));
    } catch {
      // ignore
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  subscribe(fn: () => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  /** Called once by the app with Clerk's getToken so writes can be authorised. */
  setTokenGetter(fn: TokenGetter) {
    this.getToken = fn;
  }

  private async api(method: string, path: string, body?: unknown): Promise<Response> {
    const token = this.getToken ? await this.getToken() : null;
    if (!token) throw new Error('Please sign in again to save store changes.');
    const res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new Error(err?.error?.message || `Request failed (${res.status})`);
    }
    return res;
  }

  private fail(e: unknown) {
    this.lastError = e instanceof Error ? e.message : String(e);
    console.error('[storeManager]', this.lastError);
    void this.refresh(); // fall back to the server's truth
  }

  /** Pull every merchant store from the server (public list). */
  async refresh() {
    try {
      const res = await fetch(`${API_BASE}/api/stores`);
      if (!res.ok) return;
      const { items } = (await res.json()) as { items: ExtendedStore[] };
      this.stores = [...items.map(normalize), ...this.stores.filter(s => !isRemote(s.id))];
      this.save();
      await this.refreshStock();
    } catch {
      // offline: keep cached stores
    }
  }

  private pushRemote(id: string) {
    if (!isRemote(id)) return;
    const store = this.getStore(id);
    if (!store) return;
    this.lastError = null;
    this.api('PUT', `/stores/${id}`, store).catch(e => this.fail(e));
  }

  getStores(): ExtendedStore[] {
    return this.stores;
  }

  getStore(id: string): ExtendedStore | undefined {
    return this.stores.find(s => s.id === id);
  }

  updateStore(id: string, updates: Partial<ExtendedStore>) {
    this.stores = this.stores.map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, ...updates };
      // Keep avatarTheme synced if primaryColor/accentColor changed
      if (updates.primaryColor || updates.accentColor) {
        updated.avatarTheme = {
          ...updated.avatarTheme,
          primaryColor: updates.primaryColor || updated.primaryColor,
          accentColor: updates.accentColor || updated.accentColor,
        };
      }
      return updated;
    });
    this.save();
    this.pushRemote(id);
  }

  /** Creates the store on the server; the signed-in user becomes its owner. */
  async createStore(storeData: Omit<ExtendedStore, 'id' | 'products' | 'avatarTheme'>): Promise<ExtendedStore> {
    const draft = normalize({ ...storeData, id: 'draft', createdDate: new Date().toISOString() } as ExtendedStore);
    const { id: _id, ...body } = draft;
    const res = await this.api('POST', '/stores', body);
    const created = normalize((await res.json()) as ExtendedStore);
    this.stores = [created, ...this.stores];
    this.save();
    return created;
  }

  /** Owned stores: merchant stores by verified owner id; legacy local ones by email. Platform owner sees all. */
  getStoresForUser(user: StoreUser, isPlatformOwner: boolean): ExtendedStore[] {
    if (isPlatformOwner) return this.getStores();
    const email = user.email.trim().toLowerCase();
    return this.stores.filter(s =>
      isRemote(s.id) ? s.ownerId === user.id : !!email && s.ownerEmail?.trim().toLowerCase() === email,
    );
  }

  userOwnsStores(user: StoreUser): boolean {
    return this.getStoresForUser(user, false).length > 0;
  }

  /** Upload stores this user created in the browser before v1.04, then drop the local copies. */
  async migrateLegacyStores(user: StoreUser) {
    const email = user.email.trim().toLowerCase();
    const demoIds = new Set(DEMO_STORES.map(d => d.id));
    const legacy = this.stores.filter(s => !isRemote(s.id) && !demoIds.has(s.id) && s.ownerEmail?.trim().toLowerCase() === email);
    for (const s of legacy) {
      try {
        const { id: _id, ...body } = s;
        const res = await this.api('POST', '/stores', body);
        const created = normalize((await res.json()) as ExtendedStore);
        this.stores = [created, ...this.stores.filter(x => x.id !== s.id)];
        this.save();
      } catch (e) {
        this.fail(e);
        return;
      }
    }
  }

  deleteStore(id: string) {
    this.stores = this.stores.filter(s => s.id !== id);
    this.save();
    if (isRemote(id)) this.api('DELETE', `/stores/${id}`).catch(e => this.fail(e));
  }

  addProduct(storeId: string, product: Omit<ProductItem, 'id'>) {
    const newId = `${storeId}-prod-${Date.now()}`;
    const clampedStock = Math.min(STOCK_TOPLINE, Math.max(0, product.stock ?? STOCK_BASELINE));
    const newProduct: ProductItem = { ...product, id: newId, stock: clampedStock };
    this.stores = this.stores.map(s => {
      if (s.id !== storeId) return s;
      const updatedCatalog = [newProduct, ...s.catalog];
      return { ...s, catalog: updatedCatalog, products: toProducts(updatedCatalog) };
    });
    this.save();
    if (isRemote(storeId)) this.pushRemote(storeId);
    else this.pushStock(storeId, newId, clampedStock);
  }

  updateProductStock(storeId: string, productId: string, newStock: number) {
    const clampedStock = Math.min(STOCK_TOPLINE, Math.max(0, newStock));
    this.stores = this.stores.map(s => {
      if (s.id !== storeId) return s;
      const updatedCatalog = s.catalog.map(p => p.id === productId ? { ...p, stock: clampedStock } : p);
      return { ...s, catalog: updatedCatalog, products: toProducts(updatedCatalog) };
    });
    this.save();
    this.pushStock(storeId, productId, clampedStock);
  }

  deleteProduct(storeId: string, productId: string) {
    this.stores = this.stores.map(s => {
      if (s.id !== storeId) return s;
      const updatedCatalog = s.catalog.filter(p => p.id !== productId);
      return { ...s, catalog: updatedCatalog, products: toProducts(updatedCatalog) };
    });
    this.save();
    this.pushRemote(storeId);
  }

  getOrders(): StoreOrder[] {
    return this.orders;
  }

  updateOrderStatus(orderId: string, status: StoreOrder['status']) {
    this.orders = this.orders.map(o => o.id === orderId ? { ...o, status } : o);
    this.saveOrders();
  }

  addOrder(orderData: Omit<StoreOrder, 'id' | 'createdAt'>): StoreOrder {
    const order: StoreOrder = {
      ...orderData,
      id: `ord-${Date.now()}`,
      createdAt: 'Just now'
    };
    // The live stream may have recorded this payment already (without customer details).
    this.orders = this.orders.filter(o => !(o.paymentId === order.paymentId && o.storeId === order.storeId));
    this.orders.unshift(order);
    this.saveOrders();
    return order;
  }
}

export const storeManager = new StoreManager();
