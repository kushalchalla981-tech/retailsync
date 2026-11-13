/**
 * The single typed client for the RetailSync Fastify API (/api prefix).
 * Every call is timed in the browser and written to the live ledger, so
 * each figure on screen traces back to a real request.
 */
import type {
  ApiErrorBody,
  Cart,
  Category,
  CheckoutResult,
  InventoryRecord,
  Order,
  Product,
  ProductPage,
  SearchResult,
  ServerTelemetryEvent,
  StoreLocation,
} from '../types';
import { record, setFeed, type Service } from './ledger';

const BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** Route not deployed yet (as opposed to a missing resource). */
  get notDeployed() {
    return this.status === 404 && this.code === 'ROUTE_NOT_FOUND';
  }
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  service?: Service;
  /** Skip the generic ledger line (caller writes a richer one). */
  quiet?: boolean;
  signal?: AbortSignal;
}

export interface Timed<T> {
  data: T;
  ms: number;
  status: number;
}

function query(params: Record<string, string | number | boolean | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function call<T>(path: string, opts: CallOptions = {}): Promise<Timed<T>> {
  const method = opts.method ?? 'GET';
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: opts.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    setFeed({ api: 'down' });
    record({
      service: 'api',
      stamp: 'fail',
      title: `${method} /api${path.split('?')[0]}`,
      fields: [['result', 'network error, API unreachable']],
      source: 'client',
    });
    throw new ApiError(0, 'NETWORK', 'The RetailSync API is unreachable. Start the backend on port 3000 and retry.');
  }
  const ms = performance.now() - t0;
  setFeed({ api: 'live' });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!opts.quiet) {
    record({
      service: opts.service ?? 'pg',
      stamp: res.ok ? 'info' : 'fail',
      title: `${method} /api${path.split('?')[0]}`,
      fields: [
        ['status', String(res.status)],
        ['round trip', `${ms.toFixed(1)} ms`],
      ],
      source: 'client',
    });
  }
  if (!res.ok) {
    const e = (json as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? res.statusText, e?.details, e?.requestId);
  }
  return { data: json as T, ms, status: res.status };
}

// --- Catalog (PostgreSQL) ---------------------------------------------------

export const api = {
  categories: async () => (await call<{ items: Category[] }>('/categories')).data.items,
  locations: async () => (await call<{ items: StoreLocation[] }>('/locations')).data.items,
  products: async (f: { category?: string; locationId?: string; city?: string; inStock?: boolean; limit?: number; offset?: number }) =>
    (await call<ProductPage>(`/products${query({ limit: 100, ...f })}`)).data,
  product: async (id: string) => (await call<{ product: Product }>(`/products/${id}`)).data.product,
  inventory: async (productId: string, locationId?: string, quiet = false) =>
    (await call<{ items: InventoryRecord[] }>(`/inventory${query({ productId, locationId })}`, { quiet })).data.items,

  // --- Carts (PostgreSQL, cart-row FOR UPDATE) ---
  createCart: async (locationId: string, quiet = false) =>
    (await call<{ cart: Cart }>('/carts', { method: 'POST', body: { locationId }, quiet })).data.cart,
  getCart: async (cartId: string) => (await call<{ cart: Cart }>(`/carts/${cartId}`)).data.cart,
  setCartLocation: async (cartId: string, locationId: string) =>
    (await call<{ cart: Cart }>(`/carts/${cartId}`, { method: 'PATCH', body: { locationId } })).data.cart,
  addItem: async (cartId: string, productId: string, quantity = 1, quiet = false) =>
    (await call<{ cart: Cart }>(`/carts/${cartId}/items`, { method: 'POST', body: { productId, quantity }, quiet })).data.cart,
  setQuantity: async (cartId: string, productId: string, quantity: number) =>
    (await call<{ cart: Cart }>(`/carts/${cartId}/items/${productId}`, { method: 'PUT', body: { quantity } })).data.cart,
  removeItem: async (cartId: string, productId: string) =>
    (await call<{ cart: Cart }>(`/carts/${cartId}/items/${productId}`, { method: 'DELETE' })).data.cart,

  /** Locked ACID checkout (plan 02-02). 201 new order, 200 replay, 409 OUT_OF_STOCK. */
  checkout: async (cartId: string, customer: { name: string; email: string }, label?: string): Promise<Timed<CheckoutResult>> => {
    try {
      const r = await call<CheckoutResult>(`/carts/${cartId}/checkout`, { method: 'POST', body: { customer }, quiet: true });
      setFeed({ checkout: 'live' });
      const o = r.data.order;
      record({
        service: 'pg',
        stamp: 'ok',
        title: r.data.replayed ? 'Checkout replayed, same order returned' : 'Transaction committed',
        fields: [
          ...(label ? ([['buyer', label]] as [string, string][]) : []),
          ['order', short(o.id)],
          ['store', o.location?.name ?? '—'],
          ['total', inr(o.totalAmount)],
          ['lock wait', o.lockWaitMs === undefined ? 'not reported by server' : `${o.lockWaitMs} ms`],
          ['round trip', `${r.ms.toFixed(1)} ms`],
        ],
        source: o.lockWaitMs === undefined ? 'client' : 'server',
      });
      return r;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.notDeployed) setFeed({ checkout: 'unavailable' });
        else setFeed({ checkout: 'live' });
        record({
          service: 'pg',
          stamp: 'fail',
          title: err.code === 'OUT_OF_STOCK' ? 'Rolled back, 409 out of stock' : err.notDeployed ? 'Checkout endpoint not deployed yet' : `Checkout failed, ${err.code}`,
          fields: [...(label ? ([['buyer', label]] as [string, string][]) : []), ['status', String(err.status)], ['message', err.message]],
          source: 'client',
        });
      }
      throw err;
    }
  },
  order: async (orderId: string) => (await call<{ order: Order }>(`/orders/${orderId}`)).data.order,

  /** Fuzzy search via OpenSearch (phase 3). Throws ApiError.notDeployed until then. */
  search: async (f: { q: string; category?: string; city?: string; minPrice?: number; maxPrice?: number }, signal?: AbortSignal) => {
    try {
      const r = await call<SearchResult>(`/search${query({ ...f, limit: 100 })}`, { service: 'os', quiet: true, signal });
      setFeed({ search: 'live' });
      const took = r.data.tookMs ?? r.data.took;
      record({
        service: 'os',
        stamp: 'info',
        title: `Search "${f.q}"`,
        fields: [
          ['hits', String(r.data.total)],
          ['took', took === undefined ? 'not reported' : `${took} ms`],
          ['round trip', `${r.ms.toFixed(1)} ms`],
        ],
        source: took === undefined ? 'client' : 'server',
      });
      return { ...r.data, roundTripMs: r.ms };
    } catch (err) {
      if (err instanceof ApiError && err.notDeployed) setFeed({ search: 'unavailable' });
      throw err;
    }
  },
};

