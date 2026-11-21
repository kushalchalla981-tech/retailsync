# StoreForge AI E-Commerce Builder — Feature Notes (from inspection)

**Source (deployed demo):** https://storeforge-ai-e-comm-wvmv.bolt.host/  
**Inspected on:** 2026-05-02  
**Methods used:** Fetched landing HTML (`curl`), inspected main JS bundle (`assets/index-BhkOgL_6.js`), attempted web search for public feature docs (limited results specific to this Bolt URL). Browser automation via REA desktop browser was **not available** in this session; features below are a mix of **observed UI/data-model clues** from the bundle and **reasonable inferences** for a “StoreForge AI E-Commerce Builder” class app. Where uncertain, items are marked **(inferred)**.

---

## What the app appears to be
- **Product name (from page `<title>`):** “StoreForge AI E-Commerce Builder”
- **Hosting/platform cues:** Bolt.new badge/script in HTML; built with Vite/React bundle (`assets/index-*.js`, `assets/index-*.css`)
- **Backend/data layer (from bundle):** Uses **Supabase** client (`@supabase/supabase-js`) patterns for auth and data operations (see “Auth & data” below). The bundle includes logic referencing tables such as **stores**, **products**, **orders**, **order_items** (via typed mapping helpers).

---

## Observed / strongly indicated features

### 1) Store creation & management
From store editor UI strings and data mapping in the bundle:
- **Create a store** (flow implied by “Create Store” references in bundle search)
- **Store profile fields** (editable in store settings UI):
  - Store name
  - Logo upload/change (image upload control in UI)
  - Store description / banner text (textarea)
  - **Announcement banner** text (e.g. “Free shipping over $50” style messaging)
  - Banner image upload
  - Contact: **email, phone, address**
- **Store metadata / configuration** (from `Yd`/`loadAllData` mapping in bundle): `slug`, `owner_id` (nullable), `business_type`, `categories[]`, `theme_id`, `custom_colors` (primary/accent), `banner`, `announcement_text`, timestamps. This suggests **multi-attribute store setup** (niche/type, categories, theming).
- **Delete store** flow in UI copy: “Permanently delete this store, including its products and orders. This action cannot be undone.” (with confirmation UI text like “Confirm permanent deletion”).

### 2) Storefront / preview (builder experience)
- **Live preview panel** described in UI as **“Live Preview” / “Storefront”** while editing.
- Preview shows elements consistent with a storefront shell: header with logo/name and nav hints (Shop/About/Contact in preview text), announcement bar, hero/banner area driven by description/banner text, product grid placeholders/cards in preview, and footer text like “© {store name} · Built with StoreForge AI”.

### 3) Products & catalog (data layer)
From `Ui` mapping and DB operations in bundle:
- Product fields include: `name`, `description`, `price`, `salePrice`, `stock`, `category`, `image`, `sku`, `rating`, `reviews`, `tags[]`, `storeId`, `createdAt`.
- Operations indicated: load all products, add/update/delete product, **import products** (bulk insert path present), seed demo data that creates products/orders tied to a store.

### 4) Orders
From `Qd` mapping and operations:
- Order fields include: order number, items (product id/name/price/qty/image), `subtotal`, `shipping`, `total`, `status`, customer name/email/phone, shipping address, `createdAt`/`updatedAt`.
- Operations indicated: add order, update order status, load orders with related order items. Demo seeding can create sample orders.

### 5) AI assistant (in-app chat)
- UI text seen in bundle: references to **“StoreForge AI Assistant”** and a chat-style helper (messages array, assistant greeting referencing the store name). This suggests an **AI chat assistant** embedded in the builder/dashboard experience (**(inferred scope)**: helps with store/content questions; exact capabilities not fully extracted from minified bundle).

### 6) Auth & user accounts (Supabase Auth)
From the large Supabase auth client embedded in the bundle (GoTrue-style methods present):
- Email/password sign up & sign in (`signUp`, `signInWithPassword`)
- OAuth/social sign-in paths (`signInWithOAuth`) and related redirect handling
- Anonymous sign-in support (`signInAnonymously`) present in client code
- OTP flows (`signInWithOtp`, `verifyOtp`, `resend`), magic-link/OTP style patterns implied
- Password recovery (`resetPasswordForEmail`), session refresh, `getUser`, `updateUser`, sign out
- SSO/MFA/identity linking helpers exist in the bundled auth client (capability surface is broad in the library), though whether the UI exposes all of them is **not confirmed** from inspected snippets.

**Implication:** The app is set up for account-based flows typical of Supabase-backed SaaS (exact enabled providers/policies depend on backend config, not visible in client bundle alone).

### 7) Data/storage patterns (from bundle)
- Supabase project URL/key appear referenced in the bundle build output (client initialization). **Do not treat exposed anon keys as secrets in the usual Supabase model**, but avoid publishing them unnecessarily.
- Tables/collections implied: `stores`, `products`, `orders`, `order_items` (plus auth tables managed by Supabase).

---

## Likely / commonly expected features for this category (**inferred** — verify in UI)
The following are common in “AI e-commerce store builder” products and align partially with what was seen; they should be **confirmed by clicking through the live app** (or by a connected browser session) before being treated as guaranteed:
- Guided **store setup wizard** / step-by-step builder
- **Themes/templates** selection (`theme_id`, `custom_colors` suggest theming support)
- Product management UI (list/add/edit/delete, categories/tags)
- Order dashboard / order status management UI
- **AI-generated copy or suggestions** for store/product content (beyond the chat assistant name) — not explicitly proven from strings inspected
- Image handling via uploads (seen in store UI) and possibly external image URLs
- Basic storefront preview that maps to a public store URL/slug (`slug` field present)

---

## Gaps / what was **not** verified from this inspection
- Exact **navigation structure** (routes/pages) and all screens
- Whether there is a **public storefront URL pattern** per store in production
- Payment/checkout integration (Stripe, Razorpay, etc.) — **not evidenced** in the inspected JS snippets above
- File/storage bucket details for uploads
- Role/permission model (admin vs store owner) in this app vs. your planned platform roles
- Full list of AI features (what the assistant can do, any auto-generation of products/descriptions/themes)

---

## Recommendations for accurate feature extraction (next steps)
1. **Use a connected desktop browser (REA/browser tools)** to open https://storeforge-ai-e-comm-wvmv.bolt.host/, sign up/log in if needed, and click through: Dashboard, Create Store, Store Settings, Products, Orders, AI Assistant, Themes — then export notes/screenshots into this file.
2. If you have access to the **Bolt project/source** for that deployment, extract routes/components and README for authoritative features.
3. Cross-check against your `change_questions.md`: Q4 asks for features from the deployed platform to port — use this doc as a starting list and mark each item **Keep / Modify / Drop** for RetailSync.

---

## Raw cues captured (for traceability)
- HTML title: `StoreForge AI E-Commerce Builder`
- JS bundle references (examples seen): `Create Store`, `StoreForge AI Assistant`, store settings fields (logo, description/banner text, announcement banner, banner image, contact email/phone/address, delete store confirmation), Supabase auth methods (`signInWithPassword`, `signInWithOAuth`, `signInWithOtp`, `signUp`, etc.), and data helpers mapping `stores`/`products`/`orders`/`order_items`.
