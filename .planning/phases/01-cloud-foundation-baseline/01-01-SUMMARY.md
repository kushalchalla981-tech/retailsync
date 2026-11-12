---
phase: 01-cloud-foundation-baseline
plan: 01
subsystem: infra
tags: [typescript, npm-workspaces, fastify, pg, kafkajs, opensearch, zod, tls, aiven]

# Dependency graph
requires: []
provides:
  - Root npm workspace (backend) with dev/start/build/typecheck/test fan-out scripts
  - Strict shared tsconfig (NodeNext, TS 7) + backend composite project
  - .env.example documenting every Aiven PostgreSQL / Kafka / OpenSearch variable
  - backend/src/config.ts - validated, typed per-service config (getPostgresConfig/getKafkaConfig/getOpenSearchConfig/getConfig)
  - backend/src/services/postgres.ts - getPgPool, query, withTransaction, checkPostgres, closePgPool
  - backend/src/services/kafka.ts - getKafka, getProducer, getAdmin, createConsumer, checkKafka, disconnectKafka
  - backend/src/services/opensearch.ts - getOpenSearch, checkOpenSearch, closeOpenSearch
  - backend/src/app.ts + server.ts - Fastify factory (/health liveness) and fail-fast entry point
affects: [01-02 migrations/mappings/topics, 01-03 test-conn + seed, phase-2 checkout locking, phase-3 kafka pipeline + search sync]

# Actuals (#2632) - plan carried no estimate; recorded for calibration.
actuals:
  tokens: 13656   # chars/4 over hand-written files (54,624 chars); package-lock.json (60,091 chars, generated) excluded
  tasks: 5
  commits: 7
plan_head_before: 378e27b2fad74b0df3cf0bf2e815e774157f9780
plan_head_after: 0fd695f3670940226056feeaf0df53d674b44f33

# Tech tracking
tech-stack:
  added: [fastify@5.12.8, pg@8.23.1, kafkajs@2.2.4, "@opensearch-project/opensearch@3.10.0", zod@4.6.7, typescript@7.0.2, tsx@4.23.15, "@types/node@26.6.6", "@types/pg@8.23.1"]
  patterns:
    - Lazy process-wide service singletons with idempotent close/disconnect
    - Pure option builders (buildPgPoolConfig / buildKafkaClientConfig / buildOpenSearchClientOptions) separated from I/O for hermetic tests
    - Per-service config sections validated independently; getConfig() aggregates all issues
    - Config errors name the variable, never echo the value
    - TLS always verify-full (rejectUnauthorized true), no disable switch
    - ESM ("type": "module") with .js import specifiers under NodeNext; node:test via tsx

key-files:
  created:
    - package.json
    - tsconfig.json
    - package-lock.json
    - .env.example
    - backend/package.json
    - backend/tsconfig.json
    - backend/src/config.ts
    - backend/src/config.test.ts
    - backend/src/services/postgres.ts
    - backend/src/services/kafka.ts
    - backend/src/services/opensearch.ts
    - backend/src/services/services.test.ts
    - backend/src/app.ts
    - backend/src/server.ts
  modified: []

key-decisions:
  - "Strip libpq ssl* params (sslmode etc.) from AIVEN_PG_URI and pass an explicit CA-pinned ssl object: pg merges parsed connection-string values over explicit options, so sslmode=require would silently drop the Aiven CA"
  - "Kafka supports both Aiven auth modes via AIVEN_KAFKA_AUTH=ssl (client cert, default) | sasl (scram-sha-256/512, plain); both always TLS-verified against the project CA"
  - "OpenSearch credentials are split out of the service URI and passed via auth so they never appear in client logs; system CAs by default (Aiven OpenSearch is publicly trusted), optional CA override"
  - "Single shared AIVEN_CA_CERT(_PATH) for the project CA with per-service overrides; certificates accepted as file paths (relative to repo root) or inline PEM"
  - "zod 4 for env validation and Node's built-in process.loadEnvFile instead of dotenv (real env vars take precedence over .env)"
  - "Kafka producer created with allowAutoTopicCreation false so topic-name typos surface as errors (topics provisioned explicitly in 01-02)"
  - "TypeScript 7.0.2 (current npm latest, native compiler) with tsx for dev/test execution"

