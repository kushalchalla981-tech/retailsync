export type City = 'Bangalore' | 'Mumbai' | 'Delhi';

export interface StoreLocation {
  id: string;
  name: string;
  city: City;
  address: string;
}

export interface InventoryRecord {
  city: City;
  stock: number;
}

export interface Product {
  id: string;
  sku: string;
  title: string;
  description: string;
  category: 'Electronics' | 'Footwear & Apparel' | 'Home Goods' | 'Gourmet Grocery';
  price: number; // in INR ₹
  image: string;
  rating: number;
  inventory: Record<City, number>;
  tags: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedCity: City;
}

export interface OrderItem {
  productId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  city: City;
  items: OrderItem[];
  totalAmount: number;
  status: 'PENDING' | 'COMMITTED' | 'FAILED_OUT_OF_STOCK';
  createdAt: string;
  postgresTxId: string;
  kafkaOffset?: number;
}

// Telemetry Types for Aiven Hackathon P1 (Postgres, Kafka, OpenSearch)
export interface PostgresTxLog {
  id: string;
  timestamp: string;
  txId: string;
  query: string;
  latencyMs: number;
  status: 'COMMITTED' | 'ACQUIRING_LOCK' | 'ROLLEDBACK';
  lockAcquired: boolean;
  affectedRows: number;
}

export interface KafkaMessageLog {
  id: string;
  timestamp: string;
  topic: 'orders.placed' | 'inventory.updated';
  partition: number;
  offset: number;
  key: string;
  payload: Record<string, any>;
}

export interface OpenSearchSyncLog {
  id: string;
  timestamp: string;
  action: 'INDEX' | 'UPDATE_STOCK' | 'QUERY';
  index: string;
  docId: string;
  latencyMs: number;
  queryDSL?: Record<string, any>;
  score?: number;
}

export interface TelemetryStats {
  postgresTotalTxs: number;
  postgresActiveLocks: number;
  kafkaMessagesTotal: number;
  kafkaLag: number;
  openSearchTotalDocs: number;
  openSearchAvgQueryMs: number;
}
