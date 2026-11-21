import { DEMO_STORES, DemoStore } from './stores';

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

const toProducts = (catalog: ProductItem[]) => catalog.map(c => ({ name: c.name, price: c.price, emoji: c.emoji, image: c.image }));

function demoCatalog(s: DemoStore, idx: number): ProductItem[] {
  return s.products.map((p, pIdx) => ({
    id: `${s.id}-prod-${pIdx + 1}`,
    name: p.name,
    price: p.price,
    emoji: p.emoji,
    image: p.image,
    stock: [18, 4, 32, 2, 12, 45, 9, 27][(idx + pIdx) % 8],
    sku: `RS-${s.category.slice(0, 3).toUpperCase()}-${100 + pIdx}`,
    category: s.category,
    description: `Official genuine item curated by ${s.name}. Zero oversell stock locked in PostgreSQL.`
  }));
}

/**
 * Saved demo stores predate the v1.01 catalog (3 products, no photos). Add the
 * new demo products and photos while keeping the owner's edits (stock, deletions
 * of other items, store settings) and any stores they created.
 */
function upgradeDemoStores(stores: ExtendedStore[]): ExtendedStore[] {
  return stores.map(st => {
    const idx = DEMO_STORES.findIndex(d => d.id === st.id);
    if (idx < 0) return st;
    const fresh = demoCatalog(DEMO_STORES[idx], idx);
    const byName = new Map(fresh.map(f => [f.name, f]));
    const kept = st.catalog.map(c => ({ ...c, image: c.image ?? byName.get(c.name)?.image }));
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

class StoreManager {
  private stores: ExtendedStore[] = [];
  private orders: StoreOrder[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_STORES);
      if (stored) {
        this.stores = upgradeDemoStores(JSON.parse(stored));
      } else {
        this.stores = initializeExtendedStores();
        this.save();
      }

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

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY_STORES, JSON.stringify(this.stores));
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
  }

  createStore(storeData: Omit<ExtendedStore, 'id' | 'products' | 'avatarTheme'>): ExtendedStore {
    const id = `store-${Date.now()}`;
    const newStore: ExtendedStore = {
      ...storeData,
      id,
      products: toProducts(storeData.catalog),
      avatarTheme: {
        primaryColor: storeData.primaryColor,
        accentColor: storeData.accentColor,
        textColor: storeData.textColor || '#1a1918',
        symbol: storeData.symbol || '✦',
        bgGradient: 'from-amber-400 to-orange-500'
      }
    };
    this.stores.unshift(newStore);
    this.save();
    return newStore;
  }

  deleteStore(id: string) {
    this.stores = this.stores.filter(s => s.id !== id);
    this.save();
  }

  addProduct(storeId: string, product: Omit<ProductItem, 'id'>) {
    const newId = `${storeId}-prod-${Date.now()}`;
    const newProduct: ProductItem = { ...product, id: newId };
    this.stores = this.stores.map(s => {
      if (s.id !== storeId) return s;
      const updatedCatalog = [newProduct, ...s.catalog];
      return {
        ...s,
        catalog: updatedCatalog,
        products: toProducts(updatedCatalog)
      };
    });
    this.save();
  }

  updateProductStock(storeId: string, productId: string, newStock: number) {
    this.stores = this.stores.map(s => {
      if (s.id !== storeId) return s;
      const updatedCatalog = s.catalog.map(p => p.id === productId ? { ...p, stock: newStock } : p);
      return { ...s, catalog: updatedCatalog };
    });
    this.save();
  }

  deleteProduct(storeId: string, productId: string) {
    this.stores = this.stores.map(s => {
      if (s.id !== storeId) return s;
      const updatedCatalog = s.catalog.filter(p => p.id !== productId);
      return {
        ...s,
        catalog: updatedCatalog,
        products: toProducts(updatedCatalog)
      };
    });
    this.save();
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
    this.orders.unshift(order);
    this.saveOrders();
    return order;
  }
}

export const storeManager = new StoreManager();
