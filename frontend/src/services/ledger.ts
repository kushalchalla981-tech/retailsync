import { useSyncExternalStore } from 'react';

export type Service = 'pg' | 'kafka' | 'os' | 'api';
export type Stamp = 'ok' | 'wait' | 'fail' | 'info';
/** Where a figure came from. Nothing on screen is invented. */
export type Source = 'client' | 'server';

export interface LedgerEntry {
  seq: number;
  at: number;
  service: Service;
  stamp: Stamp;
  title: string;
  fields: [string, string][];
  source: Source;
}

type Draft = Omit<LedgerEntry, 'seq' | 'at'> & { at?: number };

const MAX = 200;
let entries: LedgerEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();

export function record(draft: Draft): LedgerEntry {
  seq += 1;
  const entry: LedgerEntry = { ...draft, at: draft.at ?? Date.now(), seq };
  entries = [entry, ...entries].slice(0, MAX);
  listeners.forEach((l) => l());
  return entry;
}

export function clearLedger() {
  entries = [];
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLedger(): LedgerEntry[] {
  return useSyncExternalStore(subscribe, () => entries);
}

// ---------------------------------------------------------------------------
// Feed status: whether each service's server-side feed is reachable.

export type FeedState = 'connecting' | 'live' | 'unavailable';
export interface FeedStatus {
  telemetry: FeedState;
  search: 'unknown' | 'live' | 'unavailable';
  checkout: 'unknown' | 'live' | 'unavailable';
  api: 'unknown' | 'live' | 'down';
}

let status: FeedStatus = { telemetry: 'connecting', search: 'unknown', checkout: 'unknown', api: 'unknown' };
const statusListeners = new Set<() => void>();

export function setFeed(patch: Partial<FeedStatus>) {
  const next = { ...status, ...patch };
  if (Object.keys(patch).every((k) => status[k as keyof FeedStatus] === next[k as keyof FeedStatus])) return;
  status = next;
  statusListeners.forEach((l) => l());
}

export function useFeedStatus(): FeedStatus {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      return () => statusListeners.delete(l);
    },
    () => status,
  );
}
