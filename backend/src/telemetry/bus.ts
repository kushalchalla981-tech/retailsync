/**
 * In-process telemetry bus: a bounded ring buffer of real pipeline events
 * (PostgreSQL commit, Kafka produce/consume, OpenSearch sync) that the
 * /api/telemetry routes expose to the storefront's live ledger.
 */
export interface TelemetryEvent {
  id: string;
  service: 'postgres' | 'kafka' | 'opensearch';
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
}

const CAPACITY = 300;
const buffer: TelemetryEvent[] = [];
const listeners = new Set<(event: TelemetryEvent) => void>();
let seq = 0;

export function emitTelemetry(draft: Omit<TelemetryEvent, 'id' | 'at'>): TelemetryEvent {
  const event: TelemetryEvent = { ...draft, id: String(++seq), at: new Date().toISOString() };
  buffer.push(event);
  if (buffer.length > CAPACITY) buffer.shift();
  for (const listener of listeners) listener(event);
  return event;
}

/** Events with id greater than `after` (all buffered events when omitted). */
export function telemetrySince(after?: string): TelemetryEvent[] {
  const cursor = after === undefined ? 0 : Number(after);
  return Number.isFinite(cursor) ? buffer.filter((e) => Number(e.id) > cursor) : [...buffer];
}

export function subscribeTelemetry(listener: (event: TelemetryEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
