# Roadmap: RetailSync Online Store (Aiven Hackathon P1)

## Overview

RetailSync is an event-driven e-commerce platform built on Aiven managed services (PostgreSQL, Apache Kafka, OpenSearch). This roadmap executes in vertical MVP slices: establishing secure Aiven cloud connectivity and schemas, building transactional stock locking to prevent overselling, wiring real-time Kafka event streaming with OpenSearch typo-tolerant search synchronization, and delivering a modern React storefront featuring an interactive live-telemetry inspector for the hackathon judges.

## Phases

- [x] **Phase 1: Cloud Foundation & Connectivity Baseline** - Scaffold TypeScript workspace, verify Aiven connections (Postgres, Kafka, OpenSearch), and seed initial product catalog.
- [ ] **Phase 2: PostgreSQL Store Engine & Concurrency Locking (MVP Slice 1)** - Implement relational data schema, cart/order APIs, and robust row-level locking (`SELECT ... FOR UPDATE`) to guarantee zero overselling.
- [ ] **Phase 3: Event-Driven Kafka Pipeline & OpenSearch Sync (MVP Slice 2)** - Implement Kafka event publisher and consumer workers, sync inventory updates to OpenSearch, and build typo-tolerant faceted search.
- [ ] **Phase 4: Modern Storefront UI & Live Telemetry Inspector (MVP Slice 3)** - Build responsive React storefront with instant search, cart checkout, and an interactive "All 3 Services in Action" visualizer with a live concurrency test trigger.
- [ ] **Phase 5: Pitch Deck, Demo Video & Submission Readiness** - Finalize documentation, create demo video walkthrough, and prepare pitch deck addressing all judging criteria.

---

## Phase Details

### Phase 1: Cloud Foundation & Connectivity Baseline

**Goal**: Establish a unified TypeScript project structure, configure `.env` handling for Aiven Cloud services (PostgreSQL, Apache Kafka, OpenSearch), verify connectivity to all three services with an automated diagnostics script, and create seed scripts for initial retail data.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: CONN-01, CONN-02, CONN-03, CONN-04, CONN-05
**Success Criteria**:

1. Running `npm run test:conn` successfully connects to Aiven PostgreSQL, emits/consumes a probe message on Aiven Kafka, and executes a ping query against Aiven OpenSearch.
2. Database migration runs cleanly, creating all relational tables (`products`, `categories`, `inventory`, `orders`, etc.).
3. OpenSearch index `products` is initialized with fuzzy search analyzers and keyword filters.
4. Database and search indices are populated with a realistic 50+ item retail catalog across multiple cities (e.g. Bangalore, Mumbai, Delhi).
   **Plans**: 3 plans

Plans:

- [x] 01-01: Setup monorepo structure (Node.js/TypeScript backend + React Vite frontend) and `.env` template with Aiven connection utilities.
- [x] 01-02: Implement PostgreSQL schema migrations, OpenSearch index mappings, and Kafka topic setup scripts.
- [x] 01-03: Implement unified diagnostics script (`npm run test:conn`) and seed data script populating catalog and inventory.

---

### Phase 2: PostgreSQL Store Engine & Concurrency Locking (MVP Slice 1)

**Goal**: Build the core transactional e-commerce engine in Fastify/Express with strict PostgreSQL concurrency control (`SELECT ... FOR UPDATE`) ensuring zero overselling under simultaneous checkouts.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DATA-01, STOCK-01, STOCK-02, STOCK-03
**Success Criteria**:

1. API provides endpoints to retrieve products, manage cart items, and initiate checkout.
2. Order checkout runs in an ACID transaction: checks stock with row-level locks, decrements inventory, creates order and order items atomically.
3. Automated concurrency test firing 10 concurrent checkout requests for a product with 1 unit in stock results in exactly 1 successful order, 9 rejections, and inventory count ending at exactly 0.
   **Plans**: 2 plans

Plans:

- [x] 02-01-PLAN.md (wave 1): Fastify `/api` routes for categories, products (category/location/city/in-stock filters), store locations, inventory lookup, and cart sessions locked on the cart row. Includes zod validation, one error envelope, offline route tests, and a live `test:api` smoke run.
- [ ] 02-02-PLAN.md (wave 2): Atomic checkout that locks inventory with `... ORDER BY id FOR UPDATE`. Returns 409 OUT_OF_STOCK, gives idempotent cart replay, and calls a post-commit OrderEventSink hook (where Phase 3 will add Kafka). Includes a live `npm run test:race` with last-unit, multi-item deadlock, and double-submit scenarios.

