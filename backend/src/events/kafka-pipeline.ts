/**
 * Event-driven pipeline on Aiven Kafka:
 *
 *   checkout COMMIT ──► orders.placed ──► inventory consumer ──► inventory.updated ──► search-sync consumer ──► OpenSearch
 *
 * - `kafkaOrderEventSink` publishes each committed order (key = orderId).
 * - The inventory consumer reacts to `orders.placed`: it reads the committed
 *   stock for every touched inventory row from PostgreSQL (the source of truth;
 *   the decrement already happened under row locks) and emits one
 *   `inventory.updated` per affected product/location.
 * - The search-sync consumer reacts to `inventory.updated`: it rebuilds the
 *   product document from PostgreSQL and indexes it into OpenSearch, so search
 *   results reflect stock within the measured sync latency.
 *
 * Every consumer is idempotent: it always writes the current committed state,
 * so a redelivered message re-applies the same values.
 */
import type { Consumer } from 'kafkajs';

import { loadProductDocuments } from '../scripts/seed.js';
import { PRODUCTS_ALIAS } from '../search/mappings.js';
import { createConsumer, getProducer } from '../services/kafka.js';
import { getOpenSearch } from '../services/opensearch.js';
import type { Queryable } from '../store/db.js';
import { emitTelemetry } from '../telemetry/bus.js';
import { TOPICS } from '../kafka/topics.js';
import type { OrderEventSink, OrderPlacedEvent } from './order-events.js';
import type { StorefrontEventSink, StorefrontOrderEvent, StorefrontStockEvent } from './storefront-events.js';

export const ORDERS_TOPIC = 'orders.placed';
export const INVENTORY_TOPIC = 'inventory.updated';

export interface InventoryUpdatedEvent {
  type: 'inventory.updated';
  version: 1;
  orderId: string;
  productId: string;
  sku: string;
  locationId: string;
  stockQuantity: number;
  /** When the originating order was committed; used to measure end-to-end sync latency. */
  orderPlacedAt: string;
}

