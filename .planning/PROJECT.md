# RetailSync Online Store (Aiven Hackathon P1)

## What This Is

RetailSync is a high-reliability, cloud-native online storefront built for a physical retail chain expanding to e-commerce. It delivers instant, typo-tolerant product search, robust cart checkout, and guaranteed stock integrity under concurrent purchasing, powered directly by Aiven PostgreSQL, Apache Kafka, and OpenSearch.

## Core Value

Stock integrity and seamless event synchronization: preventing overselling during concurrent checkouts in PostgreSQL while streaming real-time events through Apache Kafka to keep OpenSearch search indexes synchronized.

## Business Context

- **Customer**: Retail chain shoppers seeking local and online products, and retail store operators requiring accurate stock levels across locations.
- **Revenue model**: Direct retail e-commerce sales.
- **Success metric**: 0% oversell rate under concurrent purchases, <100ms typo-tolerant search latency, and <1s end-to-end event propagation from order placement to search index update.
- **Strategy notes**: Hackathon submission delivering a working demo showcasing all three services (PostgreSQL, Kafka, OpenSearch) doing real work with visual proof.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **CONN-01**: Secure connection to Aiven PostgreSQL, Apache Kafka, and OpenSearch with SSL configuration
- [ ] **DATA-01**: Relational data model for categories, products, inventory by city, customers, carts, and orders
- [ ] **STOCK-01**: Strict concurrency control preventing overselling using PostgreSQL row-level locks (`SELECT ... FOR UPDATE`)
- [ ] **KAFKA-01**: Event publisher emitting order placement and inventory updates to Kafka topics
- [ ] **KAFKA-02**: Event consumers subscribing to topics and executing reactive workflows
- [ ] **SEARCH-01**: OpenSearch index schema with typo tolerance (fuzzy matching) and multi-field filters (category, price range, city)
- [ ] **SEARCH-02**: Real-time sync pipeline updating OpenSearch product availability on Kafka inventory events
- [ ] **STORE-01**: Modern React storefront with catalog browsing, instant search, faceted filtering, and cart management
- [ ] **DEMO-01**: Live "All 3 Services in Action" telemetry dashboard visualizing PostgreSQL transactions, Kafka streaming messages, and OpenSearch search sync
- [ ] **DEMO-02**: Concurrency race test button triggering simultaneous checkouts to demonstrate oversell prevention live

### Out of Scope

- Real credit card payment gateways (Stripe/Razorpay) — simulated payment processing is sufficient for hackathon scope
- User authentication with OAuth / SMS OTP — guest checkout and profile switching will be used for rapid demonstration
- Distributed multi-region inventory routing — single-region Aiven cluster deployment
- Mobile native apps — responsive web application satisfies all evaluation criteria

## Context

- Hackathon Brief: A retail chain expanding from physical to online stores needs a working storefront where customers can browse products, add to cart, and place orders.
- Speed, stock accuracy under concurrent changes, and searchability are the core evaluation criteria.
- Judges require clear evidence of all three services (Postgres, Kafka, OpenSearch) doing real work, not just idle configurations.

## Constraints

- **Mandatory Stack**: PostgreSQL (source of truth & locking), Apache Kafka (event stream), OpenSearch (search engine) on Aiven Cloud.
- **Application Architecture**: TypeScript / Node.js backend (Fastify/Express) + React (Vite + Tailwind CSS) frontend.
- **Security**: All service credentials and SSL certificates strictly stored in environment variables (`.env`), never committed to git.
- **Execution Style**: Vertical MVP slices delivering complete end-to-end functionality incrementally.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js / TypeScript + Fastify | Fast startup, type safety across API and event payloads, excellent async throughput | — Pending |
| React + Vite + Tailwind CSS | Fast modern UI development with polished styling for hackathon evaluation | — Pending |
| Row-level locks (`SELECT ... FOR UPDATE`) in Postgres | Guarantees absolute stock integrity and serializes concurrent checkouts at the database level | — Pending |
| KafkaJS with SSL/SASL | Robust Node.js driver supporting Aiven Kafka's SSL certificates | — Pending |
| OpenSearch client with fuzzy multi_match | Delivers required typo tolerance and faceted filtering by category/price/city | — Pending |
| Dedicated Live Visualizer Dashboard | Directly addresses the hackathon judging criterion to "demonstrate all three services doing real work" | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-11 after initialization*
