# Design System: RetailSync

<!-- impeccable:design-schema 1 -->

## Visual World

RetailSync combines the refinement of contemporary Scandinavian retail (clean proportions, generous whitespace, tactile cards, subtle warm-gray surfaces) with the high-precision observability of modern cloud observability platforms (dark-slate telemetry console, mono tabular figures, discrete status pulses).

The storefront operates in **Persuade mode** (crisp product merchandising, instant search feedback, intuitive checkout frictionlessness), while the live telemetry inspector operates in **Operate mode** (density, scannability, monospace logs, millisecond latency metrics, real-time payload inspection).

## Palette

- **Ground**:
  - Storefront Canvas: `#0F172A` (Obsidian Slate / Deep Space) to `#1E293B` (Surface Card)
  - Light mode / Clean mode contrasts: `#F8FAFC` (Canvas White) with `#FFFFFF` cards
  - Dedicated Theme: High-tech dark retail aesthetic designed to make telemetry logs pop alongside vibrant retail product photography
- **Brand & Signal Accents**:
  - Primary / Aiven Flame: `#FF5E3A` (Warm Coral Flame) — primary actions, Aiven identity homage
  - Success / PostgreSQL Lock / Kafka ACK: `#10B981` (Emerald Glow) — confirmed stock, committed transactions
  - Warning / Contention: `#F59E0B` (Amber Pulse) — low stock, concurrency locks acquiring
  - Error / Oversell Prevented: `#EF4444` (Signal Red) — out of stock rejections, race condition prevention
  - OpenSearch Indigo: `#6366F1` (Indigo Search) — search indexing, typo match highlights
- **Neutrals**:
  - Text Primary: `#F8FAFC` (high-contrast 12:1 against slate-900)
  - Text Secondary: `#94A3B8` (contrast ≥ 5.2:1 against slate-900)
  - Borders & Dividers: `#334155` (Slate 700) with subtle `#475569` hover states

## Typography

- **Display & Interface**: Inter / Modern System Sans (`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)
- **Code & Telemetry**: JetBrains Mono / Modern System Monospace (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`)
- **Tabular Figures**: `font-variant-numeric: tabular-nums` strictly applied across all price displays, stock counters, Kafka offsets, and transaction timestamps to eliminate jitter.
- **Scale**:
  - Display / Hero: `2rem` (32px), `font-semibold`, tracking `-0.02em`
  - Section Headers: `1.25rem` (20px), `font-semibold`, tracking `-0.01em`
  - Body: `0.9375rem` (15px), `leading-relaxed`, line length 65–75ch
  - Captions / Microdata: `0.75rem` (12px), `font-medium`, tracking `0.02em`

## Elevation & Depth

- **Cards**: `bg-slate-800/80 backdrop-blur-sm border border-slate-700/60 rounded-xl` with soft dual shadow (`box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.3)`).
- **Interactive States**: Hover scales subtly (`scale-[1.01]`), border shifts to `border-slate-500/80`, and transition runs `duration-200 ease-out`.
- **Telemetry Drawer**: Glassmorphic docked split-view or expandable bottom dock with live pulse indicators.

## Components

1. **Top Navigation Bar**: Brand identity, City store selector dropdown, Live Search input with real-time fuzzy feedback, Cart button with animated item badge, and Telemetry Console toggle button with live streaming status indicator.
2. **Search Bar**: Keyboard-navigable (`Ctrl+K` / `/`), instant debounced query execution, typo tolerance match indicator (e.g., `"sneekers" → Matched "Sneakers" (OpenSearch Fuzzy)`), category chip filters.
3. **Product Card**: High-resolution imagery, category tag, city store inventory badge (with real-time stock pill: "In Stock: 1 left" or "In Stock: 14 units"), currency formatting (`₹`), and immediate "Add to Cart" with optimistic animation.
4. **Cart Drawer**: Slide-over drawer with item breakdown, quantity increment/decrement with stock bounds, subtotal calculation, tax, and checkout trigger.
5. **Checkout & Race Modal**: Step-by-step or instant checkout with address, payment simulation, and explicit visualization of the PostgreSQL transaction isolation.
6. **"All 3 Services in Action" Telemetry Console**:
   - **PostgreSQL Tab**: Recent SQL transactions, row-level lock timeline (`SELECT ... FOR UPDATE`), committed orders table.
   - **Apache Kafka Tab**: Streaming message stream with topic (`orders.placed`, `inventory.updated`), partition, offset, timestamp, and expandable JSON payload.
   - **OpenSearch Tab**: Index update latency (<40ms), query DSL debugger, fuzzy typo score calculator.
7. **Simulate Flash-Sale Race Condition Widget**:
   - A dedicated live demo control with 1 click: triggers two simultaneous customer checkout requests against a product with only 1 item remaining in stock.
   - Live visual outcome: User A acquires the PostgreSQL lock and completes order #1001; User B receives a polite "Out of stock - oversell prevented" response; Kafka publishes 1 event; OpenSearch marks the item "Sold Out" instantly.

## Motion & Micro-interactions

- Authored transition curves: `cubic-bezier(0.16, 1, 0.3, 1)` (smooth exponential ease-out).
- Live event badge: Pulsing emerald dot (`animate-pulse`) when events stream through Kafka.
- Stock count transition: Smooth numeric flash when inventory decrements.
- Custom styled scrollbars and custom selection styling (`selection:bg-orange-500/30 selection:text-orange-200`).
