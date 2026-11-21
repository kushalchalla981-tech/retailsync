# 🧭 Planning Questions — RetailSync Major Changes

> These questions must be answered before any implementation begins.
> Fill in your answers inline, then share back so we can build the execution plan.

---

## 1. The `new_frontend` — What Is It For?

The `new_frontend/` directory is a **WebGL squad-portfolio site** (3D card carousel, team dossiers, GSAP/Three.js, HyperFrames-rendered card videos). It is **not** a RetailSync storefront.

- **Q1.1** — Is `new_frontend` meant to **replace** the current RetailSync storefront (`frontend/`), or is it a **separate product page** (e.g., a team intro / hackathon landing that links into the main app)?

  - [X] A) Replace the storefront entirely
  - [ ] B) Stand-alone team/portfolio page; `frontend/` stays as the storefront
  - [ ] C) Merge: port the squad-portfolio design system into the storefront shell
  - [X] D) Other: the change i want to implement includes a feature to make our own store. and i want to display 4-6 demo stores. and those 6 cards will be replaced either with some 3d figure or store demo image.
- **Q1.2** — The team data in `new_frontend/src/data/team.ts` has placeholder members (Alex Rivera, Maya Chen, etc.). Should we **replace them with the real team** (names, roles, bios, photos, socials)?

  - [ ] Yes — provide real member info
  - [X] No — keep placeholders for now

  - Your team member list: ___
- **Q1.3** — The card videos (`public/cards/member-N.mp4`) were pre-rendered with HyperFrames. After updating `team.ts`, do you want them **re-rendered** with real data?

  - [X] Yes (requires Node 22+, FFmpeg, Chromium on the server)
  - [ ] No — ship with placeholder cards for now
  - [ ] Only for demo day (specify date): ___
- **Q1.4** — Where should the new_frontend **deploy**? Same Render service as the storefront, a separate URL, or Vercel/Netlify?

  - [X] Same Render service (different route or subdomain)
  - [ ] New separate deployment
  - [ ] Other: ___

---

## 2. Credentials / Sign-In

- **Q2.1** — What authentication method do you want?

  - [ ] A) **Supabase Auth** (fastest, includes PostgreSQL, free tier) — recommended
  - [ ] B) **Firebase Auth** (Google/Social logins out of the box)
  - [ ] C) **JWT with our own backend** (Fastify + bcrypt + refresh tokens)
  - [ ] D) **Magic link / OTP** (email or SMS, no password)
  - [ ] E) **OAuth only** (Google, GitHub, etc.)
  - [X] F) Other: clerk authentication, cloudflare
- **Q2.2** — Which social providers should be supported at launch?

  - [X] Google
  - [X] GitHub
  - [ ] Phone/OTP (SMS)
  - [X] Email + Password only
  - [ ] Other: ___
- **Q2.3** — Should **guest checkout** still be allowed (no login required to browse and add to cart)?

  - [X] Yes — sign-in is optional, only needed for order history / saved preferences
  - [ ] No — require login before checkout
  - [ ] Sign-in required only at payment step
- **Q2.4** — What user data needs to persist post-login?

  - [X] Order history
  - [X] Saved cart
  - [X] Saved addresses
  - [X] Wishlist
  - [X] All of the above
  - [ ] Other: ___
- **Q2.5** — Do you need **role-based access**? (e.g., admin dashboard, store manager vs customer)

  - [X] Yes — describe roles: there will be me[the owner of the polatform], store owners[who can either build stores and manage their stores] and buyers
  - [ ] No — single customer role only

---

## 3. Razorpay Integration

- **Q3.1** — Do you have Razorpay **API credentials** ready (key ID + secret)?

  - [X] Yes — test keys available
  - [X] Yes — live keys available
  - [ ] No — need to create a Razorpay account first
- **Q3.2** — Which **payment methods** should be enabled?

  - [X] UPI
  - [X] Credit / Debit cards
  - [X] Net banking
  - [X] Wallets (Paytm, PhonePe, etc.)
  - [ ] EMI
  - [ ] All (Razorpay standard checkout handles this automatically)