patterns-established:
  - "Service module shape: buildXOptions(config) pure -> getX() lazy singleton -> checkX() health probe returning latency -> closeX() idempotent"
  - "New env vars: add to .env.example + a section loader in config.ts + unit test; never log values"

requirements-completed: []   # CONN-01 is PARTIAL - config loading/validation done; live connectivity validation pending credentials (plan 01-03 test:conn)

coverage:
  - id: D1
    description: "Root workspace and backend package install cleanly and compile TypeScript without errors"
    requirement: CONN-01
    verification:
      - kind: other
        ref: "npm install (0 vulnerabilities); npm ls --workspaces --depth=0; npm run typecheck; npm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "config.ts loads .env and validates Aiven PostgreSQL, Kafka, and OpenSearch parameters into typed objects, reporting every problem at once without leaking secrets"
    requirement: CONN-01
    verification:
      - kind: unit
        ref: "backend/src/config.test.ts (19 tests: defaults, missing/invalid vars, PEM path/inline, ssl+sasl, secret redaction, aggregation)"
        status: pass
      - kind: other
        ref: "node backend/dist/server.js with no .env -> exit 1, lists 7 missing variables by name"
        status: pass
    human_judgment: false
  - id: D3
    description: "Service singletons configure verified TLS required by Aiven (CA-pinned pg, CA + client-cert/SASL KafkaJS, verified OpenSearch with auth split from URL) and have correct singleton lifecycle"
    requirement: CONN-01
    verification:
      - kind: unit
        ref: "backend/src/services/services.test.ts (7 tests incl. pg connectionParameters control proving sslmode would override the CA)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Fastify entry point boots with valid config, serves /health, and shuts down cleanly closing all service connections"
    verification:
      - kind: other
        ref: "scratchpad smoke: node dist/server.js with well-formed fake env -> GET /health 200 {status: ok}; SIGTERM exit 0; no credentials in logs"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live TLS connections to real Aiven PostgreSQL, Kafka, and OpenSearch (checkPostgres / checkKafka / checkOpenSearch)"
    requirement: CONN-01
    verification: []
    human_judgment: true
    rationale: "PENDING CREDENTIALS - no .env with real Aiven service URIs/certificates exists; the probes compile and typecheck but have never been run against live services. To be exercised by plan 01-03 (npm run test:conn) once credentials are provided."

# Metrics
duration: 10min
completed: 2026-11-12
status: complete
---

# Phase 1 Plan 01: Workspace Scaffold & Aiven Service Connectors Summary

**npm-workspace TypeScript backend with zod-validated Aiven config and lazy, TLS-verified singletons for PostgreSQL (CA-pinned pg pool), Kafka (KafkaJS with client-cert or SASL), and OpenSearch. All of it compiles and passes 26 hermetic tests; live Aiven connections are pending credentials.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-11-12T17:12:41Z
- **Completed:** 2026-11-12T17:22:30Z
- **Tasks:** 5/5 (+1 deviation commit, +1 fix commit)
- **Files created:** 14

## Accomplishments

- Root npm workspace plus a strict shared tsconfig, and a `backend` workspace with Fastify 5, pg 8, kafkajs 2, OpenSearch client 3, zod 4, TypeScript 7 and tsx. Install, typecheck and build are all clean (0 vulnerabilities).
- `.env.example` documents every variable: server settings, the shared project CA, the PG URI and pool tuning, Kafka brokers with ssl or sasl auth, and the OpenSearch URI. It includes Aiven-specific guidance, such as SASL using a different broker port.
- `config.ts` validates each service independently. Misconfiguration lists every offending variable **name** at once; values are never echoed. Unit tests check that secrets don't leak.
- Found and neutralised a real Aiven/pg gotcha: `sslmode=require` in the service URI overrides an explicit `ssl: { ca }` object. A control test proves the override, and a second test proves the stripped config keeps the pinned CA.
- Each service exposes `checkX()` health probes (with latency, TLS status, cluster info), ready for plan 01-03's `test:conn`.

