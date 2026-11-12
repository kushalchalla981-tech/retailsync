---
phase: 01-cloud-foundation-baseline
plan: 02
subsystem: data-infra
tags: [postgresql, migrations, opensearch, analyzers, edge-ngram, kafka, topics, provisioning]

# Dependency graph
requires:
  - 01-01 (config.ts section loaders; services/postgres withTransaction, services/kafka getAdmin, services/opensearch getOpenSearch)
provides:
  - backend/src/db/schema.sql - 9-table relational model; inventory = one lockable row per (product_id, location_id) with CHECK (stock_quantity >= 0)
  - backend/src/db/migrations.ts - transactional, advisory-locked, checksum-tracked runner (migrate / applyMigrations / loadMigrations)
  - backend/src/search/mappings.ts - products_v1 index behind `products` alias; ProductDocument type; buildProductDocument(); ensureProductsIndex()
  - backend/src/kafka/topics.ts - TOPICS constants; ensureTopics() for orders.placed + inventory.updated
  - backend/src/cli.ts - isMainModule / runCli shared by the provisioning CLIs
  - backend scripts db:migrate, search:init, kafka:topics
affects: [01-03 seed (inserts into schema, indexes via buildProductDocument + products alias, root npm shortcuts), phase-2 checkout locking, phase-3 producer/consumers/search sync]

# Actuals (#2632) - plan carried no estimate; recorded for calibration.
actuals:
  tokens: 21560   # chars/4 over the 9 hand-written files (86,071 chars) + package.json script lines
  tasks: 4
  commits: 4
plan_head_before: c5b7fafa7269f320a67ffa8f8f4e19edf7e0626c
plan_head_after: 7416994e2c20bd2b5f7f741e521808bedef8b94c

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Provisioning module shape - pure builders + injectable admin/client interface (testable with fakes) + `if (isMainModule(import.meta.url)) await runCli(...)` entry
    - Migrations - append-only list, one transaction, pg_advisory_xact_lock + lock_timeout, sha256 checksum per migration, edited migrations refused
    - OpenSearch request bodies `satisfies` the client's generated API spec types (compile-time validation of analyzers/mapping types)
    - Mapping/document lockstep - mapping properties typed as `{ [K in keyof ProductDocument]: Property }`, `dynamic: strict`
    - Offline SQL structure tests - statement splitter (comments, quotes, dollar-quoting) + CREATE TABLE decomposition

key-files:
  created:
    - backend/src/db/schema.sql
    - backend/src/db/schema.test.ts
    - backend/src/db/migrations.ts
    - backend/src/db/migrations.test.ts
    - backend/src/cli.ts
    - backend/src/search/mappings.ts
    - backend/src/search/mappings.test.ts
    - backend/src/kafka/topics.ts
    - backend/src/kafka/topics.test.ts
  modified:
    - backend/package.json

key-decisions:
  - "Inventory is one row per (product_id, location_id) (UNIQUE inventory_product_location_key) with named CHECK inventory_stock_quantity_nonnegative; Phase 2 locks rows with SELECT ... WHERE location_id = $1 AND product_id = ANY($2) ORDER BY id FOR UPDATE (deterministic order prevents deadlocks); the CHECK maps to SQLSTATE 23514 as a last line of defence"
  - "BIGINT identity ids for catalog/locations/inventory; UUID (gen_random_uuid, PG13+, no extensions) for customers/carts/orders so public ids are unguessable for guest checkout"
  - "orders.location_id NOT NULL (KAFKA-01 event needs the store); orders.cart_id UNIQUE guards against double-submitting a cart; order_items snapshot unit_price with generated line_total"
  - "Migration runner applies all pending migrations in ONE transaction under pg_advisory_xact_lock with lock_timeout 30s; schema_migrations stores sha256 (CRLF-normalised); an applied migration whose file changed is refused, not re-run"
  - "OpenSearch: concrete index products_v1 behind alias `products` (write index) so analyzer changes ship as v2 + reindex + alias swap; existing index gets additive putMapping only; --recreate is explicit opt-in"
  - "price mapped as scaled_float (scaling_factor 100), not keyword as the plan text said, because SEARCH-02 needs gte/lte range filters"
  - "Kafka topics: 3 partitions, replication factor min(3, brokers), min.insync.replicas 2 at RF>=3 else 1, delete policy with 7-day retention; existing topics are never altered (repartitioning breaks per-key ordering), drift is reported"
  - "Event keys: orders.placed keyed by order id; inventory.updated keyed by product id (per-product ordering for the search sync)"

