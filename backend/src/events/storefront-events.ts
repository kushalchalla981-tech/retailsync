/**
 * Storefront event contract (v1.05). Routes call the sink after PostgreSQL has
 * committed; production injects the Kafka publisher (events/kafka-pipeline.ts),
 * tests and builds without Kafka use the no-op sink. Payloads carry no
 * customer data.
 */
export interface StorefrontOrderEvent {
  type: 'storefront.order';
  orderId: string;
  paymentId: string;
  placedAt: string;
  totalInr: number | null;
  items: { storeId: string; productId?: string; name: string; qty: number; unitPriceInr: number }[];
}

export interface StorefrontStockEvent {
  type: 'storefront.stock';
  storeId: string;
  productId: string;
  stockAfter: number;
  /** Units added (positive) or removed (negative); null when a merchant set an absolute value. */
  delta: number | null;
  reason: 'checkout' | 'merchant';
  orderId?: string;
  at: string;
}

export interface StorefrontEventSink {
  orderPlaced(event: StorefrontOrderEvent): Promise<void>;
  stockChanged(events: StorefrontStockEvent[]): Promise<void>;
}

export const noopStorefrontEvents: StorefrontEventSink = {
  async orderPlaced() {},
  async stockChanged() {},
};
