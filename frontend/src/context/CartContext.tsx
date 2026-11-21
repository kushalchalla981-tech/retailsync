import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { parseInr } from '../utils/currency';

export interface CartItem {
  storeId: string;
  /** Catalog product id, used to reserve live stock at checkout (absent on carts saved before v1.05). */
  productId?: string;
  storeName: string;
  storeSlug: string;
  storeColor: string;
  name: string;
  priceInr: number;
  emoji: string;
  image?: string;
  qty: number;
}

export type CartProduct = Omit<CartItem, 'qty' | 'priceInr'> & { price: string };

interface CartValue {
  items: CartItem[];
  count: number;
  subtotalInr: number;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  add: (product: CartProduct, qty: number) => void;
  setQty: (storeId: string, name: string, qty: number) => void;
  remove: (storeId: string, name: string) => void;
  clear: () => void;
}

const KEY = 'retailsync_cart_v1';
export const MAX_QTY = 10;
const Ctx = createContext<CartValue | null>(null);

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.name === 'string' && i.qty > 0) : [];
  } catch {
    return [];
  }
}

const same = (i: CartItem, storeId: string, name: string) => i.storeId === storeId && i.name === name;
const clamp = (q: number) => Math.max(1, Math.min(MAX_QTY, Math.floor(q)));

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(load);
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items]);

  const add = useCallback((p: CartProduct, qty: number) => {
    setItems((prev) => {
      const existing = prev.find((i) => same(i, p.storeId, p.name));
      if (existing) return prev.map((i) => (i === existing ? { ...i, qty: clamp(i.qty + qty) } : i));
      const { price, ...rest } = p;
      return [...prev, { ...rest, priceInr: parseInr(price), qty: clamp(qty) }];
    });
  }, []);

  const setQty = useCallback((storeId: string, name: string, qty: number) => {
    setItems((prev) => prev.map((i) => (same(i, storeId, name) ? { ...i, qty: clamp(qty) } : i)));
  }, []);

  const remove = useCallback((storeId: string, name: string) => {
    setItems((prev) => prev.filter((i) => !same(i, storeId, name)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartValue>(() => ({
    items,
    count: items.reduce((n, i) => n + i.qty, 0),
    subtotalInr: items.reduce((n, i) => n + i.priceInr * i.qty, 0),
    isOpen, setOpen, add, setQty, remove, clear,
  }), [items, isOpen, add, setQty, remove, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useCart(): CartValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart must be used inside CartProvider');
  return v;
}
