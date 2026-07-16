# INTERACTIVE_WHATSAPP.md — Interactive WhatsApp Experience

> Status: **V2 design.** Executed through the Decision Engine (`DECISION_ENGINE.md`);
> patient-facing UX flows: `../02-product/UI_FLOWS.md`; channel rules summary:
> `/CLAUDE.md` §16. Meta limits below are hard constants — verify against current Meta
> Cloud API docs at implementation time and encode them in the executor, never assume.

---

## 1. Message types available on Meta Cloud API

| Type | What it is | Primary Medixum use |
|---|---|---|
| **Text** | Plain session message | Default; all V1 traffic |
| **Reply buttons** (`interactive.button`) | Up to 3 tappable buttons under a body text | Yes/no, confirm/change, ≤3 choices |
| **List message** (`interactive.list`) | Button opening a sheet of up to 10 rows (sectioned) | Slot pickers, service menus |
| **Location** | Pin + name/address | "Where are you?" → clinic location |
| **Media** (image/document/audio/video) | Files by link or uploaded media id | Price lists (PDF), pre-care instructions, clinic photos |
| **Template messages** | Pre-approved messages sendable **outside** the 24h window | Reminders, review asks, missed-call outreach, reactivation |
| **CTA URL / Flows** | Button opening a URL / native multi-step form | Review deep links; candidate for V4 intake forms |

## 2. Hard Meta limitations (encode in the executor)

- **Reply buttons:** max **3** per message; button title ≤ **20 chars**; body ≤ 1024 chars.
- **List messages:** max **10 rows** total across sections; row title ≤ **24 chars**;
  row description ≤ 72 chars; one list per message; list button label ≤ 20 chars.
- **Buttons and lists cannot be combined** in a single message.
- **Interactive messages are session messages** — inside the 24h customer-service window
  only. Outside the window: templates only (approved, opt-in, paid per message).
- **Interactive replies arrive as distinct webhook payloads**
  (`interactive.button_reply.{id,title}` / `interactive.list_reply.{id,title}`) — parsed
  at the boundary into the same internal message shape as text (CLAUDE.md §16).
- Media: documents ≤ 100 MB (link-based sends must be publicly fetchable by Meta);
  captions where supported.

## 3. Decision tree — which format the AI uses

Selected by the Decision Engine action; the model picks the *action type*, the executor
enforces the limits.

```
Is the message sensitive (medical / complaint / emergency / legal)?
 └─ YES → text + handoff. Never buttons on safety paths (tapping "Refund?" is not empathy).
Does the patient need to provide open-ended info (name, concern description)?
 └─ YES → text question, one at a time (qualification stays conversational).
Is the AI offering choices?
 ├─ 2–3 fixed, short choices (yes/no, confirm/change, morning/evening)
 │    → reply buttons (max 3)
 ├─ 4–10 options (calendar slots, services, doctors)
 │    → list message
 └─ >10 options → narrow conversationally first (e.g. "morning or evening?"), then list.
Is the answer a fact (fee, timings)?
 └─ Text, answered directly — don't make patients tap for what a sentence conveys.
Location request? → location message (+ maps link in text fallback).
Document-shaped content (price list, pre-care sheet)? → send_pdf with a one-line text intro.
```

**Handoff is never behind a menu:** an explicit "talk to someone" or any safety trigger
escalates immediately, even mid-flow (safety-intent precedence, CLAUDE.md §8).

## 4. Interactive UX principles

1. **Interactivity reduces typing, never adds steps.** A button must save the patient a
   message, not decorate one.
2. **Every tap has a typed equivalent.** Patients answer lists with "the 4:30 one" —
   free-text answers resolve against the last presented options (generalising
   `lib/scheduling/recoverSelectedSlot.ts`). A message the patient can only answer by
   tapping is a defect.
3. **Ids are backend keys.** Button/row ids carry stable identifiers (slot ids, service
   keys); titles are the human labels. The model never sees or invents raw payload JSON —
   it emits `show_buttons`/`show_list` actions; the executor builds the payload.
4. **One interactive element per turn**, consistent with "one question at a time".
5. **Warmth survives structure.** Body text stays in the receptionist's voice; buttons
   are labels, not the personality.
6. **Slot lists remain system-rendered** — the model's slot-invention prohibition
   (SYSTEM_PROMPT.md § APPOINTMENTS) carries over unchanged; `show_calendar_slots` is
   hydrated by the executor from the SchedulingProvider.

## 5. Template messages (outside the 24h window)

Used by V2 modules (reminders, reviews, missed-call outreach, reactivation):
- Pre-approved per template + language via Meta; category (utility/marketing) determines
  price — metered pass-through per `../01-company/REVENUE_MODEL.md`.
- **Opt-in is mandatory** and recorded per patient before any outbound-first send.
- Template sends are a different compliance/cost class from session replies — never blur
  the two (CLAUDE.md §15). Quality rating protection: monitor block/report rates;
  outbound frequency caps per patient.

## 6. Worked flows

**Booking with list + buttons:**
```
P: I want an appointment
AI decision: [reply_text "Of course — I can book that for you."]
             [show_calendar_slots leadIn: "Here are the available times:"]
→ executor renders list: rows = real slots (id = slot id, title = "Tomorrow – 10:00 AM")
P: taps "Tomorrow – 10:00 AM"       (webhook: interactive.list_reply, id = <slot id>)
AI decision: [show_buttons "Book tomorrow 10:00 AM for your acne consultation?"
              [Confirm]/[Pick another time]]
P: taps Confirm
AI decision: [book_appointment slotId ...] + [reply_text confirmation]
→ executor books (Postgres mutex) THEN sends the verified confirmation.
```

**Location:**
```
P: where is the clinic?
AI decision: [reply_text "We're at 1st Floor, Anna Nagar Main Road, Madurai — sending
              the location now."] [show_location]
```

**Safety override mid-flow:**
```
P: (after tapping a slot) actually my face is swelling badly
→ code-level safety detection wins over the in-flight booking flow:
AI/executor: [reply_text urging immediate care] [handoff reason=emergency]
```

## 7. Rollout notes

- Ships behind a per-clinic flag (`interactive_enabled`) — text-only clinics unaffected
  (additive evolution, CLAUDE.md §2.6).
- Acceptance bar: `../02-product/ACCEPTANCE_CRITERIA.md` §3.
- Executor-level limit enforcement is unit-tested with fixture decisions
  (`../07-testing/TESTING_STRATEGY.md`).
