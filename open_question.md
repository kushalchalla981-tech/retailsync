# Open Questions — Project changes under `/home/kush/Projects/` (not limited to `/home/kush/Projects/port`)

## Context (as shared)
- Changes are to be done in the **`/home/kush/Projects/`** area (broader than only `port`). Please clarify exact repo(s)/folders in scope.
- **Fresh frontend** exists at `new_frontend/` (in this workspace) and currently presents a **display of 6 members** (6 cards).
- A **new feature** (to be disclosed/spec’d) will enable users to **create stores**. These stores will **include the 3 services** (from the hackathon/store context discussed earlier: **PostgreSQL, Apache Kafka, OpenSearch** — i.e. the Aiven-style store stack). The **6 member cards** are intended to be **reused/helpful for displaying demo stores** later.
- You also mentioned: **credentials for sign in**, **Razorpay implementation**, and **features from an already deployed platform**.

Use this file to capture decisions before implementation.

---

## 1) Scope & repos (critical)
1. Which directories/projects under `/home/kush/Projects/` are in scope? (e.g. only `port`, `bb1`, and/or new apps/services?)
2. Is `new_frontend/` the future UI for this product? Where should it live permanently (stay in `bb1`, move into another repo/folder, or be the new root app)?
3. Do you want to **replace** existing UIs (e.g. current `port` frontend) or run **side-by-side** during migration?
4. What is the relationship between: the “6 members” marketing/site UI now in `new_frontend/`, and the new **store creation** product? (one app with multiple sections, separate apps, etc.)

---

## 2) Product vision: “create stores” + 3 services
5. When you say “ability to make stores which will include the 3 services”, do you mean each created store provisions/uses **PostgreSQL + Kafka + OpenSearch** (the stack from the Aiven online-store problem), or something else?
6. Is this a **multi-tenant platform** (many users create/manage stores) or a demo/showcase that spins up example stores?
7. What does “create a store” include end-to-end? (e.g. create DB tables/indexes/topics, seed data, storefront UI generation, admin panel, billing per store?)
8. Who can create stores? (any signed-in user, approved users only, admins only)
9. Lifecycle: can stores be paused/deleted? Limits (number of stores per user, quotas, free vs paid)?
10. The **6 cards** today show members — how should they map to **demo stores**? (6 fixed demo templates, one card = one demo store, or user-facing gallery?)

---

## 3) Fresh frontend (`new_frontend/`)
11. Current stack/state of `new_frontend/` (framework, bundler, routing, state). Any README? Is it deployable as-is?
12. Is the 6-member display the **landing/marketing** layer, and store creation is a new section/app area inside the same frontend?
13. Design/brand continuity with any existing site (`port`, deployed platform)? What must stay the same?
14. Responsive/mobile and accessibility expectations for the new flows (sign in, create store, dashboards)?

---

## 4) Credentials for sign in
15. Required auth methods? (email/password, magic link, OAuth providers, OTP, etc.)
16. Auth provider/location: custom backend, third-party (Clerk/Auth0/Supabase/Firebase), or reuse something that exists?
17. Roles/permissions needed? (e.g. user, admin, store owner)
18. How are credentials stored/secured? (hashing, password rules, session strategy: JWT vs cookies)
19. Migration of existing users? Any existing identity system to integrate with?
20. Protected areas and post-login routing (e.g. dashboard after login, create-store flow entry point)?

---

## 5) Razorpay implementation
21. Purpose: payments for **store creation/subscriptions**, marketplace fees, one-time setup, or something else?
22. Environment plan: sandbox first, production later — timeline?
23. Do you have Razorpay account + keys/webhook secret ready? (do not paste secrets here; note availability)
24. Pricing model: fixed plans, usage-based, per-store pricing, trials, coupons?
25. Checkout experience: Razorpay Checkout modal, hosted page, or custom UI?
26. Backend needs: create orders server-side, verify signatures, webhooks for fulfillment/state changes?
27. Post-payment actions: activate store, unlock limits, send confirmation, redirect targets?
28. Refunds/failures/disputes handling expectations?
29. Invoices/tax (GST etc.) or receipts required?

---

## 6) Features from an already deployed platform
30. **Which deployed platform** (URL/name)? Is it yours?
31. Which features do you want to bring over? (be specific: auth, dashboards, billing, content, analytics, admin tools, APIs, etc.)
32. Bring-over method: **reimplement**, **integrate via API/webhooks**, or **embed** (iframe)? Any constraints?
33. Access to source code, APIs, documentation, database/schema of that platform?
34. Must match behavior exactly, or redesign allowed?
35. Data migration needed? (users, stores, content, payments history) — format, volume, cutover plan?

---

## 7) “3 services” implementation details (stores)
36. For each store: where are **Postgres/Kafka/OpenSearch** provisioned? (Aiven accounts/projects, self-hosted, other providers) — per user, shared, or pooled?
37. Credentials/secrets handling for per-store services? (who stores them, rotation, least privilege)
38. How is the **store app** exposed to end customers of that store? (subdomain, path routing, generated frontend, etc.)
39. Is there a reference implementation of the “online store” flow (from P1 research) that stores should follow, or a custom template?
40. Observability/logging for store operations and for the platform admin?

---

## 8) Technical & operations
41. Target hosting/deployment for the full system? (separate frontends/backends? monorepo style?)
42. Backend(s): what exists today under `Projects/` and what should be created? (languages/frameworks)
43. Databases for the **platform** itself (users, billing, store metadata) vs per-store databases — clarify split.
44. CI/CD, environments (dev/staging/prod), and secret management.
45. Non-functional priorities: performance, SEO, accessibility, security (especially auth + payments + multi-tenant data isolation).

---

## 9) Timeline, priorities, definition of done
46. Hard deadline / hackathon vs product work?
47. MVP must-haves vs nice-to-haves (e.g. first version: sign-in + create one demo store + Razorpay test payment + show demo via 6-card UI?)
48. How will you demo/validate success? (script, checklist)

---

## 10) Risks & open unknowns
49. Biggest risks you see (multi-tenant isolation, provisioning costs for 3 services, Razorpay edge cases, time)?
50. Anything you want me to audit/read first in `/home/kush/Projects/` (list paths) before proposing a plan?

---
*Rewritten on 2026-05-02 to reflect: changes under `/home/kush/Projects/`, `new_frontend/` shows 6 member cards now repurposed for demo stores conceptually, new feature = users can create stores that include the 3 services (Postgres/Kafka/OpenSearch), plus sign-in credentials, Razorpay, and features from a deployed platform.*