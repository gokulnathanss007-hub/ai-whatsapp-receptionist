# CLAUDE.md — School Parent Enquiry AI (K-12 School WhatsApp MVP)

> This file is the north-star for anyone (human or AI) working in this repository.
> Read it before writing a single line of code. If a change contradicts this file,
> update this file first, then change the code.

---

## 1. Product Vision

School Parent Enquiry AI is a **WhatsApp AI Parent Enquiry System for K-12 schools**.

It is **not** a generic chatbot. It behaves like an experienced, well-trained school
front office executive who understands admissions and parent-facing school workflows.
Its job is to answer parent enquiries, qualify admission leads, and convert WhatsApp
enquiries into booked school visits / admission counseling sessions — while never
behaving like a general-purpose AI assistant.

**One-line pitch:** Every enquiry a school misses on WhatsApp is a lost admission.
School Parent Enquiry AI answers every one, instantly, in the voice of a premium
school front office.

### What "success" means for the MVP
- A parent messages the school's WhatsApp number.
- The front office AI replies within seconds, warm and human.
- Common questions (fees, timings, transport, holidays, facilities) are answered
  without staff.
- Enquiries are qualified and turned into **admission enquiries / visit requests**
  recorded for staff.
- Anything sensitive, urgent, or unknown is **handed off to a human**, cleanly.

---

## 2. Scope (MVP)

**In scope**
- Inbound WhatsApp conversations only (parent always messages first).
- Single vertical: K-12 school admissions and parent front-office enquiries.
- English language only (architecture must not block multilingual later).
- FAQ answering, lead qualification, admission-enquiry/visit capture, human handoff.

**Out of scope (this MVP)**
- Missed-call recovery / voice / Exotel (belongs to the wider CGE, not this MVP).
- Outbound campaigns and marketing broadcasts.
- Payment collection inside chat.
- Automatic admission *confirmation* (we record *enquiries/requests*; staff confirm).
- Guaranteeing admission outcomes, seats, or fee waivers — permanently out of scope.

---

## 3. AI Behaviour (the rules that matter most)

The system prompt is the product. See `prompts/system_prompt.md` (mirrored at
`docs/03-engineering/SYSTEM_PROMPT.md`) for the production version and
`docs/03-engineering/AI_RECEPTIONIST_SPEC.md` for the full behavioural contract. The
non-negotiables:

**The front office AI always:**
- Sounds warm, professional, calm, helpful, human, and **short** (2–3 sentences).
- Stays strictly inside school context.
- Collects parent/child information before offering visit slots (lead qualification).
- Records admission enquiries / visit *requests* and tells the parent staff will confirm.
- Hands off to a human the moment a message is a sensitive matter (custody, bullying,
  abuse, legal), a complaint, a billing issue, a refund, an urgent safety concern, or
  something it cannot answer.

**The front office AI never:**
- Promises or guarantees admission, a seat, or a specific fee waiver.
- Invents information (fees, staff, timings, transport routes, availability) not in
  school knowledge.
- Gives legal or safeguarding advice.
- Reveals that it is an AI, or behaves like ChatGPT (no coding, math, politics, history,
  general knowledge, or off-topic chat).

When unsure, the only correct behaviour is: **"I'll connect you with our school office."**

---

## 4. Architecture (overview)

Full detail in `docs/03-engineering/PROJECT_ARCHITECTURE.md`. The request lifecycle:

```
Parent
  ↓  (WhatsApp message)
WhatsApp Business Platform (Meta Cloud API)
  ↓  (webhook POST)
Next.js App Router API route  →  returns 200 immediately (ack)
  ↓  (enqueue)
Trigger.dev v4 task
  ├─ load school + conversation state (Supabase)
  ├─ build prompt (cached system prompt + school knowledge + history)
  ├─ call GPT-5 nano
  ├─ persist message + any admission_enquiry / handoff flag
  └─ send reply via Meta Cloud API (free-form, inside 24h service window)
```

**Stack**
- **Backend:** Next.js (App Router) on Vercel.
- **Messaging:** Meta WhatsApp Business Cloud API, **direct** (no BSP markup; full control).
- **AI:** **GPT-5 nano** (OpenAI, model id `gpt-5-nano`) for reply generation. OpenAI
  **automatic prompt caching** discounts the static system prompt + school knowledge block
  when it's kept at the start of the prompt (highest-leverage cost lever). Use low/minimal
  reasoning effort to keep the front office AI fast and cheap.
- **Data:** Supabase (Postgres).
- **Async/reliability:** Trigger.dev v4 (idempotent tasks keyed by WhatsApp message id).

**Why these choices**
- Inbound replies land inside WhatsApp's 24-hour customer-service window, so we send
  **free-form session messages — no paid template needed** for replies. Cost is GPT-5 nano
  tokens only.
- Direct Cloud API keeps per-school cost low and full control of the pipeline.
- Multi-tenant from day one: school-specific data lives in the database, never in code.

---

## 5. Prompt Engineering Principles

1. **One system prompt, injected knowledge.** The behavioural prompt is static and
   cached. School-specific facts are injected as a structured knowledge block. Adding a
   school never means editing the prompt. See `docs/03-engineering/KNOWLEDGE_STRUCTURE.md`.
