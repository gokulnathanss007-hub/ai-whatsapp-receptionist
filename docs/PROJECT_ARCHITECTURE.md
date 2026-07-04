# PROJECT_ARCHITECTURE.md — Backend Architecture (MVP)

End-to-end architecture for the WhatsApp-inbound MVP. Aligned with the wider Medixum /
Clinic Growth Engine stack so this MVP slots into the existing repo rather than forking it.

---

## 1. High-level diagram

```
Patient
  │  sends WhatsApp message
  ▼
WhatsApp Business Platform (Meta Cloud API)
  │  webhook POST  (message received)
  ▼
Next.js App Router — /api/webhooks/whatsapp  (Vercel)
  │  1. verify signature   2. dedupe on message.id   3. enqueue   4. return 200 fast
  ▼
Trigger.dev v4 task — reply pipeline (idempotent, keyed by message.id)
  │
  ├─ resolve clinic (phone_number_id → clinic_id)
  ├─ load conversation + state (Supabase)
  ├─ load clinic knowledge (cached prefix)
  ├─ build messages (system prompt + knowledge + recent history + new turn)
  ├─ call GPT-5 nano  (automatic prompt caching on the static prefix)
  ├─ parse JSON output (reply, intent, collected, appointment_request, human_handoff)
  ├─ apply safety overrides (fail closed → force handoff if needed)
  ├─ persist: message, updated slots, appointment_request, handoff flag
  └─ send reply via Meta Cloud API (free-form, inside 24h service window)
       │
       ▼
     Patient receives reply
```

---

## 2. Components