patterns-established:
  - "New provisioning CLI: export pure logic + adapter interface, add backend package script, guard main with isMainModule, wrap with runCli(name, main, closeX)"
  - "Index documents are only built via buildProductDocument() so derived fields (city, in_stock_cities, total_stock, in_stock) are computed identically by seed (01-03) and sync (Phase 3)"

requirements-completed: []   # CONN-02/03/04 are code-complete but NOT marked complete: none of the scripts has run against live Aiven services (pending credentials, WINDOWS.md #2-#4)

coverage:
  - id: D1
    description: "schema.sql defines categories, products, store_locations, inventory, customers, carts, cart_items, orders, order_items with FKs, CHECKs, FK indexes; idempotent, non-destructive, extension-free"
    requirement: CONN-02
    verification:
      - kind: unit
        ref: "backend/src/db/schema.test.ts (18 tests; mutation check: weakening the CHECK, dropping the (product_id, location_id) key, or removing an FK index fails 3 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Inventory locking contract for Phase 2: per-(product, location) row, CHECK (stock_quantity >= 0), updated_at trigger"
    requirement: CONN-02
    verification:
      - kind: unit
        ref: "backend/src/db/schema.test.ts 'inventory locking contract' suite (4 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration runner executes schema.sql transactionally with advisory lock, checksum tracking, and line-numbered SQL errors"
    requirement: CONN-02
    verification:
      - kind: unit
        ref: "backend/src/db/migrations.test.ts (12 tests, scripted fake client)"
        status: pass
      - kind: other
        ref: "CLI smoke: no env -> exit 1 listing variable names; fake env at 127.0.0.1:1 -> 'FAILED: connect ECONNREFUSED', exit 1, password not printed; works from tsx and compiled dist (dist falls back to src/db/schema.sql)"
        status: pass
    human_judgment: false
  - id: D4
    description: "OpenSearch products index with edge-ngram autocomplete + fuzzy-ready product_text analyzer, keyword category/city filters, numeric price, strict mapping"
    requirement: CONN-03
    verification:
      - kind: unit
        ref: "backend/src/search/mappings.test.ts (22 tests: analyzer/filter references resolve, edge-ngram index-side only, document/mapping lockstep, initializer paths with fake admin)"
        status: pass
      - kind: other
        ref: "tsc: body satisfies OpenSearch client API spec types; mutation check - removing a mapped field or misspelling 'edge_ngram' fails compilation"
        status: pass
    human_judgment: false
  - id: D5
    description: "Kafka topic provisioning ensures orders.placed and inventory.updated with partitions/replication sized to the cluster, verified from metadata"
    requirement: CONN-04
    verification:
      - kind: unit
        ref: "backend/src/kafka/topics.test.ts (14 tests, fake KafkaJS admin)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Live execution of db:migrate, search:init, kafka:topics against Aiven PostgreSQL / OpenSearch / Kafka"
    requirement: CONN-02
    verification: []
    human_judgment: true
    rationale: "PENDING CREDENTIALS - no .env with real Aiven credentials, and no local PostgreSQL/OpenSearch/Kafka (docker socket not accessible). PostgreSQL acceptance of the DDL, OpenSearch acceptance of the index body and actual typo-tolerant analyzer behaviour, and Kafka topic-creation permissions have NOT been observed. Tracked in WINDOWS.md #2, #3, #4."