- **Q3.3** — What is the **payment flow**?

  - [X] A) Standard: Create order → Razorpay modal → verify signature → show success (recommended)
  - [ ] B) Subscriptions / recurring billing
  - [ ] C) Payment links sent via email/SMS
  - [ ] D) Other: ___
- **Q3.4** — Do you need **webhooks** for server-side payment confirmation (required for production reliability)?

  - [X] Yes — we have a public backend endpoint
  - [ ] No — client-side verification only (acceptable for hackathon demo)
- **Q3.5** — After a successful payment, what happens?

  - [X] Show order confirmation page
  - [X] Send email receipt (requires email service like Resend/SendGrid)
  - [ ] Update order status in database
  - [ ] All of the above
  - [ ] Other: ___
- **Q3.6** — Do you need a **refund / cancel order** flow in the UI?

  - [X] Yes
  - [ ] No — payment is final at demo scope

---

## 4. Deployed Platform — Feature Porting

- **Q4.1** — What is the URL of the **already deployed platform**?URL: ___
- **Q4.2** — Which **specific features** from that platform do you want to port into this project? (List each one)

  ```
  Feature 1: ___
  Feature 2: ___
  Feature 3: ___
  ...
  ```
- **Q4.3** — Do you have **API access** to that deployed platform, or do we need to reverse-engineer the UI/UX?

  - [ ] Yes — API docs / keys available
  - [X] No — UI reference only (we clone the experience, not the API)
  - [ ] I have the source code for that platform
- **Q4.4** — Is the deployed platform in the **same codebase** (a different branch/folder) or a completely separate repo?

  - [ ] Same repo, folder: ___
  - [ ] Separate repo, URL: ___
  - [ ] Deployed only, no source access

---

## 5. Architecture & Backend

- **Q5.1** — Is the **Aiven backend** (Fastify + PostgreSQL + Kafka + OpenSearch) already deployed and running, or do we still need to build/connect it?

  - [X] Deployed and running — provide base URL: ___
  - [ ] Running locally only
  - [ ] Not built yet — still using mock API
- **Q5.2** — Do you need a **new database schema** for users, orders, and payments, or is there an existing schema to extend?

  - [ ] Design fresh schema
  - [ ] Extend existing schema — share it: ___
- **Q5.3** — Where does the backend **deploy**?

  - [X] Render (existing `render.yaml`)
  - [ ] Railway / Fly.io / Supabase Edge Functions
  - [ ] Other: ___

---

## 6. Scope & Timeline

- **Q6.1** — What is the **hackathon deadline** / demo day?Date & time: ___
- **Q6.2** — What is the **minimum shippable demo** that must work end-to-end on demo day?

  - [ ] Squad portfolio page only
  - [ ] Storefront + sign-in + Razorpay checkout (no order history)
  - [ ] Full flow: browse → cart → login → pay → confirmation
  - [ ] Other: ___
- **Q6.3** — Should we keep the existing `frontend/` as a **fallback / reference**, or delete it entirely once `new_frontend` is integrated?

  - [ ] Delete `frontend/` — replace completely
  - [ ] Keep `frontend/` for now — integrate in parallel
  - [X] Archive `frontend/` in a git branch
- **Q6.4** — Are there any **design constraints** I must carry forward from the current build?

  - Existing constraints: zero gradients, Obsidian palette, Plus Jakarta Sans, WCAG AA contrast

  - [ ] Keep all of these
  - [X] Override with new_frontend's design system (Modak + Inter, paper textures, peach tones)
  - [ ] Mix — specify: ___

---

## 7. Quick Priority Ranking

> Rank 1 (most urgent) → 5 (nice to have):

| Feature                             | Your Priority (1–5) |
| ----------------------------------- | -------------------- |
| new_frontend integration            |                      |
| Sign-in / authentication            |                      |
| Razorpay payments                   |                      |
| Deployed platform features          |                      |
| HyperFrames pitch deck (PPT slides) |                      |

---

> **Once answered**, the execution plan will be drafted with phases, task lists, and git commit strategy. No code changes happen before you approve the plan.