### 2.1 Webhook (`/app/api/webhooks/whatsapp/route.ts`)
- **GET** — Meta verification handshake (`hub.challenge`).
- **POST** — receive messages and statuses. Responsibilities, in order:
  1. Verify the `X-Hub-Signature-256` payload signature.
  2. Extract message(s); **dedupe on `message.id`** (idempotency table).
  3. Enqueue a Trigger.dev task per new message.
  4. Return `200` immediately (well within Meta's timeout).
- The webhook does **no** AI work and makes **no** slow calls. Ack fast, process async.

### 2.2 Reply pipeline (Trigger.dev v4 task)
- Idempotent, keyed by `message.id` — safe to retry.
- Orchestrates clinic resolution, prompt build, model call, persistence, and send.
- On any error: send the handoff message and flag staff (fail closed), then rethrow for
  observability (the retry stays idempotent).

### 2.3 AI layer (`/lib/ai`)
- **Prompt builder** — puts the static prefix + clinic knowledge first (so automatic
  caching applies), then trimmed history + new message.
- **OpenAI client** — calls `gpt-5-nano` (Chat Completions or Responses API) at low/minimal
  reasoning effort, with Structured Outputs (JSON schema) enforcing the reply contract.
- **Output parser** — strictly parses the JSON contract; rejects malformed output → handoff.

### 2.4 WhatsApp layer (`/lib/whatsapp`)
- **Signature verify**, **send message** (free-form session message), typed payloads.
- Replies are sent inside the 24-hour customer-service window, so **no template** is needed
  (cost = GPT-5 nano tokens only). If a conversation goes cold (>24h) and the clinic wants to
  re-engage, that's an outbound/template concern — out of scope for this MVP.

### 2.5 Knowledge layer (`/lib/knowledge`)
- Loads and renders the clinic knowledge block; keyed by `clinic_id` + `knowledge_version`
  for caching. See `KNOWLEDGE_STRUCTURE.md`.

### 2.6 Data layer (`/lib/supabase`)
- Typed Supabase client and queries for clinics, conversations, messages, appointment
  requests, and idempotency.

---

## 3. Data model (Supabase / Postgres)

Reuses the existing `clinics` table; adds the conversation and request tables. (Knowledge
tables are defined in `KNOWLEDGE_STRUCTURE.md`.)

```
clinic_whatsapp_numbers
  id, clinic_id (fk), phone_number_id, display_number

patients                       -- a.k.a. leads
  id (uuid, pk)
  clinic_id (fk)
  wa_phone                     -- patient WhatsApp number
  name
  first_seen_at, last_seen_at
  UNIQUE (clinic_id, wa_phone)

conversations
  id (uuid, pk)
  clinic_id (fk)
  patient_id (fk)
  stage                        -- greeting|qualifying|booking|faq|followup|handoff|closed
  collected_slots (jsonb)      -- accumulated details
  human_handoff (boolean)
  handoff_reason
  last_message_at
  created_at

messages
  id (uuid, pk)
  conversation_id (fk)
  wa_message_id                -- Meta message id (idempotency)
  direction                    -- inbound|outbound
  body
  intent                       -- for inbound/AI-classified
  created_at
  UNIQUE (wa_message_id)

appointment_requests
  id (uuid, pk)
  clinic_id (fk)
  patient_id (fk)
  conversation_id (fk)
  name, mobile
  preferred_doctor
  preferred_date, preferred_time
  reason
  status                       -- requested|confirmed|cancelled|rescheduled
  created_at

processed_events               -- idempotency guard
  wa_message_id (pk)
  processed_at
```

Notes:
- `messages.wa_message_id` unique + `processed_events` give double idempotency.
- `conversations.collected_slots` is the running state the pipeline updates each turn.
- `appointment_requests.status` defaults to `requested`; staff move it forward.

---

## 4. Session & the 24-hour window

- Inbound-first MVP means every reply is a response to a recent patient message → inside the
  24h customer-service window → **free-form messages allowed, no paid template.**
- A `whatsapp_sessions`-style concept (aligned with existing CGE) can track window expiry per
  patient if needed, but the MVP's reactive nature keeps this simple: if the patient just
  messaged, the window is open.

---

## 5. AI orchestration detail

1. Trim history to the last N turns (cost + relevance).
2. Build the message array:
   - `system` = static prompt + clinic knowledge (**cached prefix**).
   - conversation turns (user/assistant) as history.
   - new inbound message as the latest user turn.
3. Call `gpt-5-nano` (low/minimal reasoning effort) with Structured Outputs / JSON-only
   output per the prompt contract.
4. Parse. If parse fails or output is off-contract → **fail closed** (handoff).
5. Apply deterministic safety overrides: independent detection of emergency / medical_advice
   / complaint / billing / refund → force `human_handoff` even if the model didn't.
6. Persist message, merge `collected` into `conversations.collected_slots`, write
   `appointment_request` if present, set handoff flag/reason.
7. Send `reply` via Meta.

---

## 6. Idempotency & reliability

- Dedupe at the webhook (`processed_events` / `messages.wa_message_id`).
- Trigger.dev tasks keyed by `message.id`; retries re-run safely (no duplicate sends, no
  duplicate requests).
- Sends are guarded: check whether a reply for this inbound `message.id` was already sent.

---

## 7. Security & privacy

- Verify every webhook via `X-Hub-Signature-256`.
- Secrets in env only: `OPENAI_API_KEY`, Meta token & app secret, Supabase keys.
- Store the minimum PII needed (name, WhatsApp number, appointment details).
- Row-level isolation per `clinic_id`; a clinic can only ever see its own data.
- No clinical data is generated or stored by the AI (it never diagnoses/prescribes).

---

## 8. Observability

- Log `wa_message_id`, resolved `clinic_id`, detected `intent`, and `handoff_reason`.
- Metrics: first-response latency, AI-containment rate, enquiry→request conversion,
  handoff rate by reason.
- Alert on: signature failures, model parse-failure rate, send failures.

---

## 9. Deployment

- **Vercel** hosts the Next.js app and the webhook route.
- **Trigger.dev v4** runs the reply pipeline.
- **Supabase** is the database.
- **Meta Cloud API** (direct) is the messaging channel; the clinic's number maps to the
  shared webhook.
- **OpenAI** provides the AI model (`gpt-5-nano`).
- Required env: `OPENAI_API_KEY`, `META_WHATSAPP_TOKEN`, `META_APP_SECRET`,
  `META_VERIFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_*`.

---

## 10. Relationship to the wider CGE

This MVP is the **inbound WhatsApp receptionist**. The broader Clinic Growth Engine adds
Exotel missed-call recovery, voice callbacks, and outbound templates. Those share the same
`clinics` table and Supabase project, so this MVP is designed as a module of CGE, not a
separate product — the missed-call and voice layers can be added later without reworking
this pipeline.
