# ACCEPTANCE_CRITERIA.md — Acceptance Criteria & Definition of Done

> Owns the shipping bar for every feature. A feature is **Live** in `FEATURES.md` only
> when it meets its criteria here. Test mechanics: `../07-testing/TESTING_STRATEGY.md`.

---

## 1. Global Definition of Done (applies to every change)

1. **TypeScript strict passes** (`npm run typecheck`); no `any` in domain code; external
   payloads parsed with `zod` at the boundary.
2. **Tests:** pure logic has unit tests (vitest); safety-affecting changes have
   regression tests; existing suite green (`npm test`).
3. **Idempotent under retry:** re-running the task with the same external id produces no
   duplicate sends, bookings, or records.
4. **Fail-closed verified:** forced model error / malformed output produces the handoff
   message + staff flag, never a guess.
5. **Docs updated in the same PR** — including `/CLAUDE.md` if a convention changed, and
   `../09-changelog/CHANGELOG.md` for prompt/schema/contract changes.
6. **No clinic data in code**; no secrets outside env; no PII or tokens in logs.
7. **Migrations append-only**, shipped with the indexes their queries need.

## 2. V1 acceptance criteria (met — preserved record)

**AI WhatsApp Receptionist**
- A real patient thread runs end-to-end: greeting → FAQ → qualification → appointment
  request recorded → correct handoff on a medical/complaint message.
- Replies on-spec (short, warm, never diagnosing/inventing) on a staff-reviewed sample.
- First-response latency within a few seconds; pipeline idempotent under retry.
- Webhook acks within Meta's timeout with signature verification and dedupe.
- Escalation triggers (medical/complaint/billing/refund/emergency/legal/unknown) all
  produce handoff + reason code, both via model output AND independent code detection.

**Google Calendar booking (shipped addition)**
- Availability = working hours ∩ Calendar free/busy ∩ existing `appointments` rows;
  a manually-created calendar event removes its overlapping slot (verified live).
- Concurrent double-booking test: exactly one winner (Postgres 23505 path); loser
  receives honest apology + *instantly correct* alternatives (no Calendar-sync lag).
- Model echoes real slot ids only; contradictory outputs (both `appointment_request`
  and `booking_selection`) are dropped by the code backstop.
- Postgres-booked/calendar-failed appointments retry via sweep; never rolled back.
- Ambiguous datetime text ("after 5", "tomorrow evening", "12/8 at 5 PM") never
  resolves to a guessed booking (regression-tested).

## 3. V2 acceptance criteria (bar to ship)

**Interactive WhatsApp**
- Every interactive message respects Meta hard limits (3 buttons / 10 list rows /
  title lengths) — enforced by the executor, unit-tested, never model-trusted.
- Every tap has a typed-text equivalent resolved against the last presented options.
- `interactive.button_reply` / `list_reply` payloads parse into the same internal
  message shape as text (boundary-tested).

**Appointment Management**
- Reminder sent T-24h and T-2h for confirmed bookings (opt-in respected); reschedule
  from a reminder completes in-thread without staff; cancellation frees the slot in
  both Postgres and Calendar.
- No reminder ever sent for a cancelled/rescheduled-away slot (sweep-tested).

**Missed Call Recovery**
- Missed-call webhook → WhatsApp outreach in <60s; thread continues through the normal
  receptionist flow; duplicate webhooks deduped on provider call id.

**Review Automation**
- Review ask only after a completed visit, once per visit, opt-in respected; negative
  sentiment diverts to private feedback + staff alert (never a public review link).

**Tamil/Tanglish**
- Per-clinic locale switches knowledge + prompt language; safety behaviours verified
  on a Tamil/Tanglish staff-reviewed sample at parity with English.

## 4. V3 acceptance criteria (bar to ship)

- Voice turn latency at conversational grade; explicit verbal confirmation precedes any
  booking write; booking path shares the same Postgres mutex as chat.
- Safety parity: the full escalation matrix (emergency/medical/complaint/…) verified by
  voice test calls; emergency calls urge immediate care and warm-transfer.
- Every call produces a timeline entry + WhatsApp follow-up on the same patient record.

## 5. V4 acceptance criteria (bar to ship)

- Dashboard actions are authorized per real user/role (no shared tokens); RLS policies
  enforce clinic isolation for user-facing access.
- Knowledge edits from the dashboard bump `knowledge_version` and propagate to the next
  message with no deploy.
- Analytics figures reconcile with raw tables (spot-check queries documented);
  KPI definitions match `../01-company/GOALS.md` §4 exactly.
- Multi-clinic rollups never leak a clinic's data to a non-member (tested per role).

## 6. Safety acceptance criteria (every version, never waived)

- Zero paths where the model's unreviewed text reaches a patient after a booking
  conflict, parse failure, or safety trigger.
- Safety-intent precedence (`emergency` > `medical_advice` > complaint/billing/refund >
  rest) holds in mixed-intent messages.
- `mobile` in any record is always `patient.wa_phone`, never model-supplied.
- New channels ship with their own deterministic safety overrides or do not ship.
