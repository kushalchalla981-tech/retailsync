# RetailSync Version 1.05 Implementation Plan

## Overview
RetailSync v1.05 focuses on infrastructure unification, cross-device real-time consistency, merchant customization ergonomics, domain-governed store intelligence, and transparent cloud service telemetry.

---

## 1. Feature Breakdown & Specifications

### 1. Scroll Support for the Customize Store Section
#### Problem
In `PlatformDashboard.tsx` (`CustomizeStore.tsx`), the customization form and live preview container overflow vertically without proper scroll support. Lower fields (contact phone, business address, danger zone, delete store) and action buttons get cut off on laptop, tablet, and mobile displays (as highlighted in uploaded media).

#### Architecture & Implementation
- **Dashboard Layout Restructure** in `frontend/src/components/dashboard/PlatformDashboard.tsx`:
  - Enforce a strict viewport layout: `h-screen max-h-screen overflow-hidden flex flex-col`.
  - Fix the header bar (`shrink-0`) and sidebar navigation (`shrink-0 overflow-y-auto`).
  - Constrain the main canvas: `<main className="flex-1 overflow-y-auto max-h-[calc(100vh-65px)] p-4 sm:p-6 lg:p-8 overscroll-contain">`.
- **Customize View Ergonomics** in `frontend/src/components/dashboard/CustomizeStore.tsx`:
  - **Left Form Column (7 cols)**: Independent smooth scrollable container (`overflow-y-auto`) with custom sleek scrollbar.
  - **Right Preview Column (5 cols)**: Sticky device mockup (`sticky top-4`) so the live storefront preview stays anchored while the merchant scrolls through theme settings, typography, and contact fields.
  - **Mobile Responsiveness**: On mobile/tablet screens (`< lg`), stack controls and preview naturally with fluid touch scrolling (`-webkit-overflow-scrolling: touch`).
  - **Sticky Action Bar**: Anchor the "Save Changes" button in a top header strip so it remains instantly accessible regardless of scroll depth.

---

### 2. Multi-Store & Cross-Device Aiven Cloud Sync (PostgreSQL & Kafka Live Stock & Order Refresh)
#### Problem
While Aiven OpenSearch powers typo-tolerant catalog search, PostgreSQL and Apache Kafka updates currently do not propagate live stock changes across multiple open browser sessions or devices when an order is placed or stock is updated.

#### Architecture & Implementation
- **PostgreSQL Source of Truth**:
  - Connect all stores (flagship demo stores and merchant-created stores) to Aiven PostgreSQL inventory records (`inventory` and `products` tables).
  - Enforce atomic checkout decrements using PostgreSQL row-level locks:
    ```sql
    SELECT id, product_id, stock_quantity 
    FROM inventory 
    WHERE location_id = $1 AND product_id = ANY($2::bigint[]) 
    ORDER BY id FOR UPDATE;
    ```
  - Backstop with `CHECK (stock_quantity >= 0)` constraint, guaranteeing 0% overselling.
- **Apache Kafka Pipeline Integration**:
  - When checkout succeeds or a merchant alters stock:
    1. Produce an event to Kafka topic `retailsync-inventory`: `{ productId, sku, storeId, stockAfter, delta, timestamp }`.
    2. Produce an order event to Kafka topic `retailsync-orders`: `{ orderId, storeId, customerEmail, totalInr, items }`.
    3. Kafka consumer updates OpenSearch indices in near-real-time and emits a telemetry event.
- **Real-Time Cross-Device Client Sync**:
  - Telemetry SSE Stream (`/api/telemetry/stream` and `/api/telemetry/events`):
    - Connect `frontend/src/data/storeManager.ts` to the backend SSE telemetry bus.
    - On receiving `INVENTORY_DECREMENT` or `STOCK_UPDATED` events, update local React state and notify subscribers.
    - All connected customer devices, 3D card carousels, and merchant dashboards refresh stock counts live without page reloads.

---

