# DEVELOPMENT_ROADMAP.md — Development Roadmap

Phased plan. MVP first, everything else later. Each phase has a goal, scope, and a
definition of done. This is a design-stage roadmap — no application code is written until
Phase 1 build begins.

---

## Phase 0 — Design & Foundations (this deliverable)

**Goal:** A complete, engineer-ready product and architecture spec.

**Scope**
- Product vision, PRD, behavioural spec, conversation flows, intents.
- System prompt, FAQ schema, knowledge structure, architecture.
- Confirm alignment with existing CGE stack (Next.js/Vercel, Supabase, Meta Cloud API
  direct, GPT-5 nano, Trigger.dev v4).

**Done when:** all ten documents exist and are internally consistent. ✅ (this set)

---

## Phase 1 — MVP: WhatsApp Inbound Receptionist

**Goal:** One clinic live. Patients message; the AI receptionist answers, qualifies,
captures appointment requests, and hands off — safely.

**Scope**
1. **Data:** create Supabase tables (clinics extended, clinic_whatsapp_numbers,
   clinic_doctors, clinic_services, clinic_faqs, patients, conversations, messages,
   appointment_requests, processed_events).
2. **Webhook:** `/api/webhooks/whatsapp` — GET verify, POST receive, signature check,
   dedupe, enqueue, fast 200.
3. **Reply pipeline (Trigger.dev v4):** clinic resolution → knowledge load → prompt build →
   GPT-5 nano call → JSON parse → safety overrides → persist → send.
4. **AI layer:** prompt builder with prompt caching; strict JSON output parser.
5. **Knowledge loader:** render clinic knowledge block; version-keyed cache.
6. **Safety:** deterministic handoff detection (emergency/medical/complaint/billing/refund)
   + fail-closed on parse errors.
7. **Seed one clinic** (real pilot) via records only — no code changes.

**Explicitly out of scope in Phase 1**
- Multilingual, dashboard, appointment confirmation loop, reminders, missed-call/voice.

**Definition of done**
- A real patient WhatsApp thread runs end-to-end: greeting → FAQ → qualification →
  appointment request recorded → correct handoff on a medical/complaint message.
- Replies are on-spec (short, warm, never diagnosing/inventing) on a staff-reviewed sample.
- First-response latency within a few seconds; pipeline idempotent under retry.

---

## Phase 2 — Language & Confirmation

**Goal:** Fit the local market and close the appointment loop.

**Scope**
- **Tamil / Tanglish support** — knowledge `locale`, prompt language handling, per-clinic
  language setting. (Architecture already allows this; now enable it.)
- **Appointment confirmation loop** — staff confirm from a simple view; patient gets a
  confirmation message. Optional `auto_confirm_enabled` path for clinics that want it.
- **Basic clinic view** — read-only list of conversations, appointment requests, and
  handoffs for staff.

**Done when:** a clinic can operate in Tamil/Tanglish and confirm requests, and staff can
see enquiries and handoffs in one place.

---

## Phase 3 — Clinic Dashboard & Analytics

**Goal:** Make the value visible and the clinic self-serve.

**Scope**
- Clinic dashboard: conversations, appointment requests, handoff queue, edit FAQs/services
  (no-code knowledge editing → bumps `knowledge_version`).
- Metrics: enquiry→request conversion, response latency, AI-containment rate, handoff
  reasons.
- Self-serve onboarding of clinic knowledge.

**Done when:** a clinic can be onboarded and managed without engineering involvement, and
the owner can see conversion and workload impact.

---

## Phase 4 — Lifecycle & Reminders

**Goal:** Reduce no-shows and reactivate patients (moves toward full CGE value).

**Scope**
- Appointment reminders (outbound templates, respecting policy/opt-in).
- Follow-up nudges and reactivation for lapsed enquiries.
- Feedback capture post-consultation.

**Done when:** reminders measurably reduce no-shows for a pilot clinic.

---

## Phase 5 — Merge into the full Clinic Growth Engine

**Goal:** Unify with the broader CGE.

**Scope**
- Add Exotel missed-call recovery and voice callbacks on the shared `clinics`/Supabase base.
- One patient timeline across WhatsApp + missed-call + voice.
- Cross-channel handoff and analytics.

**Done when:** the WhatsApp receptionist and missed-call/voice recovery operate as one
product on one data model.

---

## Sequencing principles

- **Safety before scale.** The handoff and fail-closed behaviour ship in Phase 1 and are
  never traded away for features.
- **No-code onboarding is a Phase-1 property**, not a later add-on — it's how you onboard
  pilots fast.
- **Cost discipline throughout:** inbound-only + free-form session replies + prompt caching
  keep per-clinic cost low; revisit only if usage patterns change.
- **Each phase is shippable** on its own; the pilot clinic can stay live and improve.
