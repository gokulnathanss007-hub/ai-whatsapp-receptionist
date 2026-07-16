# TESTING_STRATEGY.md — Testing Strategy

> Owns how we test. Shipping bars: `../02-product/ACCEPTANCE_CRITERIA.md`. Standards:
> `../03-engineering/CODING_STANDARDS.md` §6. Runner: vitest (`npm test`), config
> `vitest.config.ts`.

---

## 1. Philosophy

Test where the risk is: **safety behaviour, money-adjacent writes (bookings), and
concurrency.** Pure logic gets exhaustive unit tests; orchestration gets targeted
integration verification; the model gets a curated regression conversation sample —
because model output is probabilistic, we test the *system's response to* model output,
not the model itself.

## 2. Current suite (V1 — preserved record)

All under `tests/scheduling/` — the booking engine is the highest-risk surface:

| Test file | Guards against |
|---|---|
| `ambiguousRequests.test.ts` | Vague datetime text ("after 5", "tomorrow evening", "12/8 at 5 PM") ever resolving to a guessed booking — resolves `null` by design |
| `requestedDateTime.test.ts` | Day/time cue parsing rules ("next Monday" skips today; missing day = today) |
| `timeMatch.test.ts` | Matching patient free-text answers to offered slots |
| `recoverSelectedSlot.test.ts` | Resolving "the 4:30 one"-style references against the last presented list |
| `slotIntegrity.test.ts` | Model-echoed slot ids verified against real generated slots (never invented) |
| `timezone.test.ts` | Same instant preserved across local-midnight/UTC boundaries (23:30–00:00 slot case) |

## 3. Test layers

1. **Unit (vitest):** pure functions — slot generation, datetime resolution, matching,
   rendering, parsers. Fast, exhaustive, colocated in `tests/`.
2. **Contract:** zod schemas exercised with malformed/hostile payloads (Meta webhook
   shapes, model output off-contract → verified fail-closed path).
3. **Concurrency (proven pattern, keep):** real simultaneous execution — the live
   double-booking test (two requests, one slot) found a real bug (Calendar-lag
   alternatives) that no mock would have caught. Concurrency claims are tested with
   real races, not reasoning.
4. **Live end-to-end (pre-release):** real model + real Calendar against the pilot
   clinic seed — the Phase 4 E2E found two real model-behaviour bugs (double-populated
   output fields; verified id echoing). Cleaned up after.
5. **Conversation regression sample (manual, staff-reviewed):** curated transcripts
   covering FAQ / qualification / booking / handoff / ambiguity / off-topic — re-run on
   any prompt, model, or sampling change (`../06-prompts/README.md` §change process).

## 4. What must always be tested (per feature class)

- **Safety:** every escalation trigger → handoff + reason code, via model output AND
  independent code detection; forced parse failure → fail-closed message.
- **Idempotency:** replaying the same inbound `message.id` produces no duplicate sends
  or writes.
- **New external triggers** (missed-call webhook, voice events): dedupe on provider id,
  tested with duplicate deliveries.
- **Interactive (V2):** executor limit enforcement (3 buttons / 10 rows / title
  lengths) with fixture decisions; typed-equivalent resolution for every tappable.
- **Decision Engine (V2):** decision fixtures → executor behaviour without model calls;
  veto paths (unknown action, unknown slot id, contradiction) each have a test.

## 5. Gates

- `npm run typecheck` and `npm test` green: merge gates.
- Live E2E + conversation sample: release gates per version
  (`../02-product/ACCEPTANCE_CRITERIA.md`).
- A fixed bug gets a regression test that encodes it — the incident history in
  `../03-engineering/GOOGLE_CALENDAR_INTEGRATION.md` shows the payoff.
