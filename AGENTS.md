# Agent Instructions for this repo (bb1)

## Start here: do NOT read every file
This project has many files (frontend/backend/docs/assets). **Do not** do a broad "read everything" scan on first contact.

### Preferred workflow (next time you continue this project)
1. **Use Graphify first** to build/refresh understanding of the codebase:
   - CLI: `/home/kush/.local/bin/graphify` (Skill in `~/.gemini/config/skills/graphify/SKILL.md`).
   - If `graphify-out/` exists, query it (`graphify path`, `graphify explain`) before manually exploring.
   - If missing/stale, run `graphify update .` to refresh the knowledge graph.
   - Treat graphify queries as the default way to answer "how does X work?", "where is Y?", "what depends on Z?".
2. **Use Caveman (context compression)** when you need to ingest large outputs:
   - Binary: `/home/kush/.caveman/bin/caveman-mcp` (Configured in `~/.gemini/config/mcp_config.json`).
   - Use `caveman_compress` for large text/tool outputs before reasoning over them.
   - Use `caveman_toon_encode`/`decode` for uniform/tabular JSON payloads when helpful.
   - Goal: keep context small; avoid pasting huge raw logs/dumps into the conversation.

### Quick pointers
- Key docs: `V1_05_PLAN.md` (Active Roadmap), `V1_01_PLAN.md`, `RESEARCH.md`, `PRODUCT.md`, `execution_plan.md`, `DESIGN.md`, `VISION.md`, `change_questions.md`
- Project Repo: `https://github.com/kushalchalla981-tech/retailsync.git`
- Hackathon briefs: `*.pdf` (use targeted extraction, not full manual re-reading unless necessary)
- Graph output: `graphify-out/` (if present)

### When you must explore manually
Only drill into specific files/directories after using graphify to identify the right targets.

---

## Version 1.05 Active Scope & Rules

Refer to `V1_05_PLAN.md` for full implementation details:
1. **Customize Scroll Support**: Viewport constraints on dashboard layout (`h-screen overflow-hidden`) with dedicated, fluid scroll support for the customize tab on both desktop and mobile.
2. **Cross-Device Aiven Cloud Sync (PostgreSQL & Kafka)**: Real-time inventory and order sync across all devices and stores using PostgreSQL row-level locks and SSE telemetry stream (`/api/telemetry/stream`).
3. **Domain-Constrained AI Assistant**: Strictly filters off-topic questions (e.g. math/trivia) with branded guardrail refusal, provides domain answers (product pricing, inventory, infra), and persists chat history per store.
4. **Interactive Service Ledger in About**: PostgreSQL, Apache Kafka, and OpenSearch cards trigger a live Service Ledger Board with real-time streaming events and logs.
5. **Dual-Recipient Razorpay Invoices**: Dispatches verified invoices to both the platform owner (`kushalchalla981@gmail.com`) and buyer (`customerEmail`), with in-app printable tax receipts.

---

## Version 1.01 Completed Scope & Rules

Refer to `V1_01_PLAN.md` for full implementation details:
1. **Universal Search**: OpenSearch fuzzy search across store catalogs + external e-commerce price comparison (Amazon, Flipkart), sorted **ascending by cost**.
2. **Multi-Currency Support**: INR base + 8 additional currencies (USD, EUR, GBP, JPY, CAD, AUD, SGD, AED) with real-time conversion across the whole app.
3. **Store Title Alignment**: Clean up 3D card textures and eliminate duplicate lowercase subtitles (`title2`) from `WorkNames.tsx` (resolving Image 0 clutter).
4. **Full-Page Storefront**: Expand `StoreDetailModal` to full-page, place "[WHAT MAKES US DIFFERENT]" directly below the store name, expand catalog (6-8 items per store) with real product images and quantity steppers (resolving Image 1 redesign).
5. **Global Cart System**: Slide-over cart drawer with persistent items, quantity modifiers, currency-aware totals, and direct Razorpay checkout.
6. **Profile Click Routing & RBAC**:
   - **Platform Owner (`kushalchalla981@gmail.com`)**: Full administrative **Platform Dashboard** with visibility over ALL stores (flagship + merchant-built stores with creator metadata), platform GMV, and Aiven telemetry.
   - **Shop Creator (non-owner merchant)**: Direct store builder (no approval gates). Accesses their scoped **Merchant Dashboard** to manage products, inventory, orders, themes, and AI assistant for their created stores.
   - **Visitor**: View profile, order history, active currency, or immediately launch a store.
7. **Repository Transparency**: Official GitHub link (`https://github.com/kushalchalla981-tech/retailsync.git`) displayed in the About modal.

---

## Platform Architecture & Role Separation

