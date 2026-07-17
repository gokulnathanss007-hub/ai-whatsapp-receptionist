# FEATURES.md — Feature Catalog

> Authoritative list of every platform feature, its version, and its status.
> Version gating: `PRODUCT_ROADMAP.md`. Shipping bars: `ACCEPTANCE_CRITERIA.md`.
> Statuses: **Live** · **Designed** (doc exists) · **Planned** (roadmap slot only).

---

## Version 1 — AI WhatsApp Receptionist

| Feature | Status | Notes / source of truth |
|---|---|---|
| Inbound WhatsApp AI receptionist | **Live** | Pipeline: `../03-engineering/PROJECT_ARCHITECTURE.md` |
| FAQ answering from clinic knowledge | **Live** | `../03-engineering/KNOWLEDGE_STRUCTURE.md`, `docs/FAQ_SCHEMA.json` |
| Lead qualification (per-concern, one question at a time) | **Live** | `../03-engineering/AI_RECEPTIONIST_SPEC.md` §6 |
| Appointment-request capture (free-text fallback) | **Live** | `CONVERSATION_FLOWS.md` §2 |
| **Google Calendar Integration** — OAuth per clinic, real availability, race-safe auto-booking | **Live** | `../03-engineering/GOOGLE_CALENDAR_INTEGRATION.md` |
| Human handoff with reason codes | **Live** | `INTENTS.md` (reason codes), spec §8 |
| Deterministic safety overrides (fail closed) | **Live** | `lib/ai/safetyOverride.ts`; CLAUDE.md §8 |
| Multi-tenant no-code clinic onboarding | **Live** | CLAUDE.md §7 |
| Durable patient memory (`<patient_info>`, never re-asks) | **Live** | `../03-engineering/SYSTEM_PROMPT.md` |
| Booking timeout sweep / calendar sync retry | **Live** | `trigger/bookingTimeoutSweep.ts` |
| English language | **Live** | Multilingual unblocked by design |

## Version 2 — Clinic Growth System

| Feature | Status | Notes |
|---|---|---|
| **Patient Experience Layer** (was "Interactive WhatsApp") — one action-envelope contract rendered per channel | **Phase 2 Live** | Main Menu on greeting (list / numbered text), deterministic menu-pick answers from clinic knowledge, slot list picker, slot tap → confirm buttons → book, location text, doctor list (>1 doctor), `current_screen` state (0010). Behind `clinics.interactive_enabled` (0009). Media/templates still Designed — `../03-engineering/PATIENT_EXPERIENCE.md` |
| **Decision Engine** — AI returns `{action, screen, data}` envelopes; Node executes | **Step 1 Live** | `lib/decision-engine/` envelope union + v1 translator + WhatsApp channel adapter (migration plan §6 step 1) — `../03-engineering/DECISION_ENGINE.md` |
| **Main Menu** — welcome → tappable menu (Book / Treatments / Fee / Timings / Location / Talk to Receptionist) | Designed | Show/don't-show rules: `../03-engineering/PATIENT_EXPERIENCE.md` §3; next build |
| Rich media treatment flows (image → explanation → book button) | Designed | Needs `clinic_assets` registry — `PATIENT_EXPERIENCE.md` §8 |
| Multi-clinic branding (welcome message, tone, logo, colors) | Designed | Data-only per clinic — `PATIENT_EXPERIENCE.md` §10 |
| **Appointment Management** — reminders (T-24h/T-2h), in-thread cancel/reschedule closed loop | Planned | Extends live cancel/reschedule *capture* into execution |
| **Missed Call Recovery** — telephony webhook → instant WhatsApp outreach | Planned | Exotel provider seam; `PRODUCT.md` §13 |
| **Review Automation** — post-visit review request, unhappy-path diversion | Planned | `PRODUCT.md` §11 |
| Tamil / Tanglish support | Planned | Knowledge `locale` field already in `docs/FAQ_SCHEMA.json` |
| Basic clinic view (read-only queue) | Planned | Precursor to V4 dashboard |
| Template message infrastructure (approval, opt-in, metering) | Planned | Cost class: `../01-company/REVENUE_MODEL.md` |

## Version 3 — AI Voice Receptionist

| Feature | Status | Notes |
|---|---|---|
| AI Voice Receptionist (inbound calls) | Planned | Voice provider seam; same brain as WhatsApp; `PRODUCT.md` §14 |
| Voice ↔ WhatsApp continuity (one patient timeline) | Planned | Cross-channel patient record |
| Warm transfer escalation | Planned | Voice-grade handoff; safety parity with chat |
| Post-call WhatsApp summary/confirmation | Planned | |

## Version 4 — Complete Clinic Growth Platform

| Feature | Status | Notes |
|---|---|---|
| Clinic Dashboard (self-serve knowledge editing, queues) | Planned | Requires real auth (retires `ADMIN_SETUP_TOKEN`); `UI_FLOWS.md` §3 |
| Analytics (funnel, containment, ROI) | Planned | KPI definitions shared with `../01-company/GOALS.md` §4 |
| Patient Reactivation | Planned | Opt-in template campaigns |
| Follow-up Automation | Planned | Post-consultation nudges, next-session scheduling |
| Multi-clinic Management | Planned | `organizations → clinics` parent table (CLAUDE.md §7) |

## Permanent non-features (out of scope forever)

- Diagnosis, prescriptions, symptom interpretation, or any clinical decision-making.
- General-purpose chatbot behaviour (off-topic conversation, revealing AI nature).
- Guaranteeing treatment outcomes.

## Feature-addition rules

1. Every new feature enters this table with a version and a status before build starts.
2. Features land behind seams (provider interfaces, flags) so existing clinic flows are
   untouched (CLAUDE.md §2.6).
3. A feature is **Live** only when it meets its bar in `ACCEPTANCE_CRITERIA.md`.