# Metrics
duration: 15min
completed: 2026-11-12
status: complete
---

# Phase 1 Plan 02: Schema Migrations, OpenSearch Mappings & Kafka Topics Summary

**This plan adds a 9-table PostgreSQL schema with lockable per-location inventory rows (`CHECK stock_quantity >= 0`), a transactional migration runner that tracks checksums, an aliased OpenSearch `products` index with edge-ngram and fuzzy-ready analyzers, and cluster-aware provisioning for the `orders.placed` and `inventory.updated` Kafka topics. All of it typechecks and passes 66 new offline tests (92 in total). None of it has run against live Aiven services, because no credentials exist yet.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-11-12T17:27:23Z
- **Completed:** 2026-11-12T17:42Z
- **Tasks:** 4/4
- **Files:** 9 created, 1 modified

## Accomplishments

- **Schema built for Phase 2 locking.** Each `inventory` row is one (product, location) pair, so a checkout locks exactly the rows it decrements. The schema header documents the recommended `... ORDER BY id FOR UPDATE` query; the deterministic order prevents deadlocks between multi-item checkouts. A named CHECK constraint stops a buggy decrement from ever making stock negative. Every foreign-key column is indexed, and every statement can be re-applied safely.
- **Safe migrations.** A single transaction under an advisory lock means concurrent runs serialise and a failure leaves no partial schema. SHA-256 checksums detect an applied migration that was later edited. SQL errors report the migration id, line number and SQLSTATE.
- **Search index designed for typo tolerance and filters.**
  - `product_text` (lowercase, ASCII folding, minimal English stemming) on name, description and category is where Phase 3 will run fuzzy `multi_match` searches.
  - `name.autocomplete` indexes 2-20 character edge n-grams and is searched with a non-ngram analyzer.
  - `category`, `city` and `in_stock_cities` are keywords; `price` is a scaled_float so range filters work; per-location inventory is stored as nested documents.
  - The request body is checked at compile time against the OpenSearch client's generated API spec types.
- **Shared document builder.** `buildProductDocument()` gives the 01-03 seeder and the Phase 3 sync consumer one way to compute derived availability fields. Because the mapping is `strict` and its properties are typed per document field, the document type and mapping cannot drift apart.
- **Kafka provisioning that adapts to the cluster.** Replication factor is min(3, brokers) and `min.insync.replicas` is sized to match. Topics are verified from live metadata after creation. Existing topics are never repartitioned. Authorization or policy failures are unwrapped from KafkaJS's aggregate error, with a hint to create the topics in the Aiven Console instead.

## Task Commits

1. **Task 1: schema.sql relational tables** - `95c7fd4` (feat)
2. **Task 2: migration runner migrations.ts** - `4133bf1` (feat)
3. **Task 3: OpenSearch products index mappings** - `d8dbeaf` (feat)
4. **Task 4: Kafka topic provisioning** - `7416994` (feat)

**Plan metadata:** recorded in the final docs commit (SUMMARY + STATE + WINDOWS).

## Files Created/Modified

- `backend/src/db/schema.sql` - DDL for 9 tables plus the `set_updated_at` trigger function, with the Phase 2 locking contract in the header
- `backend/src/db/schema.test.ts` - 18 structural tests (statement splitter and table parser)
- `backend/src/db/migrations.ts` - `MIGRATION_FILES`, `loadMigrations`, `applyMigrations`, `migrate`, `db:migrate` CLI
- `backend/src/db/migrations.test.ts` - 12 tests using a scripted fake client
- `backend/src/cli.ts` - `isMainModule`, `runCli`, `errorMessage`
- `backend/src/search/mappings.ts` - `PRODUCTS_ALIAS`/`PRODUCTS_INDEX`, settings and mappings, `ProductDocument`, `buildProductDocument`, `ensureProductsIndex`, `openSearchIndexAdmin`, `search:init` CLI (`--recreate`)
- `backend/src/search/mappings.test.ts` - 22 tests
- `backend/src/kafka/topics.ts` - `TOPICS`, `TOPIC_SPECS`, `ensureTopics`, `buildTopicConfigs`, `parseProvisionArgs`, `kafka:topics` CLI (`--partitions`, `--replication-factor`)
- `backend/src/kafka/topics.test.ts` - 14 tests using a fake KafkaJS admin
- `backend/package.json` - scripts `db:migrate`, `search:init`, `kafka:topics`