### 3. Domain-Constrained AI Assistant & Persistent Chat History
#### Problem
1. The AI Assistant currently responds to arbitrary off-topic queries (e.g. general arithmetic like *"what is 2+2"*, trivia, general coding) instead of adhering strictly to platform domain intelligence.
2. Chat history resets whenever the user navigates between dashboard tabs or reloads the browser.

#### Architecture & Implementation
- **Domain Guardrail & Intent Classifier** in `frontend/src/components/dashboard/AIAssistant.tsx`:
  - Define allowable domain categories:
    1. **Catalog & Pricing**: Specific product lookups, prices, features (e.g., *"What is the price of sunglasses?"*, *"Show items under ₹1,000"*).
    2. **Inventory & Stock**: Stock levels, baseline (23 units) safety alerts, warehouse top line (129 units) cap.
    3. **Orders & Performance**: Order counts, settlement status, store revenue analytics.
    4. **Storefront Marketing**: Tagline suggestions, announcement banner copy, theme recommendations.
    5. **Aiven Cloud Infrastructure**: Real-time health of PostgreSQL row locks, Kafka topic lag, OpenSearch search latency.
  - **Off-Topic Interceptor**:
    - Strict regex/pattern and keyword rejection for off-topic queries (`math`, `2+2`, `general trivia`, `weather`, `coding unrelated to RetailSync`).
    - Standardized guardrail refusal message:
      > `⚠️ RetailSync AI is dedicated exclusively to store intelligence. I can only assist with product pricing, inventory levels, orders, storefront customization, and cloud infrastructure. Please ask a store-related question, such as 'What is the price of sunglasses?' or 'Which products are low on stock?'`
- **Chat Session Persistence**:
  - Store conversation state in browser `localStorage` keyed by store ID (`retailsync_ai_chat_${store.id}`).
  - Automatically load chat history upon mounting the AI Assistant tab.
  - Add a **"Clear Chat"** button with a confirmation tooltip in the chat header to reset history.

---

### 4. Interactive Aiven Cloud Service Event Ledger in About Modal
#### Problem
In the About modal (`AboutModal.tsx`), the three Aiven infrastructure cards (**POSTGRESQL**, **APACHE KAFKA**, **OPENSEARCH**) are static presentation cards. Clicking them does not provide deeper inspection into the live events of each service.

#### Architecture & Implementation
- **Clickable Service Cards** in `frontend/src/components/AboutModal.tsx`:
  - Enhance cards with hover elevations, neon border glows, and an interactive badge: `"Click to View Live Ledger ↗"`.
  - Add modal state: `activeLedger: 'postgres' | 'kafka' | 'opensearch' | null`.
- **Live Service Ledger Board (Pop-up Modal / Drawer)**:
  - Create `frontend/src/components/ServiceLedgerModal.tsx`:
    - **Header**: Service title, pulsing green `"CONNECTED · LIVE STREAM"` indicator, and connection status.
    - **Telemetry Subscription**: Reads from `/api/telemetry/stream` (SSE) with fallback to `/api/telemetry/events`.
    - **Service-Specific Views**:
      - **PostgreSQL Ledger**: Row-lock acquisition timestamps, transaction IDs, `SELECT ... FOR UPDATE` queries, constraint checks, latency (ms).
      - **Apache Kafka Ledger**: Topic event ledger (`retailsync-orders`, `retailsync-inventory`), partitions (0-2), message offsets, JSON payload viewer, consumer lag metrics.
      - **OpenSearch Ledger**: Index upserts, typo-tolerant query execution logs, n-gram tokenization traces, search latency metrics.
    - **Interactive Controls**: Filter by event type, search logs, copy JSON payload, pause/resume streaming, and export ledger.

---

### 5. Dual-Recipient Razorpay Invoices (Platform Owner & Buyer)
#### Problem
Payment invoice emails are currently sent solely to the platform owner (`kushalchalla981@gmail.com`). Shoppers/buyers do not receive their itemized payment receipt and invoice.

