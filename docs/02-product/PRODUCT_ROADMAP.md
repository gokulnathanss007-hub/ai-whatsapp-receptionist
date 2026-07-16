# PRODUCT_ROADMAP.md — Version Roadmap (V1 → V4)

> Owns the version-by-version scope of the platform. Feature detail: `FEATURES.md`.
> Shipping bars: `ACCEPTANCE_CRITERIA.md`. Engineering sequencing for V1 is preserved
> in Part B below (formerly `docs/DEVELOPMENT_ROADMAP.md` — kept in full; the phase
> structure remains the execution template for every later version).

---

## Part A — Platform versions

### Version 1 — AI WhatsApp Receptionist ✅ (live)

The inbound WhatsApp receptionist for dermatology & cosmetology clinics.

- FAQ answering, lead qualification, appointment-request capture, human handoff —
  safety rails (fail closed) from day one.
- **Google Calendar integration shipped inside V1** (`[CHANGED]` vs the original MVP
  scope, which deferred confirmation): OAuth per clinic, real availability, race-safe
  auto-confirmed booking for `auto_confirm_enabled` clinics; free-text request flow
  remains the fallback.
- Multi-tenant, no-code onboarding; English; single vertical.

### Version 2 — Clinic Growth System

Turns the receptionist into a growth engine. Modules:

1. **Interactive WhatsApp Experience** — reply buttons, list messages, location, media,
   templates (`../03-engineering/INTERACTIVE_WHATSAPP.md`). Requires the Decision Engine
   generalisation (`../03-engineering/DECISION_ENGINE.md`).
2. **Appointment Management** — closed loop: reminders (T-24h/T-2h templates),
   in-thread cancel/reschedule executed by the AI, staff confirmation view.
3. **Missed Call Recovery** — telephony webhook (Exotel provider seam) → instant
   WhatsApp outreach → normal receptionist flow.
4. **Review Automation** — post-visit review requests with unhappy-path diversion.
5. **Tamil / Tanglish support** — knowledge `locale`, per-clinic language setting
   (architecture already allows; now enabled).
6. **Basic clinic view** — read-only conversations/requests/handoff queue for staff.

### Version 3 — AI Voice Receptionist

The clinic's phone answers itself.

- Voice provider seam (STT/TTS/telephony); same brain — intents, knowledge, booking,
  safety — as WhatsApp; voice-grade latency work.
- One patient timeline across voice + WhatsApp + missed-call.
- Warm-transfer escalation to staff; WhatsApp follow-up after every call.
- Safety parity: voice never gets looser rules than chat (CLAUDE.md §8).

### Version 4 — Complete Clinic Growth Platform

- **Dashboard** — conversations, bookings, handoff queue, self-serve knowledge editing
  (bumps `knowledge_version`); requires the real auth system (retires
  `ADMIN_SETUP_TOKEN` stopgap).
- **Analytics** — conversion funnel, containment, ROI reporting per clinic.
- **Patient Reactivation** — lapsed-patient win-back campaigns (opt-in templates).
- **Follow-up Automation** — post-consultation care nudges, next-session scheduling.
- **Multi-clinic Management** — `organizations → clinics`; owner-level rollups.

---

## Part B — V1 engineering phase plan (preserved from DEVELOPMENT_ROADMAP.md v1)

The phase discipline below shipped V1 and is the template for all future versions:
each phase has a goal, scope, and definition of done; each is shippable on its own.

### Phase 0 — Design & Foundations ✅
Complete engineer-ready product and architecture spec (the ten original documents,
now reorganised into this docs tree). Stack alignment confirmed: Next.js/Vercel,
Supabase, Meta Cloud API direct, GPT-5 nano, Trigger.dev v4.

### Phase 1 — MVP: WhatsApp Inbound Receptionist ✅
1. Data: Supabase tables (clinics extended, clinic_whatsapp_numbers, clinic_doctors,
   clinic_services, clinic_faqs, patients, conversations, messages,
   appointment_requests, processed_events).
2. Webhook: `/api/webhooks/whatsapp` — GET verify, POST receive, signature check,
   dedupe, enqueue, fast 200.
3. Reply pipeline (Trigger.dev v4): clinic resolution → knowledge load → prompt build →
   GPT-5 nano call → JSON parse → safety overrides → persist → send.
4. AI layer: prompt builder with prompt caching; strict JSON output parser.
5. Knowledge loader: version-keyed cache.
6. Safety: deterministic handoff detection + fail-closed on parse errors.
7. Seed one clinic (real pilot) via records only.

**DoD (met):** real patient thread end-to-end (greeting → FAQ → qualification → request
recorded → correct handoff on medical/complaint); replies on-spec on staff review;
first-response latency seconds; pipeline idempotent under retry.

*Post-Phase-1 addition (implemented):* Google Calendar scheduling, Phases 1–5 of
`../03-engineering/GOOGLE_CALENDAR_INTEGRATION.md` — OAuth, availability, race-protected
booking, AI wiring, opening-hours single source of truth.

### Phase 2 — Language & Confirmation → folds into **V2**
Tamil/Tanglish; appointment confirmation loop for non-calendar clinics
(`auto_confirm_enabled` path exists); basic clinic view.

### Phase 3 — Clinic Dashboard & Analytics → folds into **V4**
Self-serve dashboard, no-code knowledge editing, conversion/containment metrics.

### Phase 4 — Lifecycle & Reminders → folds into **V2 (reminders/reviews) & V4 (reactivation)**
Outbound templates respecting policy/opt-in; follow-up nudges; feedback capture.

### Phase 5 — Merge into the full CGE → realised as **V2 (missed calls) + V3 (voice)**
Exotel missed-call recovery and voice on the shared clinics/Supabase base; one patient
timeline; cross-channel handoff and analytics.

---

## Sequencing principles (preserved, still binding)

- **Safety before scale.** Handoff and fail-closed behaviour are never traded for features.
- **No-code onboarding is a V1 property**, not a later add-on.
- **Cost discipline throughout:** inbound-first + free-form session replies + prompt
  caching; template/voice costs are priced, not absorbed (`../01-company/REVENUE_MODEL.md`).
- **Each phase is shippable**; pilot clinics stay live and improve.
- **Additive evolution:** every new module lands behind a seam with the old path intact
  (calendar-beside-free-text is the template — CLAUDE.md §2.6).
