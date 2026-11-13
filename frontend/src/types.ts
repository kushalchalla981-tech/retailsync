// Shapes mirror backend/src/store/*.ts and the 02-02 / phase-3 plan contracts.

export interface Category {
  id: string;
  slug: string;
  name: string;
  productCount: number;
}

export interface StoreLocation {
  id: string;
  name: string;
  city: string;
  address: string;
}

export interface InventoryEntry {
  locationId: string;
  locationName: string;
  city: string;
  stockQuantity: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string | null;
  category: { id: string; slug: string; name: string };
  inventory: InventoryEntry[];
  totalStock: number;
  inStock: boolean;
}

export interface ProductPage {
  items: Product[];
  total: number;
  limit: number;
  offset: number;
}

export interface InventoryRecord {
  productId: string;
  sku: string;
  productName: string;
  locationId: string;
  locationName: string;
  city: string;
  stockQuantity: number;
  inStock: boolean;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  availableQuantity: number;
}

export interface Cart {
  id: string;
  status: 'active' | 'checked_out' | 'abandoned';
  locationId: string | null;
  location: { id: string; name: string; city: string } | null;
  orderId: string | null;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  status: string;
  paymentStatus: string;
  cartId: string;
  customer: { id: string; name: string };
  location: { id: string; name: string; city: string };
  items: OrderItem[];
  totalAmount: number;
  createdAt: string;
  /** Optional server timing, shown only when the backend reports it. */
  lockWaitMs?: number;
}

export interface CheckoutResult {
  order: Order;
  replayed: boolean;
}

/** Phase 3 search contract (planned). Every field optional-tolerant. */
export interface SearchResult {
  items: Product[];
  total: number;
  tookMs?: number;
  took?: number;
  facets?: Record<string, { key: string; count: number }[]>;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown>; requestId: string };
}

/** Server telemetry event (phase 3 plan; parsed defensively). */
export interface ServerTelemetryEvent {
  service: 'postgres' | 'kafka' | 'opensearch';
  type: string;
  at?: string;
  topic?: string;
  partition?: number;
  offset?: number | string;
  lockWaitMs?: number;
  latencyMs?: number;
  orderId?: string;
  productId?: string;
  sku?: string;
  stockBefore?: number;
  stockAfter?: number;
  message?: string;
}