#### Architecture & Implementation
- **Dual-Recipient Email Dispatch** in `backend/src/services/invoice-email.ts`:
  - Update `sendInvoiceEmail(inv: Invoice)`:
    - Send email to `to: [PLATFORM_OWNER_EMAIL, inv.customerEmail].filter(Boolean)`.
    - Format customized HTML & plain-text templates:
      - **Buyer Invoice**: Professional customer tax invoice with store name, order ID, payment ID, itemized product table, total INR paid, and customer support contact.
      - **Owner Notification**: Platform owner summary with GMV, store name, customer details, and payout reconciliation data.
- **Frontend Customer Email Capture** in `frontend/src/components/CartDrawer.tsx`:
  - Auto-fill customer email if logged in via Clerk (`user.primaryEmailAddress.emailAddress`).
  - For guest checkouts: add an intuitive email input in the cart drawer before checkout (`"Receipt email *"`).
  - Forward `customerEmail` and `customerName` in the `/api/payments/razorpay/verify` payload.
- **In-App Digital Invoice Receipt**:
  - Create a digital invoice modal in the frontend that pops up immediately following successful checkout with a `"Print / Save PDF"` option.

---

## 2. File Change Matrix

| File | Changes |
| :--- | :--- |
| `frontend/src/components/dashboard/PlatformDashboard.tsx` | Viewport height constraints (`h-screen max-h-screen overflow-hidden`), scrollable `<main>` canvas. |
| `frontend/src/components/dashboard/CustomizeStore.tsx` | Independent scroll container for form, sticky live preview, sticky save header. |
| `frontend/src/components/dashboard/AIAssistant.tsx` | Platform domain intent classifier, off-topic rejection guardrails, localStorage chat persistence, clear chat action. |
| `frontend/src/components/AboutModal.tsx` | Make PostgreSQL, Kafka, and OpenSearch cards clickable triggers for the Ledger Board. |
| `frontend/src/components/ServiceLedgerModal.tsx` | **[NEW]** Interactive live telemetry ledger modal displaying streaming events, logs, and metrics per service. |
| `backend/src/services/invoice-email.ts` | Dual-recipient dispatch (`kushalchalla981@gmail.com` + buyer `customerEmail`), refined invoice layout. |
| `backend/src/routes/payments.ts` | Validate and attach customer email to invoice dispatch upon payment signature verification. |
| `frontend/src/components/CartDrawer.tsx` | Capture buyer email for guest/authenticated checkout, pass to verify payload, and trigger digital receipt. |
| `frontend/src/data/storeManager.ts` | Live SSE telemetry listener to refresh stock across all stores and devices automatically on order/stock events. |

---

## 3. Verification Plan

1. **Customize Scroll Test**:
   - Open Customize tab for both Platform Owner and Merchant stores on multiple screen resolutions (1920x1080, 1366x768, mobile 375px).
   - Verify all fields (brand name, theme, colors, contact details, danger zone) can be scrolled to without UI clipping.
2. **Real-Time Cross-Device Stock Test**:
   - Open the app in two browser windows side by side.
   - Place an order in window A; verify product stock decrements in window B in real time without refreshing.
3. **AI Assistant Guardrail Test**:
   - Query: *"What is the price of sunglasses?"* -> Answers with accurate product pricing from catalog.
   - Query: *"What is 2+2?"* -> Triggers branded guardrail refusal message.
   - Reload page -> Verify previous conversation history is restored.
4. **Service Ledger Modal Test**:
   - Click PostgreSQL, Kafka, and OpenSearch cards in About modal.
   - Verify ledger displays live streaming events with timestamps, payload details, and service metrics.
5. **Invoice Dispatch Test**:
   - Complete checkout with a test email.
   - Verify invoice payload sends to both `kushalchalla981@gmail.com` and customer email.
   - Verify in-app invoice view renders itemized breakdown.
