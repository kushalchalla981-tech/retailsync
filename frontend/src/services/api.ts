import { Product, City, Order, CartItem } from '../types';
import { INITIAL_PRODUCTS } from '../data/mockData';
import { telemetryStore } from './telemetryStore';

class ApiService {
  private products: Product[] = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
  private orders: Order[] = [];
  private orderSeq = 1001;

  public getProducts(): Product[] {
    return this.products;
  }

  public getProduct(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  /**
   * OpenSearch Typo-Tolerant Fuzzy Search Engine Simulation
   * Replicates OpenSearch multi_match query with fuzziness: AUTO
   */
  public searchProducts(query: string, category?: string, city?: City, maxPrice?: number): {
    results: Product[];
    typoCorrectedFrom?: string;
    matchedTerm?: string;
    latencyMs: number;
  } {
    const start = performance.now();
    const cleanQuery = query.trim().toLowerCase();

    // Typo mapping lexicon for common e-commerce search misspellings
    const typoDictionary: Record<string, string> = {
      snikers: 'sneakers',
      sneeker: 'sneakers',
      sneekers: 'sneakers',
      jordon: 'jordan',
      jordin: 'jordan',
      hedphone: 'headphones',
      headfones: 'headphones',
      headfone: 'headphones',
      smrtphone: 'macbook',
      kyboard: 'keyboard',
      keybrd: 'keyboard',
      cofee: 'coffee',
      espreso: 'espresso',
      vaccum: 'vacuum',
      vacum: 'vacuum',
      safron: 'saffron',
      safrn: 'saffron',
    };

    let effectiveQuery = cleanQuery;
    let typoCorrectedFrom: string | undefined = undefined;

    if (cleanQuery && typoDictionary[cleanQuery]) {
      typoCorrectedFrom = cleanQuery;
      effectiveQuery = typoDictionary[cleanQuery];
    }

    let filtered = this.products.filter((product) => {
      // Category filter
      if (category && category !== 'All' && product.category !== category) {
        return false;
      }

      // Max price filter
      if (maxPrice && product.price > maxPrice) {
        return false;
      }

      // City stock availability filter
      if (city && product.inventory[city] === 0) {
        return false;
      }

      // Text query match
      if (!effectiveQuery) return true;

      const titleMatch = product.title.toLowerCase().includes(effectiveQuery);
      const descMatch = product.description.toLowerCase().includes(effectiveQuery);
      const tagMatch = product.tags.some((tag) => tag.toLowerCase().includes(effectiveQuery));

      // Fuzzy fuzzy distance check for ~1-2 edits
      const fuzzyMatch = this.checkFuzzyMatch(product.title.toLowerCase(), effectiveQuery) ||
                         product.tags.some(tag => this.checkFuzzyMatch(tag.toLowerCase(), effectiveQuery));

      return titleMatch || descMatch || tagMatch || fuzzyMatch;
    });

    const latencyMs = Math.round((performance.now() - start + 4 + Math.random() * 8) * 10) / 10;

    // Log to OpenSearch telemetry
    if (query.trim()) {
      telemetryStore.logOpenSearch(
        'QUERY',
        `search_${Date.now()}`,
        latencyMs,
        {
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: cleanQuery,
                    fields: ['title^3', 'description', 'tags^2'],
                    fuzziness: 'AUTO',
                  },
                },
              ],
              filter: [
                ...(category && category !== 'All' ? [{ term: { category } }] : []),
                ...(city ? [{ range: { [`inventory.${city}`]: { gt: 0 } } }] : []),
                ...(maxPrice ? [{ range: { price: { lte: maxPrice } } }] : []),
              ],
            },
          },
        },
        filtered.length > 0 ? 3.95 : 0.0
      );
    }

    return {
      results: filtered,
      typoCorrectedFrom,
      matchedTerm: effectiveQuery !== cleanQuery ? effectiveQuery : undefined,
      latencyMs,
    };
  }

  private checkFuzzyMatch(text: string, query: string): boolean {
    if (query.length < 3) return false;
    const words = text.split(/\s+/);
    for (const word of words) {
      if (this.levenshtein(word, query) <= (query.length > 5 ? 2 : 1)) {
        return true;
      }
    }
    return false;
  }

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Atomic Order Checkout with PostgreSQL Row-Level Lock simulation (SELECT ... FOR UPDATE)
   * Guaranteed Zero Oversell Protection
   */
  public async checkout(params: {
    customerName: string;
    customerEmail: string;
    city: City;
    items: CartItem[];
  }): Promise<{ success: boolean; order?: Order; error?: string }> {
    const txStart = performance.now();
    const orderId = `ORD-${this.orderSeq++}`;

    // 1. PostgreSQL BEGIN Transaction
    const txId = telemetryStore.logPostgres(
      `BEGIN; -- Transaction isolation LEVEL REPEATABLE READ`,
      'COMMITTED',
      0.8,
      false,
      0
    );

    // 2. PostgreSQL SELECT ... FOR UPDATE (Acquiring Row Locks)
    for (const item of params.items) {
      telemetryStore.logPostgres(
        `SELECT stock_quantity FROM inventory WHERE product_id = '${item.product.id}' AND city = '${params.city}' FOR UPDATE;`,
        'ACQUIRING_LOCK',
        1.5,
        true,
        1
      );
    }

    // Small simulated lock evaluation time
    await new Promise((r) => setTimeout(r, 60));

    // 3. Stock Check Verification under Lock
    for (const item of params.items) {
      const liveProduct = this.products.find((p) => p.id === item.product.id);
      if (!liveProduct) {
        telemetryStore.logPostgres('ROLLBACK; -- Product not found', 'ROLLEDBACK', 0.5, false, 0);
        return { success: false, error: `Product not found: ${item.product.title}` };
      }

      const availableStock = liveProduct.inventory[params.city] || 0;
      if (availableStock < item.quantity) {
        // ROLLBACK transaction immediately!
        telemetryStore.logPostgres(
          `ROLLBACK; -- INSUFFICIENT STOCK: product ${item.product.sku} has ${availableStock} units, requested ${item.quantity}. Oversell prevented!`,
          'ROLLEDBACK',
          0.9,
          false,
          0
        );

        return {
          success: false,
          error: `Insufficient stock for "${item.product.title}" in ${params.city} (Available: ${availableStock}). Transaction rolled back with 0 inventory loss.`,
        };
      }
    }

    // 4. Stock is verified: Deduct inventory and insert order records
    for (const item of params.items) {
      const liveProduct = this.products.find((p) => p.id === item.product.id)!;
      liveProduct.inventory[params.city] -= item.quantity;

      telemetryStore.logPostgres(
        `UPDATE inventory SET stock_quantity = stock_quantity - ${item.quantity}, updated_at = NOW() WHERE product_id = '${item.product.id}' AND city = '${params.city}';`,
        'COMMITTED',
        1.9,
        false,
        1
      );
    }

    // 5. Commit Transaction
    const txLatency = Math.round((performance.now() - txStart) * 10) / 10;
    telemetryStore.logPostgres(
      `INSERT INTO orders (id, customer_email, city, total) VALUES ('${orderId}', '${params.customerEmail}', '${params.city}', ...); COMMIT;`,
      'COMMITTED',
      txLatency,
      false,
      params.items.length
    );

    const totalAmount = params.items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0
    );

    const order: Order = {
      id: orderId,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      city: params.city,
      items: params.items.map((i) => ({
        productId: i.product.id,
        title: i.product.title,
        quantity: i.quantity,
        unitPrice: i.product.price,
        totalPrice: i.product.price * i.quantity,
      })),
      totalAmount,
      status: 'COMMITTED',
      createdAt: new Date().toLocaleTimeString(),
      postgresTxId: txId,
    };

    this.orders.unshift(order);

    // 6. Produce Kafka Event: orders.placed
    const kafkaOffset = telemetryStore.logKafka('orders.placed', orderId, {
      orderId,
      customer: params.customerName,
      city: params.city,
      totalAmount,
      itemCount: params.items.length,
      postgresTxId: txId,
      timestamp: new Date().toISOString(),
    });
    order.kafkaOffset = kafkaOffset;

    // 7. Kafka Consumer Reacts: Emits inventory.updated & Syncs OpenSearch
    setTimeout(() => {
      for (const item of params.items) {
        const liveProduct = this.products.find((p) => p.id === item.product.id)!;
        const newStock = liveProduct.inventory[params.city];

        telemetryStore.logKafka('inventory.updated', liveProduct.sku, {
          sku: liveProduct.sku,
          productId: liveProduct.id,
          city: params.city,
          newStock,
          delta: -item.quantity,
          sourceEvent: 'order.placed',
          consumerGroup: 'inventory-sync-service',
        });

        // 8. OpenSearch document update
        telemetryStore.logOpenSearch('UPDATE_STOCK', liveProduct.id, 9.4, {
          doc: {
            inventory: liveProduct.inventory,
            in_stock: Object.values(liveProduct.inventory).some((s) => s > 0),
          },
        });
      }
    }, 150);

    return { success: true, order };
  }

  /**
   * Concurrency Flash-Sale Simulator for Hackathon Judges
   * Simulates two customers clicking "Place Order" at the exact same millisecond
   * for the last remaining unit (stock = 1).
   */
  public async simulateFlashSaleRace(
    productId: string,
    city: City
  ): Promise<{
    productTitle: string;
    user1Result: { success: boolean; message: string; txId?: string };
    user2Result: { success: boolean; message: string; txId?: string };
  }> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new Error('Product not found');

    const item: CartItem = { product, quantity: 1, selectedCity: city };

    // Fire 2 simultaneous checkouts with slight jitter
    const p1 = this.checkout({
      customerName: 'User A (Speedy Buyer)',
      customerEmail: 'user.a@flashdeal.io',
      city,
      items: [item],
    });

    // User B attempts 10ms later
    const p2 = new Promise<{ success: boolean; order?: Order; error?: string }>((resolve) => {
      setTimeout(async () => {
        const res = await this.checkout({
          customerName: 'User B (Concurrent Buyer)',
          customerEmail: 'user.b@flashdeal.io',
          city,
          items: [item],
        });
        resolve(res);
      }, 15);
    });

    const [res1, res2] = await Promise.all([p1, p2]);

    return {
      productTitle: product.title,
      user1Result: {
        success: res1.success,
        message: res1.success
          ? `Order #${res1.order?.id} confirmed! Stock reserved via Postgres row lock.`
          : `Failed: ${res1.error}`,
        txId: res1.order?.postgresTxId,
      },
      user2Result: {
        success: res2.success,
        message: res2.success
          ? `Order #${res2.order?.id} confirmed!`
          : `Oversell Prevented! ${res2.error}`,
        txId: res2.order?.postgresTxId,
      },
    };
  }

  public resetCatalog() {
    this.products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
    telemetryStore.clear();
  }
}

export const apiService = new ApiService();
