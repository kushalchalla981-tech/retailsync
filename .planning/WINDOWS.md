---
schema_version: 1
open_count: 4
waived_count: 0
fixed_count: 0
total_count: 4
last_updated: 2026-11-12T17:39:15.883Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | unrun-verify | backend/src/services/postgres.ts |  | 01-01: live Aiven connectivity (checkPostgres/checkKafka/checkOpenSearch) not exercised - no .env credentials; pending plan 01-03 npm run test:conn with real Aiven creds | open |  | 2026-11-12T17:22:15.800Z |  |
| 2 | 01 | unrun-verify | backend/src/db/migrations.ts |  | 01-02: db:migrate never run against live Aiven PostgreSQL - schema.sql only structurally validated offline (no PG server/credentials); PostgreSQL acceptance of the DDL unproven. Run npm run db:migrate --workspace backend once .env exists | open |  | 2026-11-12T17:39:15.500Z |  |
| 3 | 01 | unrun-verify | backend/src/search/mappings.ts |  | 01-02: search:init never run against live Aiven OpenSearch - index body type-checked against OpenSearch API spec types and unit-tested, but cluster acceptance and analyzer behaviour (fuzzy/edge-ngram) unproven. Run npm run search:init --workspace backend once .env exists | open |  | 2026-11-12T17:39:15.690Z |  |
| 4 | 01 | unrun-verify | backend/src/kafka/topics.ts |  | 01-02: kafka:topics never run against live Aiven Kafka - provisioning logic unit-tested with a fake admin only; topic creation permissions/plan limits on Aiven unproven. Run npm run kafka:topics --workspace backend once .env exists | open |  | 2026-11-12T17:39:15.883Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "backend/src/services/postgres.ts",
    "line": null,
    "description": "01-01: live Aiven connectivity (checkPostgres/checkKafka/checkOpenSearch) not exercised - no .env credentials; pending plan 01-03 npm run test:conn with real Aiven creds",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-12T17:22:15.800Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "backend/src/db/migrations.ts",
    "line": null,
    "description": "01-02: db:migrate never run against live Aiven PostgreSQL - schema.sql only structurally validated offline (no PG server/credentials); PostgreSQL acceptance of the DDL unproven. Run npm run db:migrate --workspace backend once .env exists",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-12T17:39:15.500Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "backend/src/search/mappings.ts",
    "line": null,
    "description": "01-02: search:init never run against live Aiven OpenSearch - index body type-checked against OpenSearch API spec types and unit-tested, but cluster acceptance and analyzer behaviour (fuzzy/edge-ngram) unproven. Run npm run search:init --workspace backend once .env exists",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-12T17:39:15.690Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "backend/src/kafka/topics.ts",
    "line": null,
    "description": "01-02: kafka:topics never run against live Aiven Kafka - provisioning logic unit-tested with a fake admin only; topic creation permissions/plan limits on Aiven unproven. Run npm run kafka:topics --workspace backend once .env exists",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-12T17:39:15.883Z",
    "resolved_at": null,
    "milestone": null
  }
]
````
