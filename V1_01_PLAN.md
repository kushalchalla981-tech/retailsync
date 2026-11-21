# RetailSync Version 1.01 Implementation Plan

## Overview
RetailSync v1.01 enhances the multi-tenant e-commerce platform with a universal OpenSearch & competitive pricing bar, global multi-currency support, full-page store cards with reordered value-proposition sections, complete cart mechanics, role-aware profile routing, and repository transparency.

---

## Architecture & Feature Breakdown

### 1. Universal Search (OpenSearch + External Price Comparison)
- **Search UI**: Universal search trigger in the header (`⌘K` / `/` hotkey + search bar) opening an instant search modal.
- **Two Result Sections**:
  1. **RetailSync Stores**: Instant typo-tolerant fuzzy matching via Aiven OpenSearch (`/api/search?q=...`) across active store catalogs.
  2. **External E-Commerce Comparison**: Price benchmarks from platforms like Amazon, Flipkart, etc.
- **Cost Ordering**: All items are strictly ordered in **ascending order of price** (cheapest first) to help shoppers find the best value.

### 2. Multi-Currency Engine (8 Additional Currencies)
- **Supported Currencies**:
  - `INR (₹)`: Base currency
  - `USD ($)`: US Dollar
  - `EUR (€)`: Euro
  - `GBP (£)`: British Pound
  - `JPY (¥)`: Japanese Yen
  - `CAD (CA$)`: Canadian Dollar
  - `AUD (AU$)`: Australian Dollar
  - `SGD (SG$)`: Singapore Dollar
  - `AED (AED)`: UAE Dirham
- **Global Currency Context**: Header selector; automatically converts and formats prices on homepage cards, full-page storefronts, search results, cart items, and checkout totals.

### 3. Clean 3D Carousel & Store Title Alignment (Image 0 Fix)
- **Eliminate Clutter**: In `WorkNames.tsx`, remove the duplicate floating lowercase text (`title2` and `.work-names__bar`) that generated the duplicate subtitle ("CIRCUITHUB / circuithub") below the 3D card.
- **Title Matching**: Ensure the 3D WebGL card canvas texture and bottom HUD render the clean, official store name (`member.name`, e.g. "CircuitHub", "Threadline", "Peel & Pour").

### 4. Full-Page Storefront & Catalog Upgrade (Image 1 Redesign)
- **Full-Page Immersion**: Expand `StoreDetailModal.tsx` from a small dialog into a full-page modal covering the viewport with clean exit/navigation transitions.
- **Reordered Section Hierarchy**:
  1. **Store Identity**: Hero header banner, store emblem, category tag, and store name.
  2. **[WHAT MAKES US DIFFERENT]**: Positioned **immediately below the store name** (tagline, pitch, and key highlight badges).
  3. **Product Catalog**:
     - Expand from 3 products to **6–8 products per store** across all 6 stores.
     - Add **real high-resolution product photography** alongside emoji badges.
     - Add **Quantity Selectors** (`- [ qty ] +`) on each product card before adding to cart or purchasing.

### 5. Comprehensive Cart System
- **State & Storage**: Reactive cart context with `localStorage` persistence.
- **Slide-Over Cart Drawer**:
  - Lists cart items with store badge, product image, unit price, quantity controls, and delete action.
  - Live currency conversion for subtotal, taxes/shipping, and total.
  - One-click checkout directly integrated with Razorpay (`frontend/src/utils/razorpay.ts`).

### 6 & 7. Role-Based Access Control & Profile Routing
- **Platform Owner**: Exclusively fixed to `kushalchalla981@gmail.com`.
- **Profile Action Routing**:
  - Clicking on Profile / UserButton:
    - **Owner (`kushalchalla981@gmail.com`)**: Opens the administrative **Platform Dashboard** (KPIs, store customizer, live Aiven telemetry).
    - **Shop Creator (non-owner merchant)**: Opens the Store Creator wizard to create/manage their store.
    - **Visitor**: Displays profile information, recent orders, and options to explore stores or apply as a creator.

### 8. Repository Link in About Section
- In `AboutModal.tsx`, add the official GitHub link:
  `https://github.com/kushalchalla981-tech/retailsync.git` with badge, commit info, and repository link.

---

## Implementation Phases

| Phase | Scope | Target Files |
| :--- | :--- | :--- |
| **Phase 1** | Global Multi-Currency Context & 3D Title Fix | `src/context/CurrencyContext.tsx`, `src/utils/currency.ts`, `src/components/WorkNames.tsx`, `src/webgl/textures.ts` |
| **Phase 2** | Full-Page Storefront & Catalog Expansion | `src/data/stores.ts`, `src/components/StoreDetailModal.tsx` |
| **Phase 3** | Cart System & Slide-Over Drawer | `src/context/CartContext.tsx`, `src/components/CartDrawer.tsx`, `src/components/Header.tsx`, `src/utils/razorpay.ts` |
| **Phase 4** | Universal Search with OpenSearch & Comparison | `src/components/UniversalSearchModal.tsx`, `backend/src/routes/search.ts` |
| **Phase 5** | Role-Based Profile Routing & About GitHub Link | `src/components/Header.tsx`, `src/components/AboutModal.tsx`, `src/App.tsx` |
