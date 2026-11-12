# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React (Vite), Tailwind CSS, Lucide Icons, TypeScript

## Users

Primary users:
1. Retail customers browsing, searching, and purchasing products across physical store locations (Bangalore, Mumbai, Delhi) with live local inventory.
2. Hackathon judges and retail system architects evaluating stock integrity, real-time event streaming, and search speed across Aiven PostgreSQL, Apache Kafka, and OpenSearch.

## Product Purpose

RetailSync is a high-reliability, cloud-native online storefront built for a retail chain moving online. It proves stock integrity under concurrent purchasing, demonstrates real-time Kafka event streaming, and provides instant typo-tolerant product search. Success means 0% overselling during high-concurrency checkouts, sub-100ms fuzzy search response, and transparent real-time telemetry across all three managed services.

## Positioning

Unlike conventional e-commerce demos that fake downstream integrations, RetailSync provides a live, interactive 3-service telemetry inspector that exposes the real-time mechanics of PostgreSQL row-level locking (`SELECT ... FOR UPDATE`), Kafka event propagation, and OpenSearch document synchronization directly in the interface.

## Operating Context

- Evaluated during a hackathon pitch and live judging walkthrough.
- Must work flawlessly as a standalone interactive frontend demo (with comprehensive telemetry simulation) and seamlessly connect to the live Fastify backend and Aiven Cloud cluster via environment configuration.
- Viewed on modern desktop displays (1080p, 1440p) and mobile browsers.

## Capabilities and Constraints

- Instant typo-tolerant search powered by OpenSearch DSL simulation / live backend API.
- Multi-city inventory filtering (Bangalore Central, Mumbai Metro, Delhi Hub).
- Cart drawer with atomic stock reservation.
- Concurrency race simulation triggering simultaneous checkouts against a single remaining item to prove zero oversell.
- Live telemetry inspector visualizing PostgreSQL transactions, Kafka partitions/offsets, and OpenSearch indexing latency.
- Strict constraint: credentials must stay in `.env` and never leak into client bundles.

## Brand Commitments

- Brand Name: RetailSync
- Aesthetic Tone: Precision engineering meets clean modern retail. Warm slate neutrals, deep obsidian dark mode telemetry, vivid signal emerald for confirmed stock and transactions, and crisp typography.

## Evidence on Hand

- Hackathon problem statement: `RESEARCH.md` & `ideas.md`.
- Presentation guide: `PPT Guide .pdf`.
- Master roadmap & requirements: `.planning/REQUIREMENTS.md` & `.planning/ROADMAP.md`.

## Product Principles

1. **Integrity Over Optimism**: Stock counts are never assumed; transactions must be serialized and verifiable.
2. **Transparent Infrastructure**: The work of all three services (PostgreSQL, Kafka, OpenSearch) must be visible, measurable, and auditable in the UI.
3. **Frictionless Discovery**: Search should forgive misspellings, typos, and fuzzy queries instantly.
4. **Resilient Autonomy**: The UI functions smoothly with real backend services or in interactive demonstration mode for stress testing.

## Accessibility & Inclusion

- WCAG AA contrast compliance across all text and UI elements.
- Meaningful ARIA labels for cart actions, modals, and telemetry tabs.
- Full keyboard navigable catalog, search bar, and checkout flow.
- Reduced motion support for telemetry stream animations.
