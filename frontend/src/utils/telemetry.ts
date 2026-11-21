/**
 * One shared connection to the backend telemetry bus (v1.05).
 * Server-Sent Events from /api/telemetry/stream, falling back to polling
 * /api/telemetry/events when the stream cannot be held open (e.g. a proxy
 * that buffers). Feeds live stock/order sync and the About ledger.
 */
import { API_BASE } from './api';

export type Service = 'postgres' | 'kafka' | 'opensearch';

export interface TelemetryEvent {
  id: string;
  service: Service;
  type: string;
  at: string;
  message: string;
  topic?: string;
  partition?: number;
  offset?: string;
  latencyMs?: number;
  orderId?: string;
  productId?: string;
  sku?: string;
  stockAfter?: number;
  storeId?: string;
  delta?: number;
  paymentId?: string;
  totalInr?: number;
  items?: { storeId: string; productId?: string; name: string; qty: number; unitPriceInr: number }[];
}

export type LinkStatus = 'connecting' | 'live' | 'polling' | 'offline';

const MAX = 300;
const POLL_MS = 4000;
const recent: TelemetryEvent[] = [];
const seen = new Set<string>();
const listeners = new Set<(e: TelemetryEvent) => void>();
const statusListeners = new Set<(s: LinkStatus) => void>();
const reconnectListeners = new Set<() => void>();
let status: LinkStatus = 'offline';
let started = false;
let cursor: string | null = null;

function setStatus(s: LinkStatus) {
  status = s;
  statusListeners.forEach((fn) => fn(s));
}

function deliver(e: TelemetryEvent) {
  if (seen.has(e.id)) return;
  seen.add(e.id);
  recent.push(e);
  if (recent.length > MAX) seen.delete(recent.shift()!.id);
  if (!cursor || Number(e.id) > Number(cursor)) cursor = e.id;
  listeners.forEach((fn) => fn(e));
}

async function poll() {
  try {
    const res = await fetch(`${API_BASE}/api/telemetry/events${cursor ? `?after=${encodeURIComponent(cursor)}` : ''}`);
    if (!res.ok) throw new Error(String(res.status));
    const { items } = (await res.json()) as { items: TelemetryEvent[] };
    items.forEach(deliver);
    return true;
  } catch {
    return false;
  }
}

function startPolling() {
  setStatus('polling');
  const tick = async () => {
    if (!(await poll())) setStatus('offline');
    else if (status !== 'polling') {
      setStatus('polling');
      reconnectListeners.forEach((fn) => fn());
    }
    window.setTimeout(tick, POLL_MS);
  };
  void tick();
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  setStatus('connecting');
  void poll(); // backfill the buffer for the ledger
  if (typeof EventSource === 'undefined') return startPolling();
  let failures = 0;
  const es = new EventSource(`${API_BASE}/api/telemetry/stream`);
  es.onopen = () => {
    failures = 0;
    setStatus('live');
    reconnectListeners.forEach((fn) => fn()); // catch up on anything missed while away
  };
  es.onmessage = (m) => {
    try { deliver(JSON.parse(m.data) as TelemetryEvent); } catch { /* ignore malformed */ }
  };
  es.onerror = () => {
    failures += 1;
    if (failures >= 3) {
      es.close();
      startPolling();
    } else setStatus('connecting');
  };
}

/** Subscribe to every new event. Starts the connection on first use. */
export function onTelemetry(fn: (e: TelemetryEvent) => void): () => void {
  start();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onLinkStatus(fn: (s: LinkStatus) => void): () => void {
  start();
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}

/** Called after the link (re)opens, so callers can refetch state they may have missed. */
export function onReconnect(fn: () => void): () => void {
  reconnectListeners.add(fn);
  return () => reconnectListeners.delete(fn);
}

export const recentTelemetry = () => [...recent];
