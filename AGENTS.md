# Agent Instructions for this repo (bb1)

## Start here: do NOT read every file
This project has many files (frontend/backend/docs/assets). **Do not** do a broad "read everything" scan on first contact.

### Preferred workflow (next time you continue this project)
1. **Use Graphify first** to build/refresh understanding of the codebase:
   - If `graphify-out/` exists, query it (graphify skill/tools) before manually exploring.
   - If missing/stale, consider running graphify to generate a knowledge graph, then query it.
   - Treat graphify queries as the default way to answer "how does X work?", "where is Y?", "what depends on Z?".
2. **Use Caveman (context compression)** when you need to ingest large outputs:
   - Use `caveman_compress` for large text/tool outputs before reasoning over them.
   - Use `caveman_toon_encode`/`decode` for uniform/tabular JSON payloads when helpful.
   - Goal: keep context small; avoid pasting huge raw logs/dumps into the conversation.

### Why
- The repo contains PDFs, docs, built assets, node_modules references, and multiple frontends/backends. Blind full reads waste context and time.
- Graphify provides a persistent knowledge graph (`graphify-out/`) to navigate relationships quickly.
- Caveman tools reduce token bloat from large outputs.

### Quick pointers
- Key docs: `RESEARCH.md`, `PRODUCT.md`, `execution_plan.md`, `DESIGN.md`, `VISION.md`, `change_questions.md`
- Hackathon briefs: `*.pdf` (use targeted extraction, not full manual re-reading unless necessary)
- Graph output: `graphify-out/` (if present)

### When you must explore manually
Only drill into specific files/directories after using graphify to identify the right targets.

---

## Platform Architecture & Role Separation

### 1. Platform Owner Enforcement
- **Platform Owner Identity**: Exclusively fixed to **`kushalchalla981@gmail.com`**.
- **Access Rule**:
  - No visitor, customer, or other authenticated user is permitted to manage stores, alter catalogs, adjust inventories, customize themes, or delete stores.
  - Non-owner users who attempt to enter the dashboard route encounter `<AccessDeniedModal />` which explains the single-tenant platform owner restriction.
  - The "👑 Dashboard" button in `<Header />` is displayed exclusively when `userEmail === 'kushalchalla981@gmail.com'`.

### 2. Active Storefront & Dashboard (`new_frontend/`)
- **Location**: `new_frontend/`
- **Framework**: Vite + React 19 + TypeScript + Tailwind CSS
- **Port**: 5174 for Vite dev server (`cd new_frontend && npm run dev`; Fastify backend on 3000, proxied via `/api`)
- **Key Modules**:
  - `src/components/dashboard/PlatformDashboard.tsx`: Main administrative hub with multi-store switcher, owner badge, and tab routing.
  - `src/components/dashboard/DashboardOverview.tsx`: 4 KPI cards, live Aiven infrastructure telemetry, recent orders table.
  - `src/components/dashboard/ProductsManagement.tsx`: Real-time catalog table, stock inline editor, Add Product modal.
  - `src/components/dashboard/OrdersManagement.tsx`: Order filtering and status lifecycle updater.
  - `src/components/dashboard/CustomizeStore.tsx`: Storefront theme customizer with presets, color pickers, and live side-by-side preview.
  - `src/components/dashboard/CreateStoreModal.tsx`: 4-step Store Creator wizard replicating StoreForge capabilities with RetailSync aesthetics.
  - `src/components/dashboard/AIAssistant.tsx`: Interactive AI Assistant for real-time inventory, sales, and Aiven telemetry insights.
  - `src/data/storeManager.ts`: Central reactive store management with localStorage persistence and default demo stores.
  - **Dynamic 3D Card Carousel**: Automatically subscribes to `storeManager`; newly created stores in the dashboard immediately manifest as new 3D cards on the homepage with custom procedural preview posters, Modak typography, theme palettes, and smooth cylinder positioning.

### 3. Authentication: Clerk SDK Standard
- Uses modern **`@clerk/react`** (v6 Core 3).
- **CRITICAL**: Do **NOT** install or use the deprecated `@clerk/clerk-react` (v5 Core 2) SDK. New Clerk instances mandate ClerkJS v6 / Core 3, and older SDKs will trigger `Reference: 6SrWqrpP ("This app uses an outdated version of Clerk")`.
- Configuration in `new_frontend/.env.local` (`VITE_CLERK_PUBLISHABLE_KEY`).
- Components used: `<SignInButton mode="modal">`, `<SignUpButton mode="modal">`, `<UserButton />`.

### 4. Payment Processing: Razorpay
- Integrated via `new_frontend/src/utils/razorpay.ts` and `src/components/CheckoutModal.tsx`.
- Key loaded from `VITE_RAZORPAY_KEY_ID` in `new_frontend/.env.local`. Test keys are preserved in `rzp-test-key.csv` (git-ignored).
- Built-in simulation fallback guarantees unbroken UX during offline or unconfigured test periods.

### 5. Backend API (`backend/`)
- Fastify + TypeScript with live Aiven PostgreSQL, Apache Kafka, and OpenSearch connectors.
- Concurrency locking using PostgreSQL `SELECT ... FOR UPDATE` (guaranteeing 0% overselling across multi-tenant storefronts).

---

## Secrets & Git Policy
- **NEVER** commit `.env`, `.env.local`, `*.key`, `*.pem`, `*.csv` (e.g. `rzp-test-key.csv`).
- Keep `.gitignore` updated to protect all credentials.
