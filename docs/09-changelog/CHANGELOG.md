# CHANGELOG.md — Documentation & Contract Changelog

> Records changes to: documentation architecture, prompts, AI output contract, schema,
> and KPI definitions. Code history lives in git; this file tracks the things whose
> silent drift hurts (`/CLAUDE.md` §18).

---

## 2026-07-16 — Interactive WhatsApp phase 1 + Decision Engine step 1 live

**Contract/schema changes**
- Migration `0009_clinic_interactive_flag.sql`: `clinics.interactive_enabled boolean`
  (default false; enabled for the pilot clinic). Rollout flag per
  `INTERACTIVE_WHATSAPP.md` §7.
- Inbound webhook contract widened: `interactive.button_reply` / `interactive.list_reply`
  payloads are parsed at the boundary into the same internal message shape as text
  (`body` = human title, new `interactiveReplyId` = backend key). Typed messages carry
  `interactiveReplyId: null`.
- AI output contract **unchanged** (Decision Engine migration §6 step 1 is a pure
  translation layer: `lib/decision-engine/` Action union + v1 translator + WhatsApp
  channel adapter with Meta limit enforcement).

**Behaviour**
- Clinics with `interactive_enabled`: slot offers render as a tappable list message
  (row id = slot id); a tap books deterministically — it outranks the model's id echo
  (`resolveSelectedSlot` kind `tapped`), and a `booking_selection` is synthesized from a
  tap if the model omits one. Text-only clinics: byte-identical behaviour to before.
- Interactive send failures fall back to the plain-text rendering of the same turn.

## 2026-07-16 — Documentation architecture v2 (Clinic Growth System era)

**Context:** Medixum AI's documentation restructured from the flat MVP set (10 docs) to
the numbered platform tree (`docs/01-company/` … `docs/09-changelog/`), reflecting the
evolution from "AI WhatsApp Receptionist" (product) to "AI Clinic Growth System"
(platform, V1–V4).

**Added**
- `/CLAUDE.md` v2.0 — rewritten as the Engineering Constitution (18 rule domains).
- `docs/01-company/` — BUSINESS, COMPANY_VISION, ICP, PRICING (**all ₹ figures
  PROPOSED, founder approval required**), GOALS, REVENUE_MODEL.
- `docs/02-product/` — PRODUCT (product bible), PRODUCT_ROADMAP (V1–V4 + preserved V1
  phase plan), USER_JOURNEY, FEATURES, UI_FLOWS, ACCEPTANCE_CRITERIA.
- `docs/03-engineering/` — DECISION_ENGINE (new architecture doc: AI returns actions,
  Node executes), INTERACTIVE_WHATSAPP (new: V2 interactive design + Meta limits),
  PROMPT_ENGINEERING, CODING_STANDARDS, SECURITY (consolidated).
- `docs/04-api/API_REFERENCE.md`, `docs/05-database/DATABASE_SCHEMA.md`,
  `docs/06-prompts/README.md`, `docs/07-testing/TESTING_STRATEGY.md`,
  `docs/08-deployment/DEPLOYMENT.md`, this changelog, `docs/README.md`, root `README.md`.

**Migrated (content preserved, headers + cross-refs updated)**
- CONVERSATION_FLOWS, INTENTS, PRODUCT_REQUIREMENTS (marked historical V1 PRD) →
  `docs/02-product/`.
- AI_RECEPTIONIST_SPEC, SYSTEM_PROMPT, KNOWLEDGE_STRUCTURE, PROJECT_ARCHITECTURE,
  GOOGLE_CALENDAR_INTEGRATION → `docs/03-engineering/`.
- DEVELOPMENT_ROADMAP → absorbed into `docs/02-product/PRODUCT_ROADMAP.md` Part B
  (verbatim phase plan preserved).
- Old `docs/*.md` paths kept as redirect stubs (backwards compatibility).
- `docs/FAQ_SCHEMA.json` unchanged in place (referenced by both trees).

**Changed engineering/product decisions (flagged)**
- `[CHANGED]` V1 scope record: Google Calendar auto-confirmed booking is acknowledged
  as *shipped within V1* (original MVP scope had deferred confirmation) — closes the
  stale-scope issue GOOGLE_CALENDAR_INTEGRATION.md §12 flagged against old CLAUDE.md §2.
- `[CHANGED — V2 direction]` AI output contract to generalise from fixed fields to an
  action list (Decision Engine); v1 contract remains supported during migration.
- CONVERSATION_FLOWS.md gained §2b (calendar-checked booking flow) — the pending doc
  update GOOGLE_CALENDAR_INTEGRATION.md §12 required.

**Explicitly preserved (unchanged)**
- All safety rules, prohibitions, and fail-closed behaviour.
- Stack decisions (Next.js/Vercel, Meta direct, GPT-5 nano, Supabase, Trigger.dev v4).
- Prompt caching architecture, idempotency patterns, Postgres-as-mutex booking design,
  two-table requests/appointments split, `opening_hours` single-source-of-truth,
  all GOOGLE_CALENDAR_INTEGRATION implementation notes and recorded bugs.
- `prompts/system_prompt.md` and all application code — **no code changes in this pass.**

---

## Earlier history (reconstructed from design-doc implementation notes)

- **2026-07-04** — Phase 5: `opening_hours` moved to `clinics` (single source of truth);
  Phase 4 live E2E fixes (mutually-exclusive output fields; verified slot-id echoing).
- **2026-07-03** — Google Calendar Phases 1–4 implemented (OAuth, availability, booking
  with race protection, AI wiring); double-booking race bug found & fixed
  (appointments-table filtering); locked decisions: availability = working hours ∩
  Calendar busy; one calendar per clinic.
- **(pre-2026-07)** — V1 MVP design set (10 documents) and Phase 1 build.