2. **Cache the stable, vary the dynamic.** Keep the system prompt + school knowledge at the
   **start** of the prompt so OpenAI's automatic prompt caching kicks in; only the recent
   conversation turns vary per request. (Caching is automatic for prompts over ~1K tokens —
   no explicit cache breakpoints, unlike some other providers. Order is what matters.)
3. **Guardrails live in the prompt AND in code.** The prompt refuses; code also detects
   escalation intents and sets a `human_handoff` flag. Never rely on the model alone for
   safety-critical routing.
4. **Structured output where it matters.** The model returns the parent-facing reply
   plus lightweight structured signals (intent, collected slots, handoff boolean,
   enquiry_request payload) so the backend can act deterministically.
5. **Short by construction.** Length limits are stated in the prompt and enforced by
   review; a front office AI that writes paragraphs is a bug.
6. **Never invent.** If a fact isn't in the injected knowledge block, the model must say
   it will check with the school office — not guess.

---

## 6. Folder Conventions

```
/app
  /api/webhooks/whatsapp/route.ts   # GET verify + POST receive (ack fast, enqueue)
/lib
  /ai/                              # prompt builder, OpenAI client, output parser
  /whatsapp/                        # send message, verify signature, types
  /supabase/                        # typed client + queries
  /knowledge/                       # school knowledge loader + validators
/trigger/                           # Trigger.dev v4 tasks (reply pipeline)
/prompts/system_prompt.md           # source of truth, mirrors docs/03-engineering/SYSTEM_PROMPT.md
/docs/                              # these design documents
```

Rules:
- No school data hardcoded anywhere under `/app`, `/lib`, or `/trigger`.
- Every external call (Meta, OpenAI) is wrapped in a `/lib` module — no inline fetches
  in route handlers or tasks.
- Types are shared; the AI output parser and the DB layer agree on one schema
  (`lib/types.ts`).

---

## 7. Coding Standards

- **TypeScript strict.** No `any` in domain code; parse external payloads at the boundary.
- **Idempotency everywhere.** Dedupe on WhatsApp `message.id`; Trigger.dev tasks are safe
  to retry.
- **Fail closed on safety.** If reply generation errors or is ambiguous, send the handoff
  message and flag for staff — never send an unreviewed guess about a sensitive topic.
- **Fast webhook.** The POST handler validates the signature, dedupes, enqueues, and
  returns 200 in well under Meta's timeout. All real work happens in the task.
- **Secrets in env.** `OPENAI_API_KEY`, Meta tokens, Supabase keys — never committed.
- **Logs are conversations' friend.** Log message ids, intents, and handoff reasons; never
  log full parent/child PII in plaintext beyond what the DB already holds.

---

## 8. Domain Model (quick reference)

The database uses school-domain table/column names (see
`supabase/migrations/0012_rename_clinic_to_school.sql` and
`docs/04-reference/DATABASE_SCHEMA.md`):

| Concept | Table |
|---|---|
| School (tenant) | `schools` |
| School staff | `school_staff` |
| Programs/grades offered | `school_services` |
| School FAQ | `school_faqs` |
| Parent | `parents` |
| Admission enquiry / visit request | `admission_enquiries` |
| Calendar-confirmed visit booking | `appointments` |
| Google Calendar connection | `school_google_accounts` |

Main WhatsApp menu (see `lib/decision-engine/mainMenu.ts`): Admission Enquiry, Fee
Structure, School Timings, Transport, Holidays & Events, Facilities, Contact School
Office, Certificates, School Location, Ask Anything — each FAQ-style item maps 1:1 to a
`school_faqs.category` value.

---

## 9. Future Roadmap (pointer)

Detailed phases in `docs/02-product/PRODUCT_ROADMAP.md`. Direction of travel:
- **MVP:** English, WhatsApp-inbound, FAQ + qualification + admission-enquiry + handoff.
- **Next:** Tamil / Tanglish support, school dashboard, admission confirmation loop.
- **Later:** Reminders & follow-ups, reactivation, integration with the wider CGE
  missed-call recovery and voice layers.

---

## 10. Companion Documents

| File | Purpose |
|---|---|
| `docs/README.md` | Full documentation index (start here for anything not covered above). |
| `docs/02-product/PRODUCT_REQUIREMENTS.md` | Full product specification (historical V1 PRD). |
| `docs/03-engineering/AI_RECEPTIONIST_SPEC.md` | Behavioural contract for the front office AI. |
| `docs/02-product/CONVERSATION_FLOWS.md` | Every conversation flow with examples. |
| `docs/FAQ_SCHEMA.json` | Structured, per-school FAQ format. |
| `docs/02-product/INTENTS.md` | All supported user intents and slots. |
| `docs/03-engineering/SYSTEM_PROMPT.md` | Production system prompt (mirror). |
| `docs/03-engineering/KNOWLEDGE_STRUCTURE.md` | How each school's data is stored (no-code onboarding). |
| `docs/03-engineering/PROJECT_ARCHITECTURE.md` | End-to-end backend architecture. |
| `docs/02-product/PRODUCT_ROADMAP.md` | Phased implementation plan. |
