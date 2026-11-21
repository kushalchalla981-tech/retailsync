P1: Hackathon Brief — Build the Online Store (Aiven)
Goal: Build a working online storefront for a retail chain moving online.
Required tech (all must be used):
- PostgreSQL - Persistent store (products, prices, customers, carts, orders, stock). Must enforce stock integrity (prevent overselling).
- Apache Kafka - Event streaming (e.g., "order placed", "inventory changed"). Consumers react to events.
- OpenSearch - Product search with typo tolerance, filtering by category/price/city.
Core flow: Customer places order → saved in PostgreSQL → event to Kafka → consumer updates inventory and syncs OpenSearch index.
What to deliver:
1. Working demo (browse, search, add to cart, place order)
2. Show all three services doing real work (Kafka event + consumer reacting + search from OpenSearch)
3. Short pitch
Notes: Any frontend/backend language/framework; keep creds in env vars; Aiven free tier available.
P2: Gnani Voice Hackathon — Voice Agents (pick one track)
Platform constraints (apply to both tracks):
- Build on Gnani API Platform (sign up for API key, use credits)
- WebSocket streaming only (no telephony/phone numbers)
- Required STT: Prisma v3.0 on Gnani API Platform
- Required TTS: Timbre v3.0 on Gnani API Platform
- LLM/orchestration open (Pipecat, LiveKit, or custom). Hosted end-to-end agent platforms can't be the core loop.
- 24 hours, 5000 credits/team, live judge testing
- No voice cloning, no real PII/patient data
Track 1: PS1 — Healthcare: Voice field register for ASHA workers
- Problem: Convert spoken home-visit notes (code-mix Indic + English) into structured visit records + follow-ups without typing, usable in noise while moving between houses.
- Must build:
1. Streaming STT handling code-mix + local health terms (e.g., "TT injection", "ANC checkup", "IFA goli")
2. Structured record + read-back with voice corrections (fill form: beneficiary ID, visit type, weight, vaccinations due, next visit date; agent reads aloud for confirmation, fix by voice)
3. Danger-sign escalation (from team’s cited public guideline list only): if bleeding in pregnancy/high fever in newborn etc detected → tell her in her language to refer to PHC now, flag record. No diagnosis/treatment advice. Missed danger sign costs double.
- Guardrails: Synthetic beneficiaries only, cite danger-sign source.
Track 2: PS2 — Voice Khata for kirana stores
- Problem: Voice ledger for credit/payments during rush hour (code-mix, numbers/names, counter noise).
- Must build:
1. Numbers under noise (handle "teen sau chaalis", "340", "three-forty")
2. Ledger logic (parse customer/amount/credit-or-payment/relative dates like "kal"/"parso", handle corrections like "nahi, 430", disambiguate if two customers share name)
3. Spoken answers (e.g. "Aaj kitna udhaar gaya?" / "Ramesh ka total?" within 2s)
- Guardrails: Polite reminders only to opted-in customers, no pressure/threat language; ledger data on-device or encrypted at rest.
Judging (both): 100 pts total - Live judge test (30), Speech-layer depth (20), Fit for target user (20), Innovation (10), Responsible AI/compliance (10), Demo/docs (10). Live tests in any supported Indic language with English code-mix.
Deliverables (Gnani): Hosted link/runnable repo, public GitHub with README + architecture diagram + Gnani services used, 2-3 min demo video, pitch deck (max 6 slides).