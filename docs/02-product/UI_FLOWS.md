# UI_FLOWS.md — User Interface Flows

> Owns the *visual/interactive surface* of the product per channel. Conversation logic:
> `CONVERSATION_FLOWS.md`. Interactive message mechanics & Meta limits:
> `../03-engineering/PATIENT_EXPERIENCE.md`.

The product has three UI surfaces across its life: the **WhatsApp thread** (V1–V2), the
**voice call** (V3), and the **clinic dashboard** (V4).

---

## 1. WhatsApp thread — V1 (text-only, live)

The entire UI is a chat thread. Design rules that make plain text feel like an interface:

- **Short blocks:** 2–3 sentences; structured summaries use hyphen lists (the booking
  summary is the only "form-like" moment, deliberately).
- **One question per message** — the message *is* the input field.
- **Real slot lists** are system-rendered (never model-typed) and numbered/labelled
  exactly as generated ("Today – 4:30 PM"), so a patient can answer "the 4:30 one".
- **Location/maps** shared as the clinic's `maps_url` from knowledge.
- Confirmations restate what was booked in the system-verified form, never the model's
  optimistic text.

## 2. WhatsApp thread — V2 (interactive)

Adds native WhatsApp UI elements, selected by the Decision Engine
(`../03-engineering/DECISION_ENGINE.md`) per the decision tree in
`../03-engineering/PATIENT_EXPERIENCE.md`:

| Moment | Element | Example |
|---|---|---|
| Yes/no or ≤3 fixed choices | **Reply buttons** (max 3) | "Book a consultation?" [Book] [Ask a question] |
| 4–10 options | **List message** | Available slots; services menu |
| "Where are you?" | **Location message** | Pin + address card |
| Pricing sheets, pre-care instructions | **Media/PDF** | `send_pdf` action |
| Post-visit review ask, reminders | **Template message** | Outside 24h window; opt-in |

Flow example — booking with interactive elements:

```
P: I want an appointment
R: [text] "Of course — I can book that for you."
   [list] "Available times" → 6 rows of real slots
P: (taps "Tomorrow – 10:00 AM")            ← arrives as interactive.list_reply
R: [buttons] "Book tomorrow 10:00 AM for your acne consultation?" [Confirm] [Pick another time]
P: (taps Confirm)
R: [text] "You're booked for tomorrow at 10:00 AM. See you then!"
```

Fallback rule (binding): every tap has a typed equivalent; free-text answers are
resolved against the last presented options (generalising `recoverSelectedSlot`).

## 3. Clinic dashboard — V4 (design intent)

Buyer is WhatsApp-native, not dashboard-native — the dashboard must be glanceable:

- **Home:** today's bookings, handoff queue (badge count), enquiries this week,
  conversion tile ("X enquiries → Y bookings").
- **Conversations:** searchable timeline per patient (all channels merged).
- **Handoff queue:** reason-coded list; replying from the dashboard continues the same
  WhatsApp thread; resolving un-flags the conversation.
- **Knowledge editor:** edit FAQs/services/hours/fees as forms → bumps
  `knowledge_version` (no-code principle preserved in UI form).
- **Analytics:** containment, funnel, no-show rate, review volume; exportable monthly
  report (the renewal artifact).
- **Multi-clinic switcher** (organizations) for group owners.

Prerequisite: real authentication/authorization system (CLAUDE.md §10) — the
`ADMIN_SETUP_TOKEN` stopgap never carries user-facing UI.

## 4. Voice — V3 (design intent)

The "UI" is conversational audio: sub-second turn latency target; barge-in supported;
explicit verbal confirmation before booking ("Shall I book tomorrow at 10?"); DTMF/say
fallback ("press or say 1"); warm transfer on escalation; WhatsApp message after the
call carries the visual record (confirmation card).

## 5. Cross-surface rules

1. Same brain everywhere — knowledge, intents, safety, booking are shared; surfaces only
   render.
2. The patient-facing voice (tone, brevity, warmth) is identical in text, buttons, and
   speech — `PRODUCT.md` §7 binds all surfaces.
3. Every surface writes to the same conversation/patient timeline.