### 1. Platform Owner & Merchant Roles
- **Platform Owner Identity**: Exclusively fixed to **`kushalchalla981@gmail.com`**.
- **Access Rule**:
  - The Platform Owner has global super-admin oversight: manages platform-wide stores, sees every store created by any merchant with creator email and launch timestamp, alters all catalogs, adjusts inventories, and inspects Aiven infrastructure.
  - Merchants/Creators can immediately create and launch storefronts. Their dashboard is strictly scoped to the store(s) they created (`ownerEmail === userEmail`), allowing full catalog, order, theme, and AI management without seeing other merchants' data.
  - The header dynamically reflects role: "👑 Platform Dashboard" for the owner, "🏪 My Store" for creators, and "Create Store" in bottom HUD and profile.

### 2. Active Storefront & Dashboard (`frontend/`)
- **Location**: `frontend/`
- **Framework**: Vite + React 19 + TypeScript + Tailwind CSS
- **Port**: 5174 for Vite dev server (`cd frontend && npm run dev`; Fastify backend on 3000, proxied via `/api`)
- **Key Modules**:
  - `src/components/dashboard/PlatformDashboard.tsx`: Main administrative hub with multi-store switcher, owner badge, and tab routing.
  - `src/components/dashboard/DashboardOverview.tsx`: 4 KPI cards, live Aiven infrastructure telemetry, recent orders table.
  - `src/components/dashboard/ProductsManagement.tsx`: Real-time catalog table, stock inline editor, Add Product modal.
  - `src/components/dashboard/OrdersManagement.tsx`: Order filtering and status lifecycle updater.
  - `src/components/dashboard/CustomizeStore.tsx`: Storefront theme customizer with presets, color pickers, and live side-by-side preview.
  - `src/components/dashboard/CreateStoreModal.tsx`: 4-step Store Creator wizard replicating StoreForge capabilities with RetailSync aesthetics.
  - `src/components/dashboard/AIAssistant.tsx`: Interactive AI Assistant for real-time inventory, sales, and Aiven telemetry insights.
  - Live stock (v1.05): `storefront_stock` table (`backend/src/store/storefront-stock.ts`, `GET/PUT /api/stock`). Razorpay verify decrements it once per payment under `FOR UPDATE` locks, publishes to Kafka `retailsync-orders` / `retailsync-inventory`, and streams `inventory.decrement` / `stock.updated` / `order.placed` over `/api/telemetry/stream`; `frontend/src/utils/telemetry.ts` is the single shared client.
  - `src/data/storeManager.ts`: Central reactive store manager. Merchant stores (ids `ms_…`) are stored in Aiven PostgreSQL via `/api/stores` (`backend/src/routes/merchant-stores.ts`, Clerk-token verified, owner = Clerk user id); the six demo stores stay built in with local edits.
  - **Dynamic 3D Card Carousel**: Automatically subscribes to `storeManager`; newly created stores in the dashboard immediately manifest as new 3D cards on the homepage with custom procedural preview posters, Modak typography, theme palettes, and smooth cylinder positioning.

### 3. Authentication: Clerk SDK Standard
- Uses modern **`@clerk/react`** (v6 Core 3).
- **CRITICAL**: Do **NOT** install or use the deprecated `@clerk/clerk-react` (v5 Core 2) SDK. New Clerk instances mandate ClerkJS v6 / Core 3, and older SDKs will trigger `Reference: 6SrWqrpP ("This app uses an outdated version of Clerk")`.
- Configuration in `frontend/.env.local` (`VITE_CLERK_PUBLISHABLE_KEY`).
- Components used: `<SignInButton mode="modal">`, `<SignUpButton mode="modal">`, `<UserButton />`.

### 4. Payment Processing: Razorpay
- Integrated via `frontend/src/utils/razorpay.ts` and `src/components/CheckoutModal.tsx`.
- Backend creates orders and verifies signatures (`backend/src/routes/payments.ts`) using `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` from the backend env; the browser only receives the public key id. Test keys are preserved in `rzp-test-key.csv` (git-ignored).
- Built-in simulation fallback guarantees unbroken UX during offline or unconfigured test periods.

### 5. Backend API (`backend/`)
- Fastify + TypeScript with live Aiven PostgreSQL, Apache Kafka, and OpenSearch connectors.
- Concurrency locking using PostgreSQL `SELECT ... FOR UPDATE` (guaranteeing 0% overselling across multi-tenant storefronts).

---

## Secrets & Git Policy
- **NEVER** commit `.env`, `.env.local`, `*.key`, `*.pem`, `*.csv` (e.g. `rzp-test-key.csv`).
- Keep `.gitignore` updated to protect all credentials.
