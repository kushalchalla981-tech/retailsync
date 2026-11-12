---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-11-12T17:22:15.800Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | unrun-verify | backend/src/services/postgres.ts |  | 01-01: live Aiven connectivity (checkPostgres/checkKafka/checkOpenSearch) not exercised - no .env credentials; pending plan 01-03 npm run test:conn with real Aiven creds | open |  | 2026-11-12T17:22:15.800Z |  |

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
  }
]
````
