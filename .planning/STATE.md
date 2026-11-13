---
gsd_state_version: "1.0"
current_phase: 2
current_phase_name: PostgreSQL Store Engine & Concurrency Locking
status: executing
stopped_at: Completed 02-01-PLAN.md
last_updated: "2026-11-13T04:01:13.679Z"
last_activity: 2026-11-13
last_activity_desc: "Completed 02-01 catalog + cart REST API on live Aiven PostgreSQL (cart-row FOR UPDATE lock discipline, single error envelope); 234 offline tests + 19/19 live test:api steps pass"
state_head: 8226288952437a053ea561deaa7514310a10279b
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 5
  completed_plans: 4
  percent: 20
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-11-11)

**Core value:** Stock integrity and seamless event synchronization: preventing overselling during concurrent checkouts in PostgreSQL while streaming real-time events through Apache Kafka to keep OpenSearch search indexes synchronized.
**Current focus:** Phase 2 — PostgreSQL Store Engine & Concurrency Locking

## Current Position

Phase: 2 of 5 (PostgreSQL Store Engine & Concurrency Locking)
Plan: 1 of 2 in current phase complete (next: 02-02 locked checkout + last-unit race test)
Status: 02-01 complete — `/api` catalog (products/categories/locations/inventory) and guest carts on live Aiven PostgreSQL; every cart mutation locks the cart row FOR UPDATE and refuses non-active carts
Last activity: 2026-11-13 — Completed 02-01: 234 offline tests pass; live `npm run test:api` 19/19 PASS with residue-checked cleanup (0 smoke rows left)

Progress: [██░░░░░░░░] 20%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: 0 min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 1: Cloud Foundation & Connectivity Baseline | 0/3 | - | - |
| Phase 2: PostgreSQL Store Engine & Concurrency Locking | 0/2 | - | - |
| Phase 3: Event-Driven Kafka Pipeline & OpenSearch Sync | 0/2 | - | - |
| Phase 4: Modern Storefront UI & Live Telemetry Inspector | 0/2 | - | - |
| Phase 5: Pitch Deck, Demo Video & Submission Readiness | 0/1 | - | - |

**Recent Trend:**
- Trend: Stable (Kickoff)

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 10min | 5 tasks | 14 files |
| Phase 01 P02 | 15min | 4 tasks | 10 files |
| Phase 01 P03 | 16min | 4 tasks | 9 files |
| Phase 02 P01 | 18min | 3 tasks | 13 files |

## Accumulated Context

### Decisions