// --- Telemetry feed (phase 3) ----------------------------------------------

const seenTelemetry = new Set<string>();

function telemetryToLedger(ev: ServerTelemetryEvent & { id?: string }) {
  // SSE reconnects and polling can both deliver an event; record each id once.
  if (ev.id) {
    if (seenTelemetry.has(ev.id)) return;
    seenTelemetry.add(ev.id);
  }
  const service: Service = ev.service === 'kafka' ? 'kafka' : ev.service === 'opensearch' ? 'os' : 'pg';
  const fields: [string, string][] = [];
  if (ev.topic) fields.push(['topic', ev.topic]);
  if (ev.partition !== undefined) fields.push(['partition', String(ev.partition)]);
  if (ev.offset !== undefined) fields.push(['offset', String(ev.offset)]);
  if (ev.lockWaitMs !== undefined) fields.push(['lock wait', `${ev.lockWaitMs} ms`]);
  if (ev.latencyMs !== undefined) fields.push([service === 'os' ? 'sync latency' : 'latency', `${ev.latencyMs} ms`]);
  if (ev.sku) fields.push(['sku', ev.sku]);
  if (ev.stockBefore !== undefined && ev.stockAfter !== undefined) fields.push(['stock', `${ev.stockBefore} → ${ev.stockAfter}`]);
  if (ev.orderId) fields.push(['order', short(ev.orderId)]);
  record({
    service,
    stamp: /reject|fail|error/i.test(ev.type) ? 'fail' : /wait/i.test(ev.type) ? 'wait' : 'ok',
    title: ev.message ?? ev.type,
    fields,
    source: 'server',
    at: ev.at ? Date.parse(ev.at) || undefined : undefined,
  });
}

/** Connects to SSE /api/telemetry/stream, falls back to polling /api/telemetry/events. */
export function connectTelemetry(): () => void {
  let stopped = false;
  let es: EventSource | null = null;
  let timer: number | undefined;
  let cursor: string | undefined;

  const handle = (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as ServerTelemetryEvent | ServerTelemetryEvent[];
      (Array.isArray(parsed) ? parsed : [parsed]).forEach(telemetryToLedger);
    } catch {
      /* ignore malformed frames */
    }
  };

  const poll = async () => {
    if (stopped) return;
    try {
      const res = await fetch(`${BASE}/api/telemetry/events${query({ after: cursor })}`);
      if (res.status === 404) {
        setFeed({ telemetry: 'unavailable' });
        timer = window.setTimeout(start, 30_000);
        return;
      }
      if (res.ok) {
        setFeed({ telemetry: 'live' });
        const body = (await res.json()) as { items?: (ServerTelemetryEvent & { id?: string })[]; next?: string };
        (body.items ?? []).forEach(telemetryToLedger);
        cursor = body.next ?? body.items?.[body.items.length - 1]?.id ?? cursor;
      }
    } catch {
      setFeed({ telemetry: 'unavailable' });
    }
    timer = window.setTimeout(poll, 2_000);
  };

  const start = async () => {
    if (stopped) return;
    setFeed({ telemetry: 'connecting' });
    const ctrl = new AbortController();
    try {
      const probe = await fetch(`${BASE}/api/telemetry/stream`, { signal: ctrl.signal, headers: { accept: 'text/event-stream' } });
      const isStream = probe.ok && (probe.headers.get('content-type') ?? '').includes('text/event-stream');
      ctrl.abort();
      if (!isStream) return poll();
      es = new EventSource(`${BASE}/api/telemetry/stream`);
      es.onopen = () => setFeed({ telemetry: 'live' });
      es.onmessage = (m) => handle(m.data as string);
      es.onerror = () => setFeed({ telemetry: 'connecting' });
    } catch {
      setFeed({ telemetry: 'unavailable' });
      timer = window.setTimeout(start, 30_000);
    }
  };

  void start();
  return () => {
    stopped = true;
    es?.close();
    window.clearTimeout(timer);
  };
}

// --- formatting --------------------------------------------------------------

export const short = (id: string) => (id.length > 10 ? `${id.slice(0, 8)}…` : id);
const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const inr = (n: number) => inrFmt.format(n);
