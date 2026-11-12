---
phase: 01-cloud-foundation-baseline
plan: 03
subsystem: data-infra
tags: [diagnostics, connectivity, seed, catalog, postgresql, kafka, opensearch, idempotent-upsert, bulk-index]

# Dependency graph
requires:
  - 01-01 (config section loaders + ConfigError; services checkPostgres/checkOpenSearch, query/withTransaction, buildKafkaClientConfig)
  - 01-02 (schema.sql natural-key constraints; PRODUCTS_ALIAS, buildProductDocument, openSearchIndexAdmin; TOPICS, resolveReplicationFactor, describeKafkaError; cli.ts isMainModule/runCli)
provides:
  - backend/src/scripts/test-conn.ts - parallel PASS/WARN/FAIL diagnostics for PostgreSQL, Kafka (incl. produce->consume round-trip), OpenSearch; exit 1 on any FAIL
  - backend/src/db/seed-data.json - 61-product, 6-category, 3-city demo catalog with per-location stock (incl. last-unit rows)
  - backend/src/db/seed-data.ts - zod-validated catalog loader (loadSeedCatalog, inventoryRows, lastUnitRows)
  - backend/src/scripts/seed.ts - idempotent PostgreSQL upsert + OpenSearch bulk index via the products alias
  - root npm scripts test:conn, db:migrate, search:init, kafka:topics, seed
affects: [phase-2 checkout + concurrency test (last-unit inventory rows, seeded catalog), phase-3 search sync (document ids = product ids in the products alias), phase-5 demo (npm run test:conn as the live connectivity proof)]

# Actuals (#2632) - plan carried no estimate; recorded for calibration.
actuals:
  tokens: 31300   # chars/4 over the 7 new files (125,082 chars incl. 835-line seed-data.json) + package.json script lines
  tasks: 4
  commits: 4
plan_head_before: b54067a5a3d3218867b6ae474b10620c29be7923
plan_head_after: 7c12e069ce213d5978c4491e4dc3e32c2efe6082

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Probe model - each service probe returns {details, warnings}; runner adds timeout, latency, and maps throws to FAIL; setup gaps are WARN (exit 0) with the exact command to run
    - Set-based idempotent upsert - INSERT ... SELECT FROM unnest($n::type[]) ON CONFLICT ON CONSTRAINT <natural key> DO UPDATE ... WHERE (...) IS DISTINCT FROM (...) RETURNING (xmax = 0) AS inserted
    - Verify-before-commit - in-transaction count of every expected row/stock value; mismatch throws so withTransaction rolls back
    - OpenSearch writes only through the alias with require_alias (never auto-create a mapping-less index)
    - Data file + zod schema mirroring DB constraints, all issues reported at once (same contract as config.ts)

key-files:
  created:
    - backend/src/scripts/test-conn.ts
    - backend/src/scripts/test-conn.test.ts
    - backend/src/db/seed-data.json
    - backend/src/db/seed-data.ts
    - backend/src/db/seed-data.test.ts
    - backend/src/scripts/seed.ts
    - backend/src/scripts/seed.test.ts
  modified:
    - package.json
    - backend/package.json

key-decisions:
  - "test:conn Kafka round-trip uses a dedicated retailsync.diagnostics topic (1 partition, 1h retention, created on demand) and a throwaway consumer group (autoCommit false, seek to the produced offset, group deleted after), so probes never pollute orders.placed / inventory.updated; --no-roundtrip gives a read-only check"
  - "test:conn uses its own KafkaJS client with retries: 2 (same TLS/auth builder as the app) so an unreachable broker fails in ~1 s with the real error instead of the app client's ~60 s retry budget hiding behind a timeout"
  - "Status semantics: FAIL = unreachable/rejected/misconfigured/timed out (exit 1); WARN = reachable but setup incomplete (not migrated, topics missing, alias missing, empty catalog/index, yellow health) with the command to run (exit 0)"
  - "Seeder resets stock to catalog quantities on every run (repeatable last-unit demo); never deletes rows or products outside the catalog; unchanged rows are skipped via IS DISTINCT FROM (no updated_at churn)"
  - "Seeder checks prerequisites (schema migrated, products alias exists) before any write instead of migrating/creating the index itself; reports both config sections' issues together"
  - "Seeded catalog: INR prices, 6 categories (the plan's 4 plus Sports & Fitness, Books & Stationery), 61 products, stores Bangalore Central / Mumbai Metro / Delhi Hub; images are deterministic picsum.photos placeholders (not product photos)"

patterns-established:
  - "New ops CLI: pure builders + adapter interface + fakes in tests; root npm shortcut with a trailing `--` so flags forward to the workspace script"
  - "Catalog changes go in seed-data.json; the validator mirrors schema.sql constraints, and seed.test.ts checks every INSERT column / ON CONFLICT constraint against schema.sql"

