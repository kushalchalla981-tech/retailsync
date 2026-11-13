/**
 * Order event hook point (the Phase 3 seam).
 *
 * Checkout calls `notifyOrderPlaced` exactly once per NEW order, strictly
 * after the PostgreSQL transaction has committed, and never for a replayed
 * (already checked-out) cart or a failed checkout. In this phase the sink is
 * `noopOrderEventSink`; Phase 3 replaces it with a Kafka publisher (topics
 * `orders.placed` / `inventory.updated`) injected via `buildApp({ orderEvents })`.
 *
 * Deliberately free of any Kafka import: this module only defines the
 * contract, so the store engine never depends on the broker.
 */

/** Minimal logger shape (Fastify's request.log and pino both satisfy it). */
export interface EventLogger {
  error(obj: object, msg?: string): void;
}

export interface OrderPlacedItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  /** Decimal string exactly as PostgreSQL NUMERIC returned it (no float rounding). */
  unitPrice: string;
  /** Decimal string exactly as PostgreSQL NUMERIC returned it. */
  lineTotal: string;
}

/** Post-decrement stock of one inventory row touched by the order. */
export interface OrderPlacedInventory {
  inventoryId: string;
  productId: string;
  locationId: string;
  stockQuantity: number;
}

export interface OrderPlacedEvent {
  type: 'order.placed';
  version: 1;
  orderId: string;
  customerId: string;
  cartId: string;
  locationId: string;
  locationName: string;
  city: string;
  status: string;
  /** Decimal string exactly as PostgreSQL NUMERIC returned it. */
  totalAmount: string;
  /** ISO-8601 timestamp of the order row. */
  placedAt: string;
  items: OrderPlacedItem[];
  inventory: OrderPlacedInventory[];
}

export interface OrderEventSink {
  orderPlaced(event: OrderPlacedEvent): Promise<void>;
}

/** Default sink for this phase: accepts every event and does nothing. */
export const noopOrderEventSink: OrderEventSink = {
  async orderPlaced() {
    // Phase 3: Kafka publisher.
  },
};

/**
 * Deliver an order event to the sink. The order is already committed when this
 * runs, so a sink failure must never fail the checkout: it is logged (order id
 * and error only, never customer details) and swallowed.
 */
export async function notifyOrderPlaced(sink: OrderEventSink, event: OrderPlacedEvent, log: EventLogger): Promise<void> {
  try {
    await sink.orderPlaced(event);
  } catch (err) {
    log.error({ err, orderId: event.orderId }, 'order event sink failed; the order is already committed and stays placed');
  }
}