Decisions are logged in `.planning/PROJECT.md` Key Decisions table:
- Backend: Node.js / TypeScript with Fastify
- Frontend: React (Vite + Tailwind CSS)
- Concurrency: Database-level row locking (`SELECT ... FOR UPDATE`) in PostgreSQL
- Messaging: KafkaJS with SSL/SASL
- Search: OpenSearch fuzzy multi_match with faceted filtering
- Live Visualizer: Real-time UI dashboard demonstrating all 3 services doing work
- [Phase 01]: 01-01: Strip libpq ssl* params from AIVEN_PG_URI and pass explicit CA-pinned ssl object (pg merges URI over explicit ssl, sslmode=require would drop the Aiven CA)
- [Phase 01]: 01-01: Kafka auth via AIVEN_KAFKA_AUTH=ssl (client cert, default) or sasl (SCRAM/PLAIN); TLS always verified, no disable switch for any service
- [Phase 01]: 01-01: zod 4 + Node process.loadEnvFile for config; per-service config sections validate independently; errors name vars, never values
- [Phase 01]: 01-01: TypeScript 7.0.2 + tsx (dev/test via node:test); ESM with .js import specifiers under NodeNext
- [Phase 01]: 01-02: inventory = one row per (product_id, location_id) with CHECK inventory_stock_quantity_nonnegative; Phase 2 locks via ... ORDER BY id FOR UPDATE (deadlock-free), treats SQLSTATE 23514 as out-of-stock
- [Phase 01]: 01-02: migrations run in one transaction under pg_advisory_xact_lock with sha256 checksums in schema_migrations; edited applied migrations are refused (append new ones)
- [Phase 01]: 01-02: OpenSearch products_v1 behind alias products (always use the alias), dynamic strict, price scaled_float (not keyword) for range filters; documents only via buildProductDocument()
- [Phase 01]: 01-02: Kafka topics orders.placed (key order id) and inventory.updated (key product id): 3 partitions, RF min(3, brokers), 7-day retention; existing topics never altered, drift reported
- [Phase 01]: 01-03: test:conn Kafka round-trip uses dedicated retailsync.diagnostics topic (1 partition, 1h retention, created on demand) + throwaway group seeking to produced offset; event topics never receive probes; --no-roundtrip is read-only
- [Phase 01]: 01-03: test:conn status - FAIL (unreachable/rejected/misconfigured/timeout, exit 1) vs WARN (reachable but not migrated/provisioned/seeded, names the command, exit 0); own KafkaJS client with retries 2 for fast real errors
- [Phase 01]: 01-03: npm run seed upserts by natural key with IS DISTINCT FROM guards in one advisory-locked, verify-before-commit transaction; resets stock to catalog values each run (repeatable last-unit demo); never deletes non-catalog rows
- [Phase 01]: 01-03: seeder indexes active products only via products alias (bulk require_alias + refresh=wait_for, _id = product id) after preflight (schema migrated + alias exists) - never auto-creates an index
- [Phase 02]: 02-01: single error envelope {error:{code,message,details?,requestId}}; Fastify 4xx codes pass through; other errors -> 500 INTERNAL_ERROR fixed text (never echoed); ids are strings (BIGINT ^[1-9][0-9]{0,17}$, UUID via z.uuid()); money stays NUMERIC in SQL, JSON number at serialization
- [Phase 02]: 02-01: every cart mutation is one transaction whose first statement is SELECT id, status, location_id FROM carts WHERE id = $1 FOR UPDATE and refuses non-active carts with 409 CART_NOT_ACTIVE - 02-02 checkout must lock the same cart row; 99-unit line cap enforced atomically in the ON CONFLICT upsert (422 QUANTITY_LIMIT_EXCEEDED); carts never reserve stock
- [Phase 02]: 02-01: npm run test:api live smoke = ordered SmokeStep[] in scripts/api-smoke.ts (02-02 appends); records every created cart/customer id and FAILs unless cleanup re-query finds 0 rows; offline route tests use testing/fake-db.ts createFakeDatabase + app.inject

### Pending Todos

- Live Aiven connectivity for 01-01 probes (checkPostgres / checkKafka / checkOpenSearch) not yet exercised — pending real credentials in `.env`; run via 01-03 `npm run test:conn`. CONN-01 stays open until then (WINDOWS.md #1).
- 01-02 provisioning never run live — once `.env` exists run, in order: `npm run db:migrate --workspace backend`, `npm run search:init --workspace backend`, `npm run kafka:topics --workspace backend` (re-run db:migrate to confirm "up to date"). CONN-02 / CONN-03 / CONN-04 stay open until observed (WINDOWS.md #2, #3, #4).
- 01-03 test:conn and seed never run live — once `.env` exists run: `npm run db:migrate`, `npm run search:init`, `npm run kafka:topics`, `npm run seed` (twice; second run should report all unchanged), then `npm run test:conn` (expect 3x PASS; Kafka round-trip needs permission to create `retailsync.diagnostics`, else `-- --no-roundtrip`). CONN-01 / CONN-05 stay open until observed (WINDOWS.md #5, #6; a live test:conn PASS also closes #1).

### Blockers/Concerns

- Aiven Cloud credentials (PostgreSQL URI, Kafka SSL certs/SASL credentials, OpenSearch URI) will be required when running live tests. A structured `.env.example` and validation harness will make onboarding effortless.

## Session Continuity

Last session: 2026-11-13T04:01:13.610Z
Stopped at: Completed 02-01-PLAN.md
Resume file: None
