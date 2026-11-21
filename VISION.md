* [ ] 

# VISION.md — RetailSync Platform

> **What we're building, why it matters, and where it's going.**

---

## The Big Idea

RetailSync is evolving from a single hackathon storefront demo into a **multi-tenant e-commerce platform builder** — a place where anyone can spin up a fully powered online store (backed by real PostgreSQL, Kafka, and OpenSearch infrastructure) in minutes.

Think of it as: **"StoreForge, but with real Aiven-powered infra under the hood."**

The platform has three distinct user types, one unified experience, and a homepage that makes the whole thing instantly legible.

---

## Who It's For

| Role                           | Who they are                       | What they do here                                     |
| ------------------------------ | ---------------------------------- | ----------------------------------------------------- |
| **Platform Owner** (you) | The operator of RetailSync         | Sees all stores, manages the platform, monitors infra |
| **Store Owner**          | A merchant, indie seller, or brand | Signs up, picks a template, launches their own store  |
| **Visitor / Buyer**      | An end customer                    | Browses demo or live stores, adds to cart, checks out |

---

## The Product — Layer by Layer

### Layer 1 — The Marketing Shell (`new_frontend/`)

The WebGL squad-portfolio frontend becomes the **public homepage**. Its 6 floating 3D cards — currently showing team members — are **repurposed to display 6 demo stores**. Each card is a live, interactive preview of a different store template: Fashion, Electronics, Grocery, Books, Beauty, Home Goods.

This is the first thing every visitor sees. It's the "wow" moment. Cards are rendered with HyperFrames (seamless looping video textures via Three.js), giving the homepage a tactile, premium feel no competitor has.

### Layer 2 — Authentication (Clerk + Cloudflare)

When a visitor wants to do anything beyond browsing, they hit a **Clerk-powered auth flow**. At sign-up, they choose their intent:

- **"I want to sell"** → becomes a Store Owner, lands in the Store Dashboard
- **"I want to shop"** → becomes a Buyer, lands at the store directory

Cloudflare sits in front for edge protection, rate limiting, and bot mitigation.

### Layer 3 — Store Builder (StoreForge-inspired)

Authenticated Store Owners get a **store creation wizard** with:

- **Inbuilt templates** — 6 pre-designed storefronts (matching the homepage card types)
- **Predefined layouts** — drag-and-drop sections (hero, product grid, announcement banner, footer)
- **Live preview panel** — see the store update in real time as you configure it
- **Store profile** — name, logo, description, contact details, theme colors, slug

Each store created on the platform gets its own **provisioned Aiven backend**: a PostgreSQL schema, Kafka topics, and an OpenSearch index — the same 3-service stack that powers the original hackathon demo, now deployed per store.

### Layer 4 — The Storefront (Customer-Facing)

Each store owner's store is accessible at a unique URL (`retailsync.app/{slug}`). Visitors can:

- Browse the product catalog with multi-category navigation
- Search with full typo-tolerance via OpenSearch fuzzy matching
- Add items to cart and check out
- Pay via **Razorpay** (UPI, cards, net banking, wallets)

Stock integrity is guaranteed by PostgreSQL row-level locks — no overselling, ever.

### Layer 5 — Platform Owner Dashboard

The platform owner sees everything: all registered stores, revenue, active users, infrastructure health across Aiven services, and a live Kafka event stream telemetry view — the original RetailSync "live telemetry inspector" feature, elevated to platform-wide observability.

---

## The Homepage — 6 Cards = 6 Demo Stores

The WebGL carousel from `new_frontend/` is the homepage hero. Each card:

| Card | Demo Store              | Theme                       |
| ---- | ----------------------- | --------------------------- |
| 1    | **Peel & Pour**   | Artisan grocery & beverages |
| 2    | **CircuitHub**    | Consumer electronics        |
| 3    | **Threadline**    | Minimal fashion & apparel   |
| 4    | **Folio & Spine** | Books & stationery          |
| 5    | **Lumière**      | Beauty & skincare           |
| 6    | **Hearthware**    | Home goods & furniture      |

