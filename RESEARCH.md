# Research: Hackathon Problem Statements Analysis

*Generated: Nov 11, 2026 | Location: /home/kush/Projects/bb1/*

## Overview
This directory contains two hackathon problem statements:
1. **P1: Aiven Hackathon Brief** - Build an online store using PostgreSQL, Kafka, and OpenSearch
2. **P2: Gnani Voice Hackathon** - Build a voice agent on Gnani API Platform (choose Healthcare/ASHA or Voice Khata/Kirana track)

---

## P1: Build the Online Store (Aiven)

### Problem Statement Summary
A retail chain expanding from physical to online stores needs a working storefront where customers can browse products, add to cart, and place orders. Requirements focus on speed, stock accuracy under concurrent changes, and good searchability.

### Technical Requirements (Mandatory)
| Service | Purpose | Key Requirements |
|---------|---------|-----------------|
| **PostgreSQL** | Source of truth | Products, prices, customers, carts, orders, inventory. Must prevent overselling (concurrent purchase protection). |
| **Apache Kafka** | Event streaming | Publish events like "order placed", "inventory changed". Consumers must react to events. |
| **OpenSearch** | Search engine | Fast product search with typo tolerance, filters for category/price/city. Must stay in sync via events/consumers. |

### Core Flow
```
Customer places order → PostgreSQL (transaction with stock check) → Kafka event published 
→ Consumer processes event → Updates inventory → Syncs OpenSearch index
```

### Deliverables
1. Working demo (browse, search, add to cart, place order)
2. Demonstrate all three services doing real work (Kafka event creation, consumer reaction, OpenSearch search results)
3. Short pitch

### Technical Considerations

#### Architecture Options
- **Backend**: Node.js (Express/Fastify), Python (FastAPI/Django), Go, Java (Spring Boot) - all allowed
- **Frontend**: React, Vue, Svelte, vanilla JS, etc.
- **Event flow**: Transactional outbox pattern recommended to ensure DB change + event publish atomicity
- **Stock management**: Use PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) or optimistic concurrency control to prevent race conditions

#### Implementation Priorities
1. **Data model**: Products, categories, customers, carts, cart_items, orders, order_items, inventory with proper constraints
2. **Stock integrity**: Critical - use database transactions with locking. This is likely a key evaluation point
3. **Kafka integration**: Produce order events, implement consumer to update inventory
4. **OpenSearch sync**: Either sync on product changes or via Kafka events. Need to demonstrate search works with typos/filters
5. **Demo flow**: Must clearly show all three services in action

#### Challenges & Gotchas
- **Race conditions**: Two users buying last item simultaneously - PostgreSQL transactions essential
- **Eventual consistency**: OpenSearch may lag slightly; need to show the flow works
- **Local dev complexity**: Need Kafka + OpenSearch running locally or use Aiven (free tier available)
- **Demo clarity**: Must explicitly demonstrate "all three services doing real work" - not just having them configured

#### Recommended Approach
- Use Aiven free tier for all three services (Postgres, Kafka, OpenSearch)
- Implement with transactional patterns
- Add logging/visualization in demo to show Kafka messages flowing
- Use OpenSearch's fuzzy matching for typo tolerance
- Keep credentials in `.env` (never commit)

---

## P2: Gnani Voice Hackathon (Voice Agents)

### Platform Constraints (Universal)
| Constraint | Details |
|------------|---------|
| **Platform** | Gnani API Platform only |
| **Connection** | WebSocket streaming only (no telephony/phone numbers) |
| **STT (Required)** | Prisma v3.0 on Gnani API Platform |
| **TTS (Required)** | Timbre v3.0 on Gnani API Platform |
| **LLM/Orchestration** | Open choice (Pipecat, LiveKit, or custom). Hosted end-to-end agent platforms cannot be core loop |
| **Credits** | 5000 per team |
| **Time** | 24 hours |
| **Restrictions** | No voice cloning, no real customer/patient data, no telephony |

### Judging Criteria (100 pts)
| Criterion | Weight | Focus |
|-----------|--------|-------|
| **Live judge test** | 30% | Task success, accuracy on names/numbers, time to first audio (end of caller speech → first agent audio) |
| **Speech-layer depth** | 20% | End-to-end streaming, barge-in handling, endpointing, code-mix, noise handling |
| **Fit for target user** | 20% | User completes task without help on their own device |
| **Innovation** | 10% | Fresh take beyond chatbot-with-voice |
| **Responsible AI & Compliance** | 10% | Must meet baseline rules; breaking rules caps score at 0 |
| **Demo and docs** | 10% | Clear story, working live demo, README a stranger can follow |

**Special recognition:** Best Code-Mix Experience, Lowest Latency, Best Social Impact

### Track 1: PS1 - Healthcare Voice Field Register for ASHA Workers

#### Problem
ASHA workers record pregnancy/newborn/immunization visits on paper/small screens while walking between houses. Goal: speak visit notes in any supported Indic language with English code-mix, get correct structured record + next actions before reaching next house. Must work with household/street noise.

#### Required Features
1. **Voice capture** - Streaming STT handling code-mix and local health terms ("TT injection", "ANC checkup", "IFA goli")
2. **Structured record with read-back** - Fill form (beneficiary ID, visit type, weight, vaccinations due, next visit date). Agent reads form aloud for confirmation; fix mistakes by voice ("no, weight is 2.8 kilo")
3. **Danger-sign escalation** - Detect danger signs from team's cited public health guideline list only. If bleeding in pregnancy/high fever in newborn etc → tell in her language to refer to PHC now, flag record. **No diagnosis or treatment advice.** Missed danger sign costs double.

#### Guardrails
- Synthetic beneficiaries only
- Build danger-sign list from public health guideline, cite in README
- No diagnosis/treatment/dosage advice
- Health data rules apply

#### Evaluation Focus
Field accuracy, correct danger-sign flags (miss = double penalty). Tested with live dictation + background noise.

### Track 2: PS2 - Voice Khata for Kirana Stores

#### Problem
Kirana shopkeepers run credit (udhaar) in paper khata books. Need voice ledger usable mid-sale across counter, fast/code-mixed with numbers/names over street noise.

#### Required Features
1. **Numbers under noise** - Handle "teen sau chaalis", "340", "three-forty" correctly
2. **Ledger logic** - Parse customer, amount, credit/payment, relative dates ("kal", "parso"). Handle corrections ("nahi, 430"). Ask spoken question when two customers share same name (disambiguation)
3. **Spoken answers** - Answer queries like "Aaj kitna udhaar gaya?" or "Ramesh ka total?" within 2 seconds of question ending

#### Guardrails
- Reminders only to customers who opted in, polite, no pressure/threat language
- Ledger data on device or encrypted at rest
- Money rules apply (no lending)

#### Evaluation Focus
Exact amount match, correct credit/payment direction, correction handling. Tested with live entries + noise.

### Universal Responsible AI & Compliance (Must Meet - Breaking = Score 0)
| Rule | Requirement |
|------|-------------|
| **AI disclosure** | Agent must say it's an AI in first turn, in user's language |
| **Data** | Synthetic/consented only. Transcripts encrypted at rest, deleted after judging. DPDP Act applies |
| **Health** | No diagnosis, treatment, or dosage advice. Fixed protocols only |
| **Money** | No lending, no pressure language, opt-in reminders only |
| **Secrets** | API keys out of repo, in `.env` in `.gitignore` |
| **Voices** | No cloning of real person's voice |

### Deliverables
1. Working prototype (hosted link or runnable repo)
2. Public GitHub repo with README covering setup, architecture diagram, Gnani API Platform services used
3. Demo video 2-3 minutes showing live voice session start to finish
4. Pitch deck up to 6 slides

### Technical Considerations

#### Architecture
- **WebSocket client** for streaming audio to/from Gnani
- **Orchestration**: Pipecat is a natural fit (handles VAD, turn-taking, streaming). LiveKit Agents also good. Custom possible but more work in 24h
- **State management**: For Khata, need customer ledger store (could be in-memory/SQLite for demo). For ASHA, visit records structure
- **Intent parsing**: Need robust parsing for code-mix, numbers in multiple formats, relative dates
- **Barge-in**: Critical for "speech-layer depth" scoring - agent must handle interruptions

#### Implementation Priorities
- **Latency first**: Time to first audio is heavily weighted (30% live test). Optimize streaming pipeline
- **Code-mix handling**: Test with Hindi/English mixing, local terms
- **Noise robustness**: May need good VAD/endpointing
- **Error correction flows**: Must handle corrections gracefully (critical for both tracks)
- **Disambiguation** (Khata): When names collide, must ask spoken question

#### Challenges
- **Learning curve**: Gnani API Platform specifics (Prisma v3.0 STT, Timbre v3.0 TTS) - need to understand API quickly
- **Live testing**: Judges will speak live with noise - can't just use pre-recorded clean audio
- **Strict guardrails**: Danger sign escalation must be protocol-based only (no advice). Easy to accidentally cross line
- **Numbers parsing**: Hindi number words + mixed formats need robust handling
- **24hr timeline**: Voice agents are complex; need to scope MVP tightly

---

## Comparative Analysis: P1 vs P2

| Aspect | P1 (Aiven Store) | P2 (Gnani Voice) |
|--------|-------------------|-------------------|
| **Type** | Traditional web app (REST/CRUD + events) | Real-time voice agent (WebSocket streaming) |
| **Complexity** | Moderate - well-understood patterns (e-commerce, eventing) | High - voice AI, streaming, latency-sensitive, domain-specific logic |
| **Learning curve** | Lower if familiar with SQL/Kafka/Search | Higher - need to learn Gnani platform, voice pipeline, handle streaming |
| **Debugging** | Easier (logs, DB queries, API calls) | Harder (audio streaming issues, latency, barge-in bugs) |
| **Demo risk** | More predictable | Higher risk - depends on live voice quality, noise, latency |
| **Time to MVP** | Achievable in hackathon if focused | Tight for 24hrs, especially first time with platform |
| **Uniqueness potential** | Can differentiate with UX/flows | High potential for innovation, especially code-mix handling |
| **Scoring predictability** | Clear checklist of requirements | More subjective (live judge experience) |

---

## Recommendations

### If choosing P1 (Aiven Store)
**Best for:** Teams comfortable with backend systems, event-driven architecture
**Strengths:** Clear requirements, all pieces are standard, easier to debug/demo reliably
**Focus areas:**
- Get Aiven services up early
- Nail stock integrity with transactions (critical)
- Make the Kafka flow visible in demo (show messages)
- Implement good typo-tolerant search in OpenSearch
- Keep demo simple but hit all points

**Suggested stack:** FastAPI/Node.js + PostgreSQL + Kafka + OpenSearch, simple frontend (React/Vue)

### If choosing P2 (Gnani Voice)
**Best for:** Teams interested in voice AI, multilingual/conversational UX, social impact
**Track recommendation:**
- **ASHA (Healthcare)** - Strong social impact angle, clear protocol-based logic, good for "Best Social Impact" recognition. But be very careful about medical advice guardrails
- **Voice Khata** - Maybe more straightforward business logic, numbers parsing is a concrete technical challenge, less risky on medical compliance

**Focus areas:**
- Get Gnani API access first thing (signup, API key, test basic streaming)
- Use Pipecat for orchestration to save time on streaming/turn-taking
- Prioritize latency (time to first audio) and barge-in
- For Khata: build robust number parser for Hindi+English mixed formats
- For ASHA: create explicit danger-sign checklist from public guideline, hardcode protocol responses
- Test with noisy audio early and often

---

## Quick Start Resources
**P1 (Aiven):**
- [Aiven PostgreSQL](https://aiven.io/docs/products/postgresql/get-started)
- [Aiven Kafka](https://aiven.io/docs/products/kafka/get-started)
- [Aiven OpenSearch](https://aiven.io/docs/products/opensearch/get-started)

**P2 (Gnani):**
- Gnani API Platform (as per hackathon instructions)
- Pipecat framework (https://www.pipecat.ai/) - good for WebSocket streaming voice agents
- LiveKit Agents as alternative

---

*Research based on files in /home/kush/Projects/bb1/: 32A7360C-306D-4D31-AED2-AE256DFDC27E.pdf, Gnani Voice Hackathon Problem Statements.pdf, ideas.md*
