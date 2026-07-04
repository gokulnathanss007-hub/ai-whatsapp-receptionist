# CLAUDE.md — Medixum AI WhatsApp Receptionist (Dermatology & Cosmetology MVP)

> This file is the north-star for anyone (human or AI) working in this repository.
> Read it before writing a single line of code. If a change contradicts this file,
> update this file first, then change the code.

---

## 1. Product Vision

Medixum AI is a **WhatsApp AI Receptionist for dermatology and cosmetology clinics**.

It is **not** a generic chatbot. It behaves like an experienced, well-trained clinic
receptionist who understands dermatology and cosmetic-practice workflows. Its job is to
answer patient enquiries, qualify leads, and convert WhatsApp enquiries into booked
consultations — while never behaving like a general-purpose AI assistant.

**One-line pitch:** Every enquiry a clinic misses on WhatsApp is a lost consultation.
Medixum AI answers every one, instantly, in the voice of a premium front desk.

### What "success" means for the MVP
- A patient messages the clinic's WhatsApp number.
- The receptionist replies within seconds, warm and human.
- Common questions (fees, timings, location, treatments) are answered without staff.
- Enquiries are qualified and turned into **appointment requests** recorded for staff.
- Anything medical, sensitive, or unknown is **handed off to a human**, cleanly.

---

## 2. Scope (MVP)

**In scope**
- Inbound WhatsApp conversations only (patient always messages first).
- Single vertical: dermatology & cosmetology.
- English language only (architecture must not block multilingual later).
- FAQ answering, lead qualification, appointment-request capture, human handoff.

**Out of scope (this MVP)**
- Missed-call recovery / voice / Exotel (belongs to the wider CGE, not this MVP).
- Outbound campaigns and marketing broadcasts.
- Payment collection inside chat.
- Automatic appointment *confirmation* (we record *requests*; staff confirm).
- Diagnosis, prescriptions, or any clinical decision-making — permanently out of scope.

---

## 3. AI Behaviour (the rules that matter most)

The system prompt is the product. See `SYSTEM_PROMPT.md` for the production version and
`AI_RECEPTIONIST_SPEC.md` for the full behavioural contract. The non-negotiables:

**The receptionist always:**
- Sounds warm, professional, calm, helpful, human, and **short** (2–3 sentences).
- Stays strictly inside clinic context.
- Collects patient information before offering slots (lead qualification).
- Records appointment *requests* and tells the patient staff will confirm.
- Hands off to a human the moment a message is medical, a complaint, billing/refund,
  emergency, legal, or something it cannot answer.

**The receptionist never:**
- Diagnoses a condition or interprets symptoms.
- Prescribes medicines or recommends specific drugs/dosages.
- Promises or guarantees results or outcomes.
- Gives emergency advice.
- Invents information (fees, doctors, timings, availability) not in clinic knowledge.
- Reveals that it is an AI, or behaves like ChatGPT (no coding, math, politics, history,
  general knowledge, or off-topic chat).

When unsure, the only correct behaviour is: **"I'll connect you with our clinic staff."**

---

## 4. Architecture (overview)

Full detail in `PROJECT_ARCHITECTURE.md`. The request lifecycle:

```
Patient
  ↓  (WhatsApp message)
WhatsApp Business Platform (Meta Cloud API)
  ↓  (webhook POST)
Next.js App Router API route  →  returns 200 immediately (ack)
  ↓  (enqueue)
Trigger.dev v4 task
  ├─ load clinic + conversation state (Supabase)
  ├─ build prompt (cached system prompt + clinic knowledge + history)
  ├─ call GPT-5 nano
  ├─ persist message + any appointment_request / handoff flag
  └─ send reply via Meta Cloud API (free-form, inside 24h service window)
```

**Stack**
- **Backend:** Next.js (App Router) on Vercel.
- **Messaging:** Meta WhatsApp Business Cloud API, **direct** (no BSP markup; full control).
- **AI:** **GPT-5 nano** (OpenAI, model id `gpt-5-nano`) for reply generation. OpenAI
  **automatic prompt caching** discounts the static system prompt + clinic knowledge block
  when it's kept at the start of the prompt (highest-leverage cost lever). Use low/minimal
  reasoning effort to keep the receptionist fast and cheap.
- **Data:** Supabase (Postgres).
- **Async/reliability:** Trigger.dev v4 (idempotent tasks keyed by WhatsApp message id).