## Decisions Made

See `key-decisions` in the frontmatter. The three that matter most for later phases:

1. **Lock contract.** Phase 2 must lock inventory rows with `ORDER BY id FOR UPDATE`. It should also treat SQLSTATE 23514 on `inventory_stock_quantity_nonnegative` as "out of stock", as defence in depth.
2. **Always use the alias.** Readers and writers must target `products`, never `products_v1`. Index documents should only be built through `buildProductDocument()`.
3. **Use `TOPICS.*` constants for topic names.** The producer from 01-01 has auto-creation disabled, so topics must be provisioned before Phase 3 publishes anything.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `price` mapped as `scaled_float` instead of `keyword`**
- **Found during:** Task 3
- **Issue:** The plan text lists `price` among the "keyword fields". A keyword price sorts and ranges as text ("1000" < "250"), which would break the SEARCH-02 `gte`/`lte` price filter.
- **Fix:** Mapped `price` as `scaled_float` with `scaling_factor: 100` (exact to the paisa/cent). `category` and `city` stay keywords as planned.
- **Files modified:** backend/src/search/mappings.ts
- **Commit:** `d8dbeaf`

**2. [Rule 2 - Missing critical] Columns and constraints beyond the plan's column lists**
- **Found during:** Task 1
- **Issue:** The plan's column lists leave out fields that later requirements depend on:
  - KAFKA-01 needs the store location of each order.
  - Stock integrity needs CHECK constraints.
  - The 01-03 seeder needs "active products" and idempotent upserts.
- **Fix:** Added:
  - `orders.location_id` (NOT NULL), `orders.customer_id`, `orders.cart_id` (UNIQUE), `orders.updated_at`
  - `products.is_active`, `products.updated_at`
  - `carts.customer_id`, `carts.location_id`, `carts.status`
  - `order_items.unit_price` and the generated `line_total`
  - Unique keys on `categories.slug`, `products.sku`, `store_locations.name`, and `lower(customers.email)`
  - CHECK constraints on prices, quantities and statuses, plus FK indexes
  - All of the plan's listed columns are present unchanged.
- **Files modified:** backend/src/db/schema.sql
- **Commit:** `95c7fd4`

**3. [Rule 2 - Missing critical] Versioned index behind a `products` alias instead of a concrete `products` index**
- **Found during:** Task 3
- **Issue:** Analyzer settings can't be changed on an existing index. A concrete `products` index would need downtime and a code change for any future analyzer fix.
- **Fix:** `products_v1` is created with `products` as its write alias, so the name `products` works for every read and write exactly as the plan intended. If a concrete `products` index was auto-created, the initializer refuses to proceed unless `--recreate` is passed.
- **Files modified:** backend/src/search/mappings.ts
- **Commit:** `d8dbeaf`

**4. [Rule 3 - Blocking] Runnable CLIs: `backend/src/cli.ts` and backend package scripts**
- **Found during:** Task 2
- **Issue:** The plan calls for "scripts" but gives no way to run them. Root `db:migrate`/`seed`/`test:conn` shortcuts belong to plan 01-03.
- **Fix:** Added the backend workspace scripts `db:migrate`, `search:init` and `kafka:topics`, plus a shared direct-run guard and error handler. Configuration errors list variable names only, failures exit 1, and connections are always closed. Root `package.json` is untouched, so 01-03 can add its shortcuts.
- **Files modified:** backend/src/cli.ts, backend/package.json
- **Commits:** `4133bf1`, `d8dbeaf`, `7416994`