interface Logger {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export const kafkaOrderEventSink: OrderEventSink = {
  async orderPlaced(event) {
    emitTelemetry({
      service: 'postgres',
      type: 'transaction.committed',
      message: `Order committed in PostgreSQL (${event.items.length} line${event.items.length === 1 ? '' : 's'}, ${event.city})`,
      orderId: event.orderId,
    });
    const started = performance.now();
    const producer = await getProducer();
    const [meta] = await producer.send({
      topic: ORDERS_TOPIC,
      messages: [{ key: event.orderId, value: JSON.stringify(event) }],
    });
    emitTelemetry({
      service: 'kafka',
      type: 'produce',
      message: `Published ${ORDERS_TOPIC}`,
      topic: ORDERS_TOPIC,
      partition: meta?.partition,
      offset: meta?.baseOffset,
      latencyMs: Math.round(performance.now() - started),
      orderId: event.orderId,
    });
  },
};

async function produce(topic: string, messages: { key: string; value: string }[], describe: string, extra: Partial<Parameters<typeof emitTelemetry>[0]> = {}) {
  if (!messages.length) return;
  const started = performance.now();
  const producer = await getProducer();
  const [meta] = await producer.send({ topic, messages });
  emitTelemetry({
    service: 'kafka',
    type: 'produce',
    message: `Published ${messages.length} message${messages.length === 1 ? '' : 's'} to ${topic}: ${describe}`,
    topic,
    partition: meta?.partition,
    offset: meta?.baseOffset,
    latencyMs: Math.round(performance.now() - started),
    ...extra,
  });
}

/** Storefront checkout and merchant stock edits -> retailsync-orders / retailsync-inventory. */
export const kafkaStorefrontEventSink: StorefrontEventSink = {
  async orderPlaced(event) {
    await produce(TOPICS.STOREFRONT_ORDERS, [{ key: event.orderId, value: JSON.stringify(event) }], `order ${event.orderId}`, { orderId: event.orderId });
  },
  async stockChanged(events) {
    await produce(
      TOPICS.STOREFRONT_INVENTORY,
      events.map((e) => ({ key: `${e.storeId}/${e.productId}`, value: JSON.stringify(e) })),
      events.length === 1 ? `${events[0]!.productId} -> ${events[0]!.stockAfter}` : 'stock levels',
      events.length === 1 ? { storeId: events[0]!.storeId, productId: events[0]!.productId, stockAfter: events[0]!.stockAfter } : {},
    );
  },
};

const STOCK_SQL = `SELECT i.product_id::text AS product_id, i.location_id::text AS location_id, i.stock_quantity, p.sku
  FROM inventory i JOIN products p ON p.id = i.product_id
 WHERE i.product_id = $1 AND i.location_id = $2`;

async function onOrderPlaced(db: Queryable, order: OrderPlacedEvent, meta: { partition: number; offset: string }): Promise<void> {
  emitTelemetry({
    service: 'kafka',
    type: 'consume',
    message: `Inventory consumer received ${ORDERS_TOPIC}`,
    topic: ORDERS_TOPIC,
    partition: meta.partition,
    offset: meta.offset,
    latencyMs: Date.now() - Date.parse(order.placedAt),
    orderId: order.orderId,
  });
  const producer = await getProducer();
  for (const row of order.inventory) {
    const { rows } = await db.query<{ product_id: string; location_id: string; stock_quantity: number; sku: string }>(STOCK_SQL, [
      row.productId,
      row.locationId,
    ]);
    const current = rows[0];
    if (!current) continue;
    const update: InventoryUpdatedEvent = {
      type: 'inventory.updated',
      version: 1,
      orderId: order.orderId,
      productId: current.product_id,
      sku: current.sku,
      locationId: current.location_id,
      stockQuantity: Number(current.stock_quantity),
      orderPlacedAt: order.placedAt,
    };
    const [sent] = await producer.send({
      topic: INVENTORY_TOPIC,
      messages: [{ key: update.productId, value: JSON.stringify(update) }],
    });
    emitTelemetry({
      service: 'kafka',
      type: 'produce',
      message: `Published ${INVENTORY_TOPIC} for ${update.sku}`,
      topic: INVENTORY_TOPIC,
      partition: sent?.partition,
      offset: sent?.baseOffset,
      orderId: order.orderId,
      productId: update.productId,
      sku: update.sku,
      stockAfter: update.stockQuantity,
    });
  }
}

async function onInventoryUpdated(db: Queryable, update: InventoryUpdatedEvent): Promise<void> {
  const [document] = await loadProductDocuments(db, update.productId);
  if (!document) return;
  await getOpenSearch().index({ index: PRODUCTS_ALIAS, id: String(document.product_id), body: document, refresh: true });
  emitTelemetry({
    service: 'opensearch',
    type: 'sync',
    message: `Search index updated for ${update.sku}`,
    latencyMs: Date.now() - Date.parse(update.orderPlacedAt),
    orderId: update.orderId,
    productId: update.productId,
    sku: update.sku,
    stockAfter: update.stockQuantity,
  });
}

/** Start both consumers in-process. Returns a stop function. */
export async function startPipeline(db: Queryable, log: Logger): Promise<() => Promise<void>> {
  const consumers: Consumer[] = [];
  const run = async (groupId: string, topic: string, handle: (value: string, meta: { partition: number; offset: string }) => Promise<void>) => {
    const consumer = createConsumer(groupId);
    consumers.push(consumer);
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ message, partition }) => {
        if (!message.value) return;
        try {
          await handle(message.value.toString(), { partition, offset: message.offset });
        } catch (err) {
          log.error({ err, topic, offset: message.offset }, 'pipeline consumer failed to process message');
          emitTelemetry({ service: 'kafka', type: 'consume.error', message: `Failed processing ${topic} @${message.offset}`, topic });
        }
      },
    });
    log.info({ groupId, topic }, 'kafka consumer running');
  };
  await run('retailsync-inventory', ORDERS_TOPIC, (value, meta) => onOrderPlaced(db, JSON.parse(value) as OrderPlacedEvent, meta));
  await run('retailsync-search-sync', INVENTORY_TOPIC, (value) => onInventoryUpdated(db, JSON.parse(value) as InventoryUpdatedEvent));
  // Storefront ledger consumers: confirm delivery and measure end-to-end lag.
  await run('retailsync-storefront-ledger', TOPICS.STOREFRONT_ORDERS, async (value, meta) => {
    const e = JSON.parse(value) as StorefrontOrderEvent;
    emitTelemetry({ service: 'kafka', type: 'consume', message: `Ledger consumer received order ${e.orderId}`, topic: TOPICS.STOREFRONT_ORDERS, partition: meta.partition, offset: meta.offset, latencyMs: Date.now() - Date.parse(e.placedAt), orderId: e.orderId });
  });
  await run('retailsync-storefront-stock', TOPICS.STOREFRONT_INVENTORY, async (value, meta) => {
    const e = JSON.parse(value) as StorefrontStockEvent;
    emitTelemetry({ service: 'kafka', type: 'consume', message: `Stock consumer received ${e.productId} -> ${e.stockAfter}`, topic: TOPICS.STOREFRONT_INVENTORY, partition: meta.partition, offset: meta.offset, latencyMs: Date.now() - Date.parse(e.at), storeId: e.storeId, productId: e.productId, stockAfter: e.stockAfter });
  });
  return async () => {
    await Promise.allSettled(consumers.map((c) => c.disconnect()));
  };
}