## Task Commits

1. **Task 1: Root package.json workspace + root dev scripts** - `0bb6de9` (chore)
2. **Task 2: backend/ with Fastify, pg, kafkajs, OpenSearch, TypeScript** - `b1906f3` (chore)
3. **Task 3: .env.example documenting Aiven variables** - `f3cde66` (docs)
4. **Task 4: config.ts with runtime environment validation** - `0bc6d5f` (feat)
5. **Task 5: postgres/kafka/opensearch services with SSL** - `a121ac3` (feat)
6. **Fix: Kafka auth issues reported when brokers missing** - `345a755` (fix)
7. **Deviation: Fastify entry point (app.ts/server.ts)** - `0fd695f` (feat)

**Plan metadata:** recorded in the final docs commit (SUMMARY + STATE + ROADMAP).

## Files Created/Modified

- `package.json` - root workspace (`backend`), `dev/start/build/typecheck/test` fan-out scripts, Node >= 22.12
- `tsconfig.json` - shared strict NodeNext compiler options with a project reference to backend
- `package-lock.json` - lockfile
- `.env.example` - documented Aiven connection variables (placeholders only)
- `backend/package.json` - dependencies and scripts (`tsx watch`, `tsc -b`, `tsx --test`)
- `backend/tsconfig.json` - composite project, `src` -> `dist`
- `backend/src/config.ts` - env loading and validation, typed `ServerConfig/PostgresConfig/KafkaConfig/OpenSearchConfig`, `describeConfig()` safe summary
- `backend/src/config.test.ts` - 19 config unit tests
- `backend/src/services/postgres.ts` - pg pool singleton, `query`, `withTransaction`, `checkPostgres` (reports `pg_stat_ssl`), `closePgPool`
- `backend/src/services/kafka.ts` - KafkaJS client, memoised producer/admin, tracked consumers, `checkKafka`, `disconnectKafka`
- `backend/src/services/opensearch.ts` - OpenSearch client singleton, `checkOpenSearch`, `closeOpenSearch`
- `backend/src/services/services.test.ts` - 7 hermetic service tests
- `backend/src/app.ts` - Fastify factory, `/health` liveness, onClose closes all connections
- `backend/src/server.ts` - entry point: validates the full config (exit 1 on error), listens, handles SIGINT/SIGTERM

## Decisions Made

See `key-decisions` in the frontmatter. The most consequential:

1. **The PG URI is sanitised.** All `ssl*` and `uselibpqcompat` query params are removed, and TLS is set only through the explicit `ssl: { ca, rejectUnauthorized: true }`. Without this, pg's connection-string merge silently discards the Aiven CA. (Stripping also avoids pg's sslmode deprecation warning.)
2. **Both Kafka auth modes are supported**, so the team can use whichever the Aiven service has enabled.
3. **There is no TLS-disable escape hatch.** Verification is always on.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added Fastify entry point (`backend/src/app.ts`, `backend/src/server.ts`)**
- **Found during:** Task 2 / post-Task 5
- **Issue:** The scaffolded `dev` (`tsx watch src/server.ts`) and `start` (`node dist/server.js`) scripts had no entry point, and nothing exercised Fastify or full-config validation at startup.
- **Fix:** Added a minimal Fastify factory with a `/health` liveness route (no Aiven calls) and an onClose hook that closes all three singletons. The entry point validates the full config and exits 1 with variable names on error. No business routes were added; those stay in Phase 2.
- **Files modified:** backend/src/app.ts, backend/src/server.ts
- **Verification:** The compiled server, run with a well-formed fake env, answers `/health` with 200, exits 0 on SIGTERM, and logs no credentials. With no env it exits 1 and lists the missing variables. The tsx dev path behaves the same.
- **Committed in:** `0fd695f`