**5. [Rule 2 - Missing critical] Offline unit tests (not in plan)**
- 66 new hermetic tests. With no credentials and no local services, they are the only automated evidence available.
- Mutation checks confirmed the key assertions are real:
  - Weakening the CHECK, dropping the unique key, or removing an FK index fails 3 schema tests.
  - Removing a mapped field or misspelling `edge_ngram` fails compilation.

---

**Total deviations:** 5 auto-fixed (1 bug, 3 missing-critical, 1 blocking). No architectural (Rule 4) changes, and no new dependencies.

## Issues Encountered

- **No `node_modules` in the worktree.** Ran `npm ci` from the existing lockfile. No packages were added.
- **No offline execution environment.** There is no local PostgreSQL, OpenSearch or Kafka binary, and the docker socket returns permission denied. That is why SQL and mapping validation is structural or compile-time rather than executed.
- **A test bug during Task 2.** Passing `undefined` to `isMainModule` triggers the `process.argv[1]` default. The test now uses `''`. This was a test-only fix.
- **Slow failure on an unreachable broker (out of scope, not fixed).** With a fake broker, `kafka:topics` takes about 60s to fail. This comes from the 01-01 KafkaJS retry policy (`retries: 8`), not from this plan. It still exits 1 with a clear message.
- **Commit ledger location.** The sandbox blocks writes inside the shared `.git` dir, so the ledger base (`c5b7faf`) was captured in session context. `git rev-list --count c5b7faf..7416994` = 4.

## Pending Credentials (not verified, not faked)

None of the three provisioning scripts has been run against a live service. The following are **unproven**:

- PostgreSQL accepting `schema.sql`, including the trigger syntax, the generated column, the partial unique index and the POSIX regex CHECKs. Commands: `npm run db:migrate --workspace backend`, then run it again and expect `up to date 0001_initial_schema`.
- OpenSearch accepting the index body, and actual typo tolerance and autocomplete behaviour. Command: `npm run search:init --workspace backend`. Analyzer behaviour can then be spot-checked with `_analyze` on `autocomplete_index` and `product_text`.
- Aiven Kafka allowing this user to create topics, plus any plan limits on partitions. Command: `npm run kafka:topics --workspace backend`. If the plan restricts partitions, use `-- --partitions N`.

These are logged in `.planning/WINDOWS.md` as entries **#2, #3 and #4** (`unrun-verify`). **CONN-02, CONN-03 and CONN-04 are deliberately NOT marked complete in REQUIREMENTS.md.** The code is done, but "the script creates X" has not been observed.

## User Setup Required

This uses the same `.env` as 01-01 (see the 01-01 SUMMARY). Once it exists, run in this order:

1. `npm run db:migrate --workspace backend`
2. `npm run search:init --workspace backend`
3. `npm run kafka:topics --workspace backend`

## Next Phase Readiness

- **01-03 seed:**
  - Insert into `categories`/`products`/`store_locations`/`inventory`. Natural upsert keys are `slug`, `sku`, `name`, and `(product_id, location_id)`.
  - Index products via `buildProductDocument()` into the `products` alias, using `_id = product_id`.
  - Add root shortcuts that delegate to the backend scripts.
  - `test:conn` can reuse `PRODUCTS_ALIAS` and `TOPICS` for its index and topic status checks.
- **Phase 2:** The locking contract and constraint names are documented in the `schema.sql` header.
- **Phase 3:** Use the `TOPICS` constants and `buildProductDocument()`. Fuzzy queries target `name`, `description` and `category_name`; prefix queries target `name.autocomplete`.

## Self-Check: PASSED

- All 9 created files and the 1 modified file are present on disk.
- All 4 task commits (`95c7fd4`, `4133bf1`, `d8dbeaf`, `7416994`) are ancestors of HEAD; `git rev-list --count c5b7faf..HEAD` = 4.
- Final run: `npm test` 92/92 pass (21 suites), `npm run typecheck` exit 0, `npm run build` exit 0.
