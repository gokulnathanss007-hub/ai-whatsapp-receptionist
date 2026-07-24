# CODING_STANDARDS.md — Engineering Coding Standards

> Expands `/CLAUDE.md` §7 (constitutional summary). If the two disagree, CLAUDE.md wins
> and this file is corrected. Related: `SECURITY.md`, `../07-testing/TESTING_STRATEGY.md`.

---

## 1. TypeScript

- **Strict mode always** (`tsconfig.json`); `npm run typecheck` gates every merge.
- **No `any` in domain code.** External payloads (Meta webhooks, OpenAI output, Google
  API responses) are parsed at the boundary with `zod`; inside the boundary, types are
  trusted and precise.
- **One contract, shared types.** `lib/types.ts` defines the AI output contract; the DB
  layer, parser, and JSON schema (`lib/ai/jsonSchema.ts`) all derive from it. Divergence
  between these is a P0 bug class — change them together, in one PR.
- Prefer discriminated unions over boolean flags for states (`sync_status:
  'pending'|'synced'|'failed'` is the model; twin booleans are not).
- `null` means "absent by design" in the AI contract (nullable fields); don't mix
  `undefined` semantics into persisted shapes.

## 2. Architecture rules

- **Every external call wrapped in `/lib`** (Meta, OpenAI, Supabase, Google, future
  Exotel/voice). No inline `fetch` in route handlers or Trigger tasks.
- **Providers behind interfaces.** Vendor SDKs are implementation details of a provider
  module (`SchedulingProvider` is the template); pipeline code imports the interface.
- **Pure core, effectful edges.** Slot generation, time matching, parsing, formatting
  are pure functions (unit-testable, no I/O); providers and queries do I/O.
- **Route handlers are thin:** validate → delegate → respond.
- **Tasks are orchestration:** a Trigger task should read like the pipeline diagram in
  `PROJECT_ARCHITECTURE.md`; logic lives in `/lib`.
- **No school data in code** — anywhere, ever. Config is rows (`/CLAUDE.md` §6).

## 3. Reliability standards

- **Idempotency:** every externally-triggered unit keyed by a stable external id
  (`message.id`); dedupe via unique constraints (`messages.wa_message_id`,
  `processed_events`) — DB-enforced, not memory-enforced.
- **Expected-error handling:** Postgres `23505` on designed unique constraints is a
  *signal*, handled explicitly (booking conflict path) — never swallowed generically.
- **Fail closed on safety, degrade gracefully on availability** (`/CLAUDE.md` §7).
- **Guarded sends:** check for an existing reply to this inbound message before sending.
- **Bounded retries** with terminal states left queryable (`sync_retry_count` pattern).

## 4. Naming & style

- Files: `camelCase.ts` for modules (`slotGenerator.ts`, `verifySignature.ts`);
  descriptive verb-noun for functions (`listAvailableSlots`, `recoverSelectedSlot`).
- Env vars: flat, provider-prefixed `SCREAMING_SNAKE_CASE` (`OPENAI_*`, `META_*`,
  `SUPABASE_*`, `TRIGGER_*`, `GOOGLE_*`). New providers follow suit (`EXOTEL_*`).
- SQL: snake_case tables/columns; migrations numbered `NNNN_description.sql`,
  append-only.
- Comments explain *why* (decisions, constraints, incident references), not *what*.
  A fixed bug worth remembering gets a note at the fix site and, if design-relevant, in
  the design doc (the GOOGLE_CALENDAR_INTEGRATION.md implementation notes are the
  house style for this).

## 5. Dates, times, money

- All datetime math via `luxon`, always in the school's IANA timezone
  (`schools.timezone`); persist UTC instants (`timestamptz`); render school-local labels.
- Never parse ambiguous datetime text into a guess — resolve to `null` and let the
  flow re-ask (`lib/scheduling/requestedDateTime.ts` is the binding precedent).
- Money as numerics in the DB, formatted at the edge; never floats for arithmetic.
  Note: `schools` has no single fee column — fee structure is FAQ content, not a
  numeric field, so this rule applies to future fee-related tables (e.g. payment
  tracking), not today's schema.

## 6. Testing standards (summary — full: `../07-testing/TESTING_STRATEGY.md`)

- Pure logic → vitest unit tests colocated under `tests/`.
- Safety-affecting behaviour → regression tests that encode the incident
  (`ambiguousRequests.test.ts`, `slotIntegrity.test.ts` are precedents).
- Concurrency claims → tested with real concurrent execution (the double-booking test).
- `npm test` green is a merge gate.

## 7. PR & review standards

- Small, single-purpose PRs; migrations + code + docs + tests travel together.
- A PR that changes behaviour documented anywhere updates that doc in the same PR.
- Review blockers: `any` in domain code, inline external calls, unguarded model output
  reaching a side effect, missing idempotency on a new external trigger, secrets or PII
  in logs, migration edits to applied migrations.

## 8. Dependencies

- Additions require justification in the PR (the `googleapis`/`luxon` table in
  GOOGLE_CALENDAR_INTEGRATION.md §11 is the format).
- Coupled SDKs (Trigger.dev sdk/build) pinned exactly and upgraded together.
- Prefer the platform (Postgres constraints, WhatsApp session semantics) over new
  libraries.
