---
gsd_state_version: "1.0"
current_phase: 1
current_phase_name: Cloud Foundation & Connectivity Baseline
status: executing
stopped_at: Completed 01-03-PLAN.md
last_updated: "2026-11-12T18:00:34.846Z"
last_activity: 2026-11-12
last_activity_desc: Completed 01-03 test:conn diagnostics and idempotent catalog seeder (all plans of Phase 1 code-complete; live Aiven runs pending credentials)
state_head: 7c12e069ce213d5978c4491e4dc3e32c2efe6082
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 3
  completed_plans: 3
  percent: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-11-11)

**Core value:** Stock integrity and seamless event synchronization: preventing overselling during concurrent checkouts in PostgreSQL while streaming real-time events through Apache Kafka to keep OpenSearch search indexes synchronized.
**Current focus:** Phase 1 — Cloud Foundation & Connectivity Baseline

## Current Position

Phase: 1 of 5 (Cloud Foundation & Connectivity Baseline)
Plan: 3 of 3 in current phase
Status: Phase 1 plans complete (01-01, 01-02, 01-03) — code-complete and offline-tested; phase verification pending (live Aiven runs blocked on credentials)
Last activity: 2026-11-12 — Completed 01-03: `npm run test:conn` (parallel PASS/WARN/FAIL diagnostics incl. Kafka produce->consume round-trip) and `npm run seed` (61-product / 3-city catalog, idempotent PostgreSQL upsert + OpenSearch bulk index via `products` alias); 178 offline tests pass; live runs pending credentials

Progress: [░░░░░░░░░░] 0%

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

### Pending Todos

- Live Aiven connectivity for 01-01 probes (checkPostgres / checkKafka / checkOpenSearch) not yet exercised — pending real credentials in `.env`; run via 01-03 `npm run test:conn`. CONN-01 stays open until then (WINDOWS.md #1).
- 01-02 provisioning never run live — once `.env` exists run, in order: `npm run db:migrate --workspace backend`, `npm run search:init --workspace backend`, `npm run kafka:topics --workspace backend` (re-run db:migrate to confirm "up to date"). CONN-02 / CONN-03 / CONN-04 stay open until observed (WINDOWS.md #2, #3, #4).
- 01-03 test:conn and seed never run live — once `.env` exists run: `npm run db:migrate`, `npm run search:init`, `npm run kafka:topics`, `npm run seed` (twice; second run should report all unchanged), then `npm run test:conn` (expect 3x PASS; Kafka round-trip needs permission to create `retailsync.diagnostics`, else `-- --no-roundtrip`). CONN-01 / CONN-05 stay open until observed (WINDOWS.md #5, #6; a live test:conn PASS also closes #1).

### Blockers/Concerns

- Aiven Cloud credentials (PostgreSQL URI, Kafka SSL certs/SASL credentials, OpenSearch URI) will be required when running live tests. A structured `.env.example` and validation harness will make onboarding effortless.

## Session Continuity

Last session: 2026-11-12T18:00:34.824Z
Stopped at: Completed 01-03-PLAN.md
Resume file: None
