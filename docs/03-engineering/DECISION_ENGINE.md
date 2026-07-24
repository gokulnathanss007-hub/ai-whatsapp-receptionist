# DECISION_ENGINE.md — AI Decision Engine Architecture

> Status: **v1 pattern live; generalised action contract is the V2 design.**
> Related: `PROJECT_ARCHITECTURE.md` (pipeline), `PATIENT_EXPERIENCE.md` (interactive
> actions), `PROMPT_ENGINEERING.md` (output contract), `/CLAUDE.md` §5 (constitutional
> framing: "the AI proposes; code disposes").

---

## 1. Core principle

**The AI never directly replies. The AI returns *decisions*; Node.js executes them.**

The model is a decision-maker producing a structured, validated description of *what
should happen next*. The backend (the **executor**) owns every side effect: what the
parent actually receives, what is written to the database, what external systems are
called. This is the architecture that makes safety enforceable (code can veto any
decision), channels pluggable (the same decision renders as text, buttons, or speech),
and behaviour testable (decisions are data).

## 2. The v1 decision contract (live today)

The current output schema (`lib/types.ts`, mirrored in `lib/ai/jsonSchema.ts`) is
already a decision contract — fields, not free text driving side effects:

| v1 field | Decision it encodes |
|---|---|
| `reply` | proposed parent-facing text (executor may replace it) |
| `intent` | classification for routing/analytics |
| `collected` | slots to merge into durable state |
| `presenting_slots: true` | "show the real availability list" — executor renders it |
| `booking_selection` | "book this exact slot id" — executor runs the Postgres-mutex insert |
| `enquiry_request` | "record a staff-confirmed admission enquiry" (fallback path) |
| `human_handoff` + `handoff_reason` | "escalate to staff" |

Executor vetoes already in production (the pattern to preserve):
- `safetyOverride.ts` forces handoff regardless of the model's decision.
- Contradictory decisions (both `enquiry_request` and `booking_selection`) →
  the invalid one is dropped.
- A booking conflict discards the model's optimistic `reply` and substitutes a
  deterministic message.
- The model's "confirmed" text is always replaced with the system-verified date/time.

## 3. The generalised action contract (V2 target)

`[CHANGED — V2 direction]` The v1 fixed fields generalise into an **ordered list of
action envelopes**. Every action is an envelope — `{ action, screen, data }` — never a
bare verb (see `PATIENT_EXPERIENCE.md` §2 for the screen registry and rationale:
`screen` names the semantic journey moment, so voice, dashboard, app, and web render
the SAME decision; it is also the unit of analytics and channel parity):

```ts
// lib/decision-engine/types.ts (envelope shape — implemented; action set grows additively)
interface ActionEnvelope<A extends string, D> {
  action: A;        // the interaction mechanic
  screen: Screen;   // the semantic journey moment (PATIENT_EXPERIENCE.md §2 registry)
  data: D;          // channel-agnostic payload — keys and structured values, never channel JSON
}

type Action =
  | ActionEnvelope<"reply_text",          { text: string }>
  | ActionEnvelope<"show_buttons",        { text: string; buttons: ButtonSpec[] }>   // ≤3
  | ActionEnvelope<"show_list",           { text: string; sections: ListSection[] }> // ≤10 rows
  | ActionEnvelope<"show_calendar_slots", { leadIn: string; slots: SchedulingSlot[] }> // hydrated by executor
  | ActionEnvelope<"show_location",       Record<string, never>>
  | ActionEnvelope<"send_pdf",            { documentKey: string }>   // school asset keys
  | ActionEnvelope<"send_image",          { imageKey: string }>
  | ActionEnvelope<"handoff",             { reason: HandoffReason }>
  | ActionEnvelope<"book_visit",          { selectedSlotId: string; name: string; reason: string }>
  | ActionEnvelope<"cancel_visit",        { enquiryRef: string }>
  | ActionEnvelope<"reschedule_visit",    { enquiryRef: string; selectedSlotId: string }>;

interface Decision {
  intent: IntentId;
  collected: Record<string, unknown>;
  actions: Action[];          // ordered; executor validates & executes
}
```