---

### Phase 3: Event-Driven Kafka Pipeline & OpenSearch Sync (MVP Slice 2)

**Goal**: Wire real-time event streaming and search sync: publish `order.placed` and `inventory.updated` events to Kafka, consume events in background workers, update OpenSearch index in real time, and provide typo-tolerant search APIs.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: KAFKA-01, KAFKA-02, KAFKA-03, SEARCH-01, SEARCH-02, SEARCH-03
**Success Criteria**:

1. Placing an order immediately produces an `order.placed` event to Kafka with payload details.
2. Kafka consumer receives `order.placed`, performs inventory state synchronization, and produces `inventory.updated`.
3. Search sync worker consumes `inventory.updated` and updates the OpenSearch document's stock count within 1 second.
4. Search API `/api/search?q=...` returns relevant products even with 1-2 character typos (e.g., "snikers" matches "Sneakers", "smrtfhone" matches "Smartphone"), with faceted filters for category, price range, and city availability.
   **Plans**: 2 plans

Plans:

- [ ] 03-01: Implement Kafka producer service and consumer workers for `order.placed` and `inventory.updated` topics with robust retry/logging.
- [ ] 03-02: Implement OpenSearch sync consumer and build typo-tolerant fuzzy search API with category, price, and city filters.

---

### Phase 4: Modern Storefront UI & Live Telemetry Inspector (MVP Slice 3)

**Goal**: Deliver a polished, responsive React storefront (Vite + Tailwind CSS) with live search and checkout, combined with a real-time "All 3 Services in Action" visualizer dashboard for hackathon judging.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: STORE-01, STORE-02, STORE-03, STORE-04, STORE-05, DEMO-01, DEMO-02, DEMO-03
**Success Criteria**:

1. User can seamlessly search with instant typo-tolerant results, filter by city/price/category, add items to cart, and complete checkout.
2. Dedicated inspector tab/panel displays live telemetry: PostgreSQL order entries, streaming Kafka messages with payloads and timestamps, and OpenSearch search sync events.
3. Interactive "Simulate Flash Sale Race Condition" demo button runs a live dual-checkout race against the last unit in stock and visually demonstrates PostgreSQL blocking the oversell while streaming event logs.
   **Plans**: 2 plans

Plans:

- [ ] 04-01: Build React storefront UI (product catalog grid, instant search bar, filter sidebar, cart drawer, checkout modal).
- [ ] 04-02: Build live telemetry inspector panel and interactive concurrency race demonstration button.

---

### Phase 5: Pitch Deck, Demo Video & Submission Readiness

**Goal**: Package the repository for hackathon submission with crystal-clear documentation, architecture diagrams, step-by-step setup guide, and a compelling demo pitch script.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: (Final deliverable audit & documentation)
**Success Criteria**:

1. Comprehensive README.md with clear architecture diagram, Aiven configuration instructions, and one-command run steps.
2. Demo script and pitch deck outline directly addressing all hackathon judging criteria.
3. All test suites pass and application runs cleanly end-to-end.
   **Plans**: 1 plan

Plans:

- [ ] 05-01: Author comprehensive README with architecture diagrams, Aiven setup instructions, pitch deck outline, and demo video script.

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase                                              | Plans Complete | Status      | Completed |
| -------------------------------------------------- | -------------- | ----------- | --------- |
| 1. Cloud Foundation & Connectivity Baseline        | 3/3            | Complete    | 2026-11-13 |
| 2. PostgreSQL Store Engine & Concurrency Locking   | 1/2            | In Progress | -         |
| 3. Event-Driven Kafka Pipeline & OpenSearch Sync   | 0/2            | Not started | -         |
| 4. Modern Storefront UI & Live Telemetry Inspector | 0/2            | Not started | -         |
| 5. Pitch Deck, Demo Video & Submission Readiness   | 0/1            | Not started | -         |

---

*Roadmap created: 2026-11-11*
*Last updated: 2026-11-11 after initialization*