requirements-completed: []   # CONN-01 and CONN-05 are code-complete but NOT marked complete: test:conn and seed have never run against live Aiven services (pending credentials, WINDOWS.md #5, #6)

coverage:
  - id: D1
    description: "npm run test:conn probes PostgreSQL, Kafka, and OpenSearch in parallel and prints colour-coded PASS/WARN/FAIL diagnostics with latency; exit code 1 when any service fails"
    requirement: CONN-01
    verification:
      - kind: unit
        ref: "backend/src/scripts/test-conn.test.ts (35 tests: runner timeout/parallelism/exit codes, per-service pass/warn/fail with fake pg/kafka/opensearch clients, Kafka round-trip incl. lost/corrupted probe and cleanup, report alignment with and without ANSI)"
        status: pass
      - kind: other
        ref: "offline smoke: no env -> 3 FAIL listing variable names, exit 1; fake env at 127.0.0.1 -> 3 FAIL (ECONNREFUSED) in 1.4 s, exit 1, password never printed; root `npm run test:conn -- --no-roundtrip` forwards the flag and propagates exit 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "seed-data.json holds 50+ realistic products across multiple categories with inventory in Bangalore, Mumbai, Delhi, including last-unit (=1) stock for the concurrency demo"
    requirement: CONN-05
    verification:
      - kind: unit
        ref: "backend/src/db/seed-data.test.ts (15 tests: content requirements, last-unit rows in every city, availability edge cases, buildProductDocument for every product, validator rejection cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "npm run seed idempotently upserts locations, categories, products, inventory into PostgreSQL and indexes all active products into OpenSearch via the products alias"
    requirement: CONN-05
    verification:
      - kind: unit
        ref: "backend/src/scripts/seed.test.ts (39 tests: INSERT columns and ON CONFLICT constraints exist in schema.sql, IS DISTINCT FROM guards, aligned unnest params, decimal price strings, upsert accounting, verification rollback, preflight, bulk body/batching/failures; mutation check - renaming a column or constraint fails 3 tests)"
        status: pass
      - kind: other
        ref: "offline smoke: no env -> PG + OpenSearch variable names, exit 1; fake env -> catalog validated (61 products / 177 inventory rows), 'pre-flight checks failed, nothing written' with both ECONNREFUSED causes, exit 1; compiled dist/scripts/seed.js resolves seed-data.json from the source tree"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live runs: test:conn PASS against Aiven; seed writes PostgreSQL + OpenSearch and a second run reports everything unchanged; search returns seeded products"
    requirement: CONN-01
    verification: []
    human_judgment: true
    rationale: "PENDING CREDENTIALS - no .env with real Aiven credentials and no local PostgreSQL/Kafka/OpenSearch. Nothing in this plan has touched a live service; tracked in WINDOWS.md #5 (test:conn) and #6 (seed)."

# Metrics
duration: 16min
completed: 2026-11-12
status: complete
---

# Phase 1 Plan 03: Connectivity Diagnostics & Catalog Seeder Summary

**This plan adds `npm run test:conn`, which probes PostgreSQL, Kafka and OpenSearch in parallel and prints a colour-coded PASS/WARN/FAIL table. The Kafka probe includes a produce-then-consume round-trip. It also adds `npm run seed`, which upserts a validated 61-product catalog (3 cities, with last-unit stock) into PostgreSQL in one verified transaction, then bulk-indexes it through the `products` alias. Everything typechecks and passes 89 new offline tests (178 in total). Nothing has run against live Aiven yet, because there are no credentials.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-11-12T17:45:37Z
- **Completed:** 2026-11-12T18:01Z
- **Tasks:** 4/4
- **Files:** 7 created, 2 modified

## Accomplishments

- **Diagnostics that point to the next step.**
  - All three probes run concurrently, each with its own timeout.
  - A service with broken config fails on its own, listing variable names only; the other services are still probed.
  - Setup gaps show as WARN with the exact command to run. Examples: schema not migrated (`db:migrate`), event topics missing (`kafka:topics`), alias missing (`search:init`), empty catalog or index (`seed`).
  - Exit code is 1 only on FAIL.
- **A real Kafka round-trip.**
  - One uniquely keyed message is produced with `acks=all` to a dedicated diagnostics topic.
  - It is read back by a throwaway consumer group that seeks straight to the produced offset and checks the payload is unchanged.
  - The group is then deleted, so no offsets are committed and the event topics are never touched.
