# Requirements: RetailSync Online Store (Aiven Hackathon P1)

**Defined:** 2026-11-11
**Core Value:** Stock integrity and seamless event synchronization: preventing overselling during concurrent checkouts in PostgreSQL while streaming real-time events through Apache Kafka to keep OpenSearch search indexes synchronized.

## v1 Requirements

Requirements for initial release, broken down into vertical capability domains.

### Connectivity & Infrastructure Foundation (CONN)

- [ ] **CONN-01**: Application loads Aiven configuration from `.env` and validates connectivity to PostgreSQL, Apache Kafka, and OpenSearch.
- [ ] **CONN-02**: Database migration script creates tables and indexes in PostgreSQL.
- [ ] **CONN-03**: OpenSearch index initialization script creates the `products` index with custom analyzers and mappings.
- [ ] **CONN-04**: Kafka topic provisioning script ensures required topics (`orders.placed`, `inventory.updated`) exist with proper replication and partitioning.
- [ ] **CONN-05**: Database seeder populates realistic multi-category retail products, store cities, and inventory counts.

### Data Model & Stock Concurrency (DATA & STOCK)

- [ ] **DATA-01**: PostgreSQL schema stores `categories`, `products`, `store_locations`, `inventory`, `customers`, `carts`, `cart_items`, `orders`, and `order_items`.
- [ ] **STOCK-01**: Checkout endpoint executes inside a PostgreSQL serializable/pessimistic transaction using `SELECT ... FOR UPDATE` on inventory records.
- [ ] **STOCK-02**: When stock is insufficient for any item in an order, the transaction rolls back cleanly with an informative error message.
- [ ] **STOCK-03**: Concurrency test verifies that when two concurrent requests attempt to buy the last single unit, exactly one succeeds and the other receives an "Out of stock" rejection with zero inventory deficit.

### Event Streaming & Kafka Pipeline (KAFKA)

- [ ] **KAFKA-01**: Backend produces an `order.placed` event to Kafka upon successful order commit, containing order ID, customer ID, items, timestamp, and store location.
- [ ] **KAFKA-02**: Kafka consumer processes `order.placed` and dispatches `inventory.updated` events reflecting new stock quantities.
- [ ] **KAFKA-03**: Consumer implements error handling, acknowledgment commit strategies, and logging for full auditability.

### Search Engine & OpenSearch Integration (SEARCH)

- [ ] **SEARCH-01**: OpenSearch index supports fuzzy search (`fuzziness: "AUTO"`) across product title and description for typo tolerance.
- [ ] **SEARCH-02**: Search API supports filtering by category, price range (`gte`/`lte`), and city store availability.
- [ ] **SEARCH-03**: OpenSearch sync consumer listens to `inventory.updated` Kafka events and updates the OpenSearch index documents in real time.

### Storefront User Experience (STORE)

- [ ] **STORE-01**: User can browse the product catalog with category navigation and city store selector.
- [ ] **STORE-02**: User can search products with instant live search responding to typos and misspellings.
- [ ] **STORE-03**: User can filter products simultaneously by category, maximum price, and in-stock status.
- [ ] **STORE-04**: User can add items to cart, adjust quantities, view cart summary, and proceed to checkout.
- [ ] **STORE-05**: User receives order confirmation with order details and status.

### Real-Time Telemetry & Live Demo Visualizer (DEMO)

- [ ] **DEMO-01**: Interactive UI split-screen / inspector tab displays live events flowing through Kafka (topic, key, payload, offset, timestamp).
- [ ] **DEMO-02**: Live inspector shows database order commits and OpenSearch sync latency in real time.
- [ ] **DEMO-03**: "Simulate Concurrent Flash Sale" interactive trigger fires simultaneous simulated checkouts against a product with 1 remaining stock, proving PostgreSQL lock enforcement live in the UI.

## v2 Requirements

Deferred to future releases after hackathon evaluation.

### Extended Commerce (EXT)

- **EXT-01**: User authentication with JWT and customer order history portal.
- **EXT-02**: Automated stock replenishment threshold triggers producing supplier purchase events.
- **EXT-03**: Dynamic price discounts and promotional coupon engine.
- **EXT-04**: Multi-store pickup reservation and geolocation-based store routing.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Third-party payment gateway integration (Stripe, Razorpay) | Not required by hackathon brief; adds external API latency and failure points |
| Real email/SMS notification delivery | Kafka consumer logging and UI notification are sufficient to demonstrate event reaction |
| Multi-region database replication | Aiven single-region instance covers all hackathon performance requirements |
| Native mobile application | Responsive web app delivers faster development and universal demonstration |

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | Phase 1 | Pending |
| CONN-02 | Phase 1 | Pending |
| CONN-03 | Phase 1 | Pending |
| CONN-04 | Phase 1 | Pending |
| CONN-05 | Phase 1 | Pending |
| DATA-01 | Phase 2 | Pending |
| STOCK-01 | Phase 2 | Pending |
| STOCK-02 | Phase 2 | Pending |
| STOCK-03 | Phase 2 | Pending |
| KAFKA-01 | Phase 3 | Pending |
| KAFKA-02 | Phase 3 | Pending |
| KAFKA-03 | Phase 3 | Pending |
| SEARCH-01 | Phase 3 | Pending |
| SEARCH-02 | Phase 3 | Pending |
| SEARCH-03 | Phase 3 | Pending |
| STORE-01 | Phase 4 | Pending |
| STORE-02 | Phase 4 | Pending |
| STORE-03 | Phase 4 | Pending |
| STORE-04 | Phase 4 | Pending |
| STORE-05 | Phase 4 | Pending |
| DEMO-01 | Phase 4 | Pending |
| DEMO-02 | Phase 4 | Pending |
| DEMO-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-11-11*
*Last updated: 2026-11-11 after initialization*