Clicking a card opens its live demo store. A "Create Your Store" CTA floats below the carousel.

---

## Authentication Design

- **Provider:** Clerk
- **Edge layer:** Cloudflare (rate limiting, bot protection, WAF)
- **Sign-up intent split:** Store Owner vs Visitor/Buyer
- **Social login:** Google, GitHub
- **Guest browsing:** allowed — sign-in required only at checkout or store creation
- **Roles stored in:** Clerk metadata, synced to PostgreSQL `users` table

---

## Payments — Razorpay

- **What's paid for:** Store subscription (monthly plan to keep your store live), or per-transaction marketplace fee
- **Flow:** Standard Razorpay Checkout modal → server-side order creation → signature verification → webhook confirmation
- **Methods:** UPI, Credit/Debit cards, Net banking, Wallets, EMI
- **Post-payment:** Store activated, confirmation email sent (via Resend), order record written to PostgreSQL

---

## Tech Stack

| Layer                     | Technology                                                   |
| ------------------------- | ------------------------------------------------------------ |
| **Homepage**        | React 19 + Three.js + GSAP + HyperFrames (WebGL card videos) |
| **Storefront UI**   | React + Vite + Tailwind CSS + TypeScript                     |
| **Auth**            | Clerk + Cloudflare                                           |
| **Backend API**     | Fastify + TypeScript                                         |
| **Payments**        | Razorpay (server-side order + signature verify + webhooks)   |
| **Database**        | Aiven PostgreSQL (platform DB + per-store schemas)           |
| **Event Streaming** | Aiven Apache Kafka (per-store topics)                        |
| **Search**          | Aiven OpenSearch (per-store indices, fuzzy search)           |
| **Deployment**      | Render (backend) + Cloudflare Pages (frontend)               |

---

## Design Principles

1. **Motion with purpose** — Every animation carries meaning. The WebGL homepage and transitions use HyperFrames motion doctrine: vector continuity, no idle wobble, `cubic-bezier(0.16, 1, 0.3, 1)` easing throughout.
2. **Zero gradients** — Solid, deliberate color. No washed-out gradient backgrounds. Color is used for signal, not decoration.
3. **Stock integrity is non-negotiable** — PostgreSQL row-level locks at every checkout. The platform's credibility depends on 0% oversell.
4. **Transparent infrastructure** — Kafka events, OpenSearch sync latency, and PostgreSQL transaction state are always inspectable. The infra is a feature, not a black box.
5. **Role clarity at every step** — Every UI state makes it clear who you are (owner, buyer, platform admin) and what you can do from here.

---

## What "Done" Looks Like

A judge or visitor lands on the homepage, sees 6 beautiful 3D store cards floating in a WebGL carousel. They:

1. Click a card → enter a live demo store with real products
2. Search for "headphon" → OpenSearch returns "Headphones" with fuzzy match highlighted
3. Add an item → cart updates atomically, stock reserves in PostgreSQL
4. Click "Checkout" → Razorpay modal appears → test payment completes → order confirmed
5. Click "Create Your Store" → Clerk sign-up → choose "Store Owner" → store wizard → live store published in < 2 minutes
6. Platform owner dashboard shows the new store, its Kafka event stream, and OpenSearch index health — all live

---

## Open Questions

See [`open_question.md`](./open_question.md) for the full list of unresolved design and implementation questions.
See [`change_questions.md`](./change_questions.md) for answers needed before implementation begins.
See [`features_strip/STOREFORGE_FEATURES.md`](./features_strip/STOREFORGE_FEATURES.md) for the StoreForge feature reference.

---

*Last updated: 2026-11-21 | This document is the authoritative product direction. All plans, phases, and decisions derive from it.*