**Why these choices**
- Inbound replies land inside WhatsApp's 24-hour customer-service window, so we send
  **free-form session messages — no paid template needed** for replies. Cost is GPT-5 nano
  tokens only.
- Direct Cloud API keeps per-clinic cost low and full control of the pipeline.
- Multi-tenant from day one: clinic-specific data lives in the database, never in code.

---

## 5. Prompt Engineering Principles

1. **One system prompt, injected knowledge.** The behavioural prompt is static and
   cached. Clinic-specific facts are injected as a structured knowledge block. Adding a
   clinic never means editing the prompt. See `KNOWLEDGE_STRUCTURE.md`.
2. **Cache the stable, vary the dynamic.** Keep the system prompt + clinic knowledge at the
   **start** of the prompt so OpenAI's automatic prompt caching kicks in; only the recent
   conversation turns vary per request. (Caching is automatic for prompts over ~1K tokens —
   no explicit cache breakpoints, unlike some other providers. Order is what matters.)
3. **Guardrails live in the prompt AND in code.** The prompt refuses; code also detects
   escalation intents and sets a `human_handoff` flag. Never rely on the model alone for
   safety-critical routing.
4. **Structured output where it matters.** The model returns the patient-facing reply
   plus lightweight structured signals (intent, collected slots, handoff boolean,
   appointment_request payload) so the backend can act deterministically.
5. **Short by construction.** Length limits are stated in the prompt and enforced by
   review; a receptionist who writes paragraphs is a bug.
6. **Never invent.** If a fact isn't in the injected knowledge block, the model must say
   it will check with staff — not guess.

---

## 6. Folder Conventions

```
/app
  /api/webhooks/whatsapp/route.ts   # GET verify + POST receive (ack fast, enqueue)
/lib
  /ai/                              # prompt builder, OpenAI client, output parser
  /whatsapp/                        # send message, verify signature, types
  /supabase/                        # typed client + queries
  /knowledge/                       # clinic knowledge loader + validators
/trigger/                           # Trigger.dev v4 tasks (reply pipeline)
/prompts/system_prompt.md           # source of truth, mirrors SYSTEM_PROMPT.md
/docs/                              # these design documents
```

Rules:
- No clinic data hardcoded anywhere under `/app`, `/lib`, or `/trigger`.
- Every external call (Meta, OpenAI) is wrapped in a `/lib` module — no inline fetches
  in route handlers or tasks.
- Types are shared; the AI output parser and the DB layer agree on one schema.

---

## 7. Coding Standards

- **TypeScript strict.** No `any` in domain code; parse external payloads at the boundary.
- **Idempotency everywhere.** Dedupe on WhatsApp `message.id`; Trigger.dev tasks are safe
  to retry.
- **Fail closed on safety.** If reply generation errors or is ambiguous, send the handoff
  message and flag for staff — never send an unreviewed guess about medical content.
- **Fast webhook.** The POST handler validates the signature, dedupes, enqueues, and
  returns 200 in well under Meta's timeout. All real work happens in the task.
- **Secrets in env.** `OPENAI_API_KEY`, Meta tokens, Supabase keys — never committed.
- **Logs are conversations' friend.** Log message ids, intents, and handoff reasons; never
  log full patient PII in plaintext beyond what the DB already holds.

---

## 8. Future Roadmap (pointer)

Detailed phases in `DEVELOPMENT_ROADMAP.md`. Direction of travel:
- **MVP:** English, WhatsApp-inbound, FAQ + qualification + appointment-request + handoff.
- **Next:** Tamil / Tanglish support, clinic dashboard, appointment confirmation loop.
- **Later:** Reminders & follow-ups, reactivation, integration with the wider CGE
  missed-call recovery and voice layers.

---

## 9. Companion Documents

| File | Purpose |
|---|---|
| `PRODUCT_REQUIREMENTS.md` | Full product specification (the PRD). |
| `AI_RECEPTIONIST_SPEC.md` | Behavioural contract for the receptionist. |
| `CONVERSATION_FLOWS.md` | Every conversation flow with examples. |
| `FAQ_SCHEMA.json` | Structured, per-clinic FAQ format. |
| `INTENTS.md` | All supported user intents and slots. |
| `SYSTEM_PROMPT.md` | Production system prompt. |
| `KNOWLEDGE_STRUCTURE.md` | How each clinic's data is stored (no-code onboarding). |
| `PROJECT_ARCHITECTURE.md` | End-to-end backend architecture. |
| `DEVELOPMENT_ROADMAP.md` | Phased implementation plan. |