**2. [Rule 1 - Bug] Kafka auth issues hidden when `AIVEN_KAFKA_BROKERS` missing**
- **Found during:** Deviation 1 verification (fail-fast output)
- **Issue:** Brokers and auth fields shared one zod object, so a missing broker list stopped the client cert/key checks. A first run with an empty `.env` didn't list everything at once, contrary to the module's design.
- **Fix:** Brokers are now validated separately from the auth schema. Added a regression test.
- **Files modified:** backend/src/config.ts, backend/src/config.test.ts
- **Verification:** 26/26 tests pass; empty-env output lists all 7 missing variables.
- **Committed in:** `345a755`

**3. [Rule 2 - Missing critical] Added unit tests (not in plan)**
- 26 hermetic `node:test` tests (via tsx) for config validation, secret redaction, TLS option building and singleton lifecycle. This is the only automated proof available without live credentials. Committed alongside Tasks 4 and 5.

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug, 1 missing-critical)
**Impact on plan:** All changes support the plan's must-haves (compile, validate, SSL). No business logic was pulled forward from later phases.

## Issues Encountered

- **npm 11 `allowScripts`:** esbuild's postinstall (used by tsx) was not run. tsx works without it because the platform binary arrives through esbuild's optional dependency, as verified by the test runs. No action taken.
- **The worktree sandbox blocks writes inside the shared `.git` dir.** So the commit ledger base (`378e27b`) was kept in the session scratchpad rather than `.git/worktrees/.../gsd-plan-head-before-01-01`. The commit count was measured with `git rev-list --count 378e27b..HEAD` = 7.

## Pending Credentials (not verified, not faked)

There is no `.env` with real Aiven credentials, so the following were **not** exercised:

- TLS handshake and authentication against live Aiven PostgreSQL (`checkPostgres`, including `pg_stat_ssl.ssl = true`)
- Kafka TLS plus client-cert or SASL auth and the `describeCluster` metadata round-trip (`checkKafka`)
- OpenSearch TLS plus basic auth, `info` and `cluster.health` (`checkOpenSearch`)

These probes compile and typecheck, and their option builders are unit-tested. They will be run by plan 01-03 (`npm run test:conn`) once credentials exist. This is logged in `.planning/WINDOWS.md` (entry #1, `unrun-verify`). **CONN-01 is therefore not marked complete in REQUIREMENTS.md**: the "validates connectivity" half is still outstanding.

## User Setup Required

To go live, a human must:
1. Create Aiven PostgreSQL, Kafka, and OpenSearch services, all in one Aiven project.
2. Download `ca.pem`, plus Kafka's `service.cert` and `service.key`, into `./certs/` (these are gitignored).
3. Run `cp .env.example .env` and fill in `AIVEN_PG_URI`, `AIVEN_KAFKA_BROKERS`, and `AIVEN_OPENSEARCH_URI`.
4. Run `npm run dev`. The startup log line "configuration validated" confirms the config. Connectivity is confirmed via 01-03's `test:conn`.

## Next Phase Readiness

- 01-02 can use `withTransaction`/`query` to run migrations, `getAdmin()` to provision topics, and `getOpenSearch()` for index mappings.
- 01-03 can call `checkPostgres/checkKafka/checkOpenSearch` directly. Each section's config validates independently, so one misconfigured service doesn't block diagnostics for the others.
- Blocker for live verification: Aiven credentials (already listed in STATE.md concerns).

---
*Phase: 01-cloud-foundation-baseline*
*Completed: 2026-11-12*

## Self-Check: PASSED

- All 14 created files present on disk.
- All 7 plan commits (0bb6de9, b1906f3, f3cde66, 0bc6d5f, a121ac3, 345a755, 0fd695f) are in `git log 378e27b..HEAD`.
- Final run: `npm test` 26/26 pass, `npm run typecheck` clean, `npm run build` clean.
