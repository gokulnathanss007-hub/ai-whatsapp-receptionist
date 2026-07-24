# FEATURES.md — Feature Catalog

> Authoritative list of every platform feature, its version, and its status.
> Version gating: `PRODUCT_ROADMAP.md`. Shipping bars: `ACCEPTANCE_CRITERIA.md`.
> Statuses: **Live** · **Designed** (doc exists) · **Planned** (roadmap slot only).

---

## Version 1 — AI WhatsApp Parent Enquiry System

| Feature | Status | Notes / source of truth |
|---|---|---|
| Inbound WhatsApp AI front office | **Live** | Pipeline: `../03-engineering/PROJECT_ARCHITECTURE.md` |
| FAQ answering from school knowledge | **Live** | `../03-engineering/KNOWLEDGE_STRUCTURE.md`, `docs/FAQ_SCHEMA.json` |
| Lead qualification (parent + child details, one question at a time) | **Live** | `../03-engineering/AI_RECEPTIONIST_SPEC.md` §6 |
| Admission-enquiry capture (free-text fallback) | **Live** | `CONVERSATION_FLOWS.md` §2 |
| **Google Calendar Integration** — OAuth per school, real availability, race-safe auto-booking | **Live** | `../03-engineering/GOOGLE_CALENDAR_INTEGRATION.md` |
| Human handoff with reason codes | **Live** | `INTENTS.md` (reason codes), spec §8 |
| Deterministic safety overrides (fail closed) | **Live** | `lib/ai/safetyOverride.ts`; `/CLAUDE.md` §3 |
| Multi-tenant no-code school onboarding | **Live** | `/CLAUDE.md` §6 |
| Durable parent memory (`<parent_info>`, never re-asks) | **Live** | `../03-engineering/SYSTEM_PROMPT.md` |
| Booking timeout sweep / calendar sync retry | **Live** | `trigger/bookingTimeoutSweep.ts` |
| English language | **Live** | Multilingual unblocked by design |

## Version 2 — School Growth System

| Feature | Status | Notes |
|---|---|---|
| **Parent Experience Layer** (was "Interactive WhatsApp"; doc kept at `PATIENT_EXPERIENCE.md` as a stable filename) — one action-envelope contract rendered per channel | **Phase 2 Live** | Main Menu on greeting (list / numbered text), deterministic menu-pick answers from school knowledge, slot list picker, slot tap → confirm buttons → book, location text, school programs/grades list (>1 active service), `current_screen` state (0010). Behind `schools.interactive_enabled` (0009). Media/templates still Designed — `../03-engineering/PATIENT_EXPERIENCE.md` |
| **Decision Engine** — AI returns `{action, screen, data}` envelopes; Node executes | **Step 1 Live** | `lib/decision-engine/` envelope union + v1 translator + WhatsApp channel adapter (migration plan §6 step 1) — `../03-engineering/DECISION_ENGINE.md` |
| **Main Menu** — welcome → tappable menu (Admission Enquiry / Fee Structure / School Timings / Transport / Holidays & Events / Facilities / Contact School Office / Certificates / School Location / Ask Anything) | **Live** | Show/don't-show rules: `../03-engineering/PATIENT_EXPERIENCE.md` §3 |
| Rich media flows (image → explanation → enquire button) | Designed | Needs `school_assets` registry — `PATIENT_EXPERIENCE.md` §8 |
| Multi-school branding (welcome message, tone, logo, colors) | Designed | Data-only per school — `PATIENT_EXPERIENCE.md` §10 |
| **Visit Management** — reminders (T-24h/T-2h), in-thread cancel/reschedule closed loop | Planned | Extends live cancel/reschedule *capture* into execution |
| **Missed Call Recovery** — telephony webhook → instant WhatsApp outreach | Planned | Exotel provider seam; `PRODUCT.md` §13 |
| **Review Automation** — post-visit review request, unhappy-path diversion | Planned | `PRODUCT.md` §11 |
| Tamil / Tanglish support | Planned | Knowledge `locale` field already in `docs/FAQ_SCHEMA.json` |
| Basic school view (read-only queue) | Planned | Precursor to V4 dashboard |
| Template message infrastructure (approval, opt-in, metering) | Planned | Cost class: `../01-company/REVENUE_MODEL.md` |

## Version 3 — AI Voice Front Office

| Feature | Status | Notes |
|---|---|---|
| AI Voice Front Office (inbound calls) | Planned | Voice provider seam; same brain as WhatsApp; `PRODUCT.md` §14 |
| Voice ↔ WhatsApp continuity (one parent timeline) | Planned | Cross-channel parent record |
| Warm transfer escalation | Planned | Voice-grade handoff; safety parity with chat |
| Post-call WhatsApp summary/confirmation | Planned | |

## Version 4 — Complete School Growth Platform

| Feature | Status | Notes |
|---|---|---|
| School Dashboard (self-serve knowledge editing, queues) | Planned | Requires real auth (retires `ADMIN_SETUP_TOKEN`); `UI_FLOWS.md` §3 |
| Analytics (funnel, containment, ROI) | Planned | KPI definitions shared with `../01-company/GOALS.md` §4 |
| Parent Re-engagement | Planned | Opt-in template campaigns |
| Follow-up Automation | Planned | Post-visit nudges, next-step scheduling |
| Multi-school Management | Planned | `organizations → schools` parent table (`/CLAUDE.md` §6) |

## Permanent non-features (out of scope forever)

- Promising or guaranteeing admission, a seat, or a fee waiver.
- Legal, disciplinary, or custody advice, or resolving a child-safety matter itself.
- General-purpose chatbot behaviour (off-topic conversation, revealing AI nature).

## Feature-addition rules

1. Every new feature enters this table with a version and a status before build starts.
2. Features land behind seams (provider interfaces, flags) so existing school flows are
   untouched.
3. A feature is **Live** only when it meets its bar in `ACCEPTANCE_CRITERIA.md`.