- **Fast, honest failures.** A dedicated short-retry KafkaJS client means an unreachable broker reports `Connection error: connect ECONNREFUSED` in about 1 s, not a generic timeout after 60 s. Cleanup is time-boxed, so lingering retry timers can't hang the CLI.
- **The demo catalog.**
  - 61 products in 6 categories, priced in INR, stocked across Bangalore Central, Mumbai Metro and Delhi Hub (177 inventory rows).
  - Built-in edge cases:
    - Last-unit (=1) rows in every city, including a PlayStation 5 with exactly 1 unit in every store.
    - Sold-out rows.
    - Products a store doesn't carry.
    - One product out of stock everywhere.
  - The validator mirrors the `schema.sql` constraints and reports every problem at once.
- **An idempotent dual-sync seeder.**
  - Set-based `unnest()` upserts on the natural-key constraints. `IS DISTINCT FROM` guards skip unchanged rows, and the CLI reports inserted, updated and unchanged counts.
  - Everything runs in one transaction under an advisory lock. Every row and stock value is verified before COMMIT.
  - All active products are then bulk-indexed through the alias with `require_alias` and `refresh=wait_for`, using `_id = product_id`. Search works as soon as the command returns. Documents for inactive products are removed.

## Task Commits

1. **Task 1: test-conn.ts diagnostics** - `ee6a4ba` (feat)
2. **Task 2: seed-data.json catalog (+ validator)** - `2c96bd8` (feat)
3. **Task 3: seed.ts PostgreSQL + OpenSearch seeder** - `c6065e6` (feat)
4. **Task 4: root npm shortcuts** - `7c12e06` (chore)

**Plan metadata:** recorded in the final docs commit (SUMMARY + STATE + WINDOWS). ROADMAP.md was deliberately not touched, per the orchestrator's instruction.

## Files Created/Modified

- `backend/src/scripts/test-conn.ts` - probe runner, the PostgreSQL/Kafka/OpenSearch probes, `KafkaDiagnosticsSession`, report formatter, and CLI (`--no-roundtrip`)
- `backend/src/scripts/test-conn.test.ts` - 35 tests with fake clients
- `backend/src/db/seed-data.json` - the curated catalog
- `backend/src/db/seed-data.ts` - `parseSeedCatalog`, `loadSeedCatalog`, `resolveSeedDataPath`, `inventoryRows`, `lastUnitRows`, `SeedDataError`
- `backend/src/db/seed-data.test.ts` - 15 tests
- `backend/src/scripts/seed.ts` - upsert builders, `seedDatabase`, preflight checks, `loadProductDocuments`, `buildBulkBody`, `indexProducts`, `loadSeedConfig`, CLI
- `backend/src/scripts/seed.test.ts` - 39 tests
- `backend/package.json` - adds the `test:conn` and `seed` scripts
- `package.json` - root `test:conn`, `db:migrate`, `search:init`, `kafka:topics`, `seed` (with a trailing `--` so flags forward)

## Decisions Made

See `key-decisions` in the frontmatter. The two most important for later phases:

1. **Phase 2:** use the last-unit rows from `npm run seed -> "last-unit stock for concurrency demos"` (for example ELEC-009 PlayStation 5, 1 unit per store) as the targets for the concurrent checkout test. Re-running `npm run seed` resets stock to the catalog values.
2. **Phase 3:** OpenSearch document `_id` is the PostgreSQL product id, and documents are only written through the `products` alias. The sync consumer should keep doing both.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] A dedicated diagnostics topic for the Kafka round-trip**
- **Found during:** Task 1
- **Issue:** The plan says "produces and consumes a test probe message" but doesn't name a topic. Probing `orders.placed` or `inventory.updated` would inject fake events that Phase 3 consumers would act on. Auto topic creation is also disabled by design.
- **Fix:** Use `retailsync.diagnostics` (1 partition, 1h retention), created on demand with an explicit `createTopics`. If creation isn't permitted, the error says so and points to the Aiven Console or `--no-roundtrip`.
- **Commit:** `ee6a4ba`

**2. [Rule 1 - Bug] Kafka failure hidden behind a 60 s timeout**
- **Found during:** Task 1 offline smoke
- **Issue:** Using the app's shared Kafka singleton (8 retries), an unreachable broker took 60 s to fail with "Kafka timed out", and cleanup then also timed out.
- **Fix:** Added `KafkaDiagnosticsSession`, a dedicated client built with the same `buildKafkaClientConfig` but `retries: 2`, and time-boxed cleanup. The failure now shows the real cause in about 0.8 s.
- **Commit:** `ee6a4ba`