Example — the confirm moment before a booking:

```jsonc
{
  "action": "show_buttons",
  "screen": "booking_confirmation",
  "data": { "text": "Book a school visit for Mon 5:00 PM?", "buttons": [{ "id": "<slotId>", "title": "Confirm" }, { "id": "menu_pick_another", "title": "Pick another time" }] }
}
```

Contract rules:
- **Ordered, small:** typically 1–2 actions per turn (e.g. `reply_text` + `show_list`).
- **Keys, not content:** media actions reference school-knowledge asset keys — the model
  never emits URLs, file bytes, or raw interactive JSON.
- **Slot ids only from the current turn's `<available_slots>`** (v1 rule carried over).
- **Structured Outputs enforce the schema;** parse failure → fail closed to handoff.
- **Backwards compatibility:** the executor accepts v1-shaped output during migration;
  v1 fields map 1:1 onto actions (`presenting_slots` → `show_calendar_slots`,
  `human_handoff` → `handoff`, etc.). Additive-only versioning.

## 4. The executor (Node.js)

```
Decision (parsed, schema-valid)
  │
  ├─ 1. VALIDATE     zod parse; unknown action type → drop turn, fail closed
  ├─ 2. VETO         safety overrides (code-detected escalation forces [handoff]);
  │                  mutual-exclusion rules (book/cancel/reschedule are exclusive);
  │                  Meta limit enforcement (≤3 buttons, ≤10 rows, title lengths)
  ├─ 3. RESOLVE      hydrate actions with real data: slot list from SchedulingProvider,
  │                  location from school knowledge, PDF from asset store
  ├─ 4. EXECUTE      side effects in a fixed order:
  │                  writes first (book/cancel/reschedule via Postgres-mutex),
  │                  then messages (rendered per channel via the channel adapter)
  ├─ 5. RECONCILE    on write conflict (23505): discard dependent message actions,
  │                  substitute deterministic apology + re-fetched alternatives
  └─ 6. PERSIST      message rows, merged slots, conversation stage, handoff flags
```

Executor invariants:
1. **No action executes unvalidated.** The model cannot make the executor exceed a Meta
   limit, book an unknown slot, or send an unregistered asset.
2. **Writes precede sends** — the parent is never told something that didn't happen.
3. **Idempotent per inbound `message.id`** — replaying the decision produces no
   duplicate side effects.
4. **Channel adapters render, never decide.** WhatsApp text (V1), interactive (V2), and
   voice (V3) are renderers of the same `Action` union — `show_buttons` becomes a
   spoken menu on voice; `show_calendar_slots` becomes read-out options.

## 5. Why this architecture (design rationale)

- **Safety:** every consequential outcome passes through a code gate that can refuse.
  The prompt asks nicely; the executor enforces (proven pattern).
- **Determinism:** business consequences (bookings, cancellations) are executed by
  tested code paths, not inferred from prose.
- **Channel leverage:** one brain, many surfaces — the V3 voice front office reuses the
  entire decision layer.
- **Testability:** decision fixtures make conversation behaviour unit-testable without a
  model call; executor behaviour is testable without a conversation.
- **Observability:** actions are enumerable — per-action metrics (button usage, list
  pick-rate, handoff mix) come for free.

## 6. Migration plan (V1 → V2)

1. Introduce `lib/decision-engine/` with the `Action` union + executor skeleton;
   internally translate today's v1 output into actions (no prompt change, no behaviour
   change — pure refactor with the existing test suite green).
2. Add interactive actions (`show_buttons`, `show_list`, …) to the schema + prompt;
   executor renders them per `PATIENT_EXPERIENCE.md` limits.
3. Extend prompt to emit the action-list shape natively; keep the v1-compat translator
   until all schools are on the new contract, then retire it (deprecate → migrate →
   remove).
