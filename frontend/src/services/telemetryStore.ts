import { PostgresTxLog, KafkaMessageLog, OpenSearchSyncLog, TelemetryStats } from '../types';

type Listener = () => void;

class TelemetryStore {
  private postgresLogs: PostgresTxLog[] = [];
  private kafkaLogs: KafkaMessageLog[] = [];
  private openSearchLogs: OpenSearchSyncLog[] = [];
  private listeners: Set<Listener> = new Set();
  private currentOffset = 1042;
  private txCounter = 8901;

  constructor() {
    // Seed initial realistic baseline telemetry logs
    this.seedInitialTelemetry();
  }

  private seedInitialTelemetry() {
    const now = Date.now();
    this.postgresLogs = [
      {
        id: 'pg-init-1',
        timestamp: new Date(now - 15000).toISOString().split('T')[1].slice(0, 8),
        txId: 'tx_8899',
        query: 'SELECT stock_quantity FROM inventory WHERE product_id = $1 FOR UPDATE;',
        latencyMs: 1.8,
        status: 'COMMITTED',
        lockAcquired: true,
        affectedRows: 1,
      },
      {
        id: 'pg-init-2',
        timestamp: new Date(now - 8000).toISOString().split('T')[1].slice(0, 8),
        txId: 'tx_8900',
        query: 'UPDATE inventory SET stock_quantity = stock_quantity - 1 WHERE product_id = $1;',
        latencyMs: 2.4,
        status: 'COMMITTED',
        lockAcquired: false,
        affectedRows: 1,
      },
    ];

    this.kafkaLogs = [
      {
        id: 'kf-init-1',
        timestamp: new Date(now - 7800).toISOString().split('T')[1].slice(0, 8),
        topic: 'orders.placed',
        partition: 0,
        offset: 1040,
        key: 'ord-baseline-99',
        payload: {
          orderId: 'ord-baseline-99',
          customer: 'Aarav Sharma',
          city: 'Bangalore',
          total: 8995,
          itemsCount: 1,
        },
      },
      {
        id: 'kf-init-2',
        timestamp: new Date(now - 7600).toISOString().split('T')[1].slice(0, 8),
        topic: 'inventory.updated',
        partition: 1,
        offset: 1041,
        key: 'LOGI-MXM3S',
        payload: {
          sku: 'LOGI-MXM3S',
          city: 'Bangalore',
          newStock: 15,
          delta: -1,
          eventSource: 'checkout-service',
        },
      },
    ];

    this.openSearchLogs = [
      {
        id: 'os-init-1',
        timestamp: new Date(now - 7400).toISOString().split('T')[1].slice(0, 8),
        action: 'UPDATE_STOCK',
        index: 'retail_products_v1',
        docId: 'prod-elec-04',
        latencyMs: 8.2,
        score: 1.0,
      },
      {
        id: 'os-init-2',
        timestamp: new Date(now - 3000).toISOString().split('T')[1].slice(0, 8),
        action: 'QUERY',
        index: 'retail_products_v1',
        docId: 'multi_match',
        latencyMs: 14.5,
        queryDSL: {
          query: {
            multi_match: {
              query: 'sneakers',
              fields: ['title^3', 'description', 'tags^2'],
              fuzziness: 'AUTO',
            },
          },
        },
        score: 4.82,
      },
    ];
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public logPostgres(
    query: string,
    status: 'COMMITTED' | 'ACQUIRING_LOCK' | 'ROLLEDBACK',
    latencyMs: number,
    lockAcquired: boolean,
    affectedRows: number
  ): string {
    const txId = `tx_${this.txCounter++}`;
    const log: PostgresTxLog = {
      id: `pg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString().split('T')[1].slice(0, 8),
      txId,
      query,
      latencyMs,
      status,
      lockAcquired,
      affectedRows,
    };
    this.postgresLogs = [log, ...this.postgresLogs.slice(0, 49)];
    this.notify();
    return txId;
  }

  public logKafka(
    topic: 'orders.placed' | 'inventory.updated',
    key: string,
    payload: Record<string, any>
  ): number {
    const offset = ++this.currentOffset;
    const log: KafkaMessageLog = {
      id: `kf-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString().split('T')[1].slice(0, 8),
      topic,
      partition: Math.floor(Math.random() * 3),
      offset,
      key,
      payload,
    };
    this.kafkaLogs = [log, ...this.kafkaLogs.slice(0, 49)];
    this.notify();
    return offset;
  }

  public logOpenSearch(
    action: 'INDEX' | 'UPDATE_STOCK' | 'QUERY',
    docId: string,
    latencyMs: number,
    queryDSL?: Record<string, any>,
    score?: number
  ) {
    const log: OpenSearchSyncLog = {
      id: `os-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString().split('T')[1].slice(0, 8),
      action,
      index: 'retail_products_v1',
      docId,
      latencyMs,
      queryDSL,
      score,
    };
    this.openSearchLogs = [log, ...this.openSearchLogs.slice(0, 49)];
    this.notify();
  }

  public getPostgresLogs(): PostgresTxLog[] {
    return this.postgresLogs;
  }

  public getKafkaLogs(): KafkaMessageLog[] {
    return this.kafkaLogs;
  }

  public getOpenSearchLogs(): OpenSearchSyncLog[] {
    return this.openSearchLogs;
  }

  public getStats(): TelemetryStats {
    const avgQueryMs =
      this.openSearchLogs.length > 0
        ? Math.round(
            (this.openSearchLogs.reduce((acc, curr) => acc + curr.latencyMs, 0) /
              this.openSearchLogs.length) *
              10
          ) / 10
        : 12.4;

    return {
      postgresTotalTxs: this.postgresLogs.length + 120,
      postgresActiveLocks: this.postgresLogs.filter((l) => l.status === 'ACQUIRING_LOCK').length,
      kafkaMessagesTotal: this.kafkaLogs.length + 340,
      kafkaLag: 0,
      openSearchTotalDocs: 52,
      openSearchAvgQueryMs: avgQueryMs,
    };
  }

  public clear() {
    this.postgresLogs = [];
    this.kafkaLogs = [];
    this.openSearchLogs = [];
    this.notify();
  }
}

export const telemetryStore = new TelemetryStore();