**3. [Rule 2 - Missing critical] Seeder safety beyond the plan text**
- **Found during:** Task 3
- **Issue:** The plan's "inserts ..." wording isn't idempotent, and indexing into a missing alias would auto-create a concrete `products` index with dynamic mappings. That is the exact failure 01-02's initializer guards against.
- **Fix:**
  - Natural-key upserts with change guards.
  - One transaction with an advisory lock and verify-before-commit.
  - `require_alias: true` on bulk requests.
  - Preflight checks for both prerequisites before any write.
- **Commit:** `c6065e6`

**4. [Rule 2 - Missing critical] Catalog validator module (`seed-data.ts`) not in the plan's file list**
- **Found during:** Task 2
- **Issue:** A hand-edited JSON catalog with a typo'd category or location would make the SQL JOINs drop rows silently, or violate CHECK constraints halfway through.
- **Fix:** A zod-validated loader that mirrors the schema constraints and cross-checks references. The seeder's in-transaction verification catches anything left over.
- **Commit:** `2c96bd8`

**5. [Rule 3 - Blocking] Extra root shortcuts `search:init` and `kafka:topics`**
- The plan lists `test:conn`, `db:migrate` and `seed`. The seeder and `test:conn` WARN output point users at `search:init` and `kafka:topics`, so those got root shortcuts too. Flags are forwarded with a trailing `--`.
- **Commit:** `7c12e06`

**6. [Rule 2 - Missing critical] Offline unit tests (89 new)**
- With no credentials and no local services, these are the only automated evidence available.
- Mutation check: renaming an INSERT column or ON CONFLICT constraint in `seed.ts` fails 3 tests.

---

**Total deviations:** 6 auto-fixed (1 bug, 4 missing-critical, 1 blocking). No architectural changes and no new dependencies.

## Issues Encountered

- **No `node_modules` in the worktree.** Ran `npm ci` from the existing lockfile. No packages were added. esbuild's postinstall is skipped by npm 11 `allowScripts`, as in 01-01; tsx works without it.
- **No local PostgreSQL, Kafka or OpenSearch binaries.** That is why SQL validity is checked structurally against `schema.sql` rather than executed.
- **Commit ledger location.** The sandbox blocks writes inside the shared `.git` dir, so the ledger base (`b54067a`) was kept in session context. `git rev-list --count b54067a..7c12e06` = 4.

## Pending Credentials (not verified, not faked)

Neither script has run against a live service. The following are **unproven**:

- **test:conn:**
  - PostgreSQL TLS query plus schema and catalog status.
  - Kafka metadata and the produce->consume round-trip. This includes whether the Aiven user may create `retailsync.diagnostics`, and how long the consumer group takes to join.
  - OpenSearch health and the alias document count.
- **seed:**
  - PostgreSQL accepting the `unnest` / `ON CONFLICT ON CONSTRAINT` / `RETURNING (xmax = 0)` / `json_agg ... FILTER` SQL.
  - Real idempotency: a second run should report everything `unchanged`.
  - Bulk indexing through the alias, and fuzzy search returning seeded products.

Once `.env` exists, run in order:
1. `npm run db:migrate`
2. `npm run search:init`
3. `npm run kafka:topics`
4. `npm run seed`
5. `npm run seed` again, and expect all `unchanged` except stock reset
6. `npm run test:conn`, and expect 3x PASS

These are logged in `.planning/WINDOWS.md` as **#5** (test:conn) and **#6** (seed), both `unrun-verify`. A live PASS of test:conn also closes #1. **CONN-01 and CONN-05 are deliberately NOT marked complete in REQUIREMENTS.md.**

## Known Stubs

None that block the plan goal. Product `image_url`s are deterministic `picsum.photos` placeholder photos rather than real product images. The data is wired end to end (DB, index), and the user has excluded UI work, so this is recorded as a decision rather than a stub.

## User Setup Required

This uses the same `.env` as 01-01. See the 01-01 SUMMARY "User Setup Required" and the run order above.

## Next Phase Readiness

- **Phase 2:**
  - The catalog, stores and stock exist once seeded.
  - Last-unit targets are printed by the seeder and listed via `lastUnitRows()`.
  - `npm run seed` doubles as a "reset stock" command between concurrency test runs.
- **Phase 3:** Documents in `products` are keyed by product id and built only via `buildProductDocument()`. The sync consumer can overwrite them with the same `_id`.
- **Blocker for live verification:** Aiven credentials (already in STATE.md concerns).

## Self-Check: PASSED

- All 7 created files and 2 modified files are present on disk.
- All 4 task commits (`ee6a4ba`, `2c96bd8`, `c6065e6`, `7c12e06`) are ancestors of HEAD; `git rev-list --count b54067a..HEAD` = 4.
- Final run: `npm test` 178/178 pass, `npm run typecheck` exit 0, `npm run build` exit 0.
