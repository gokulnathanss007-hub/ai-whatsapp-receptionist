# PATIENT_EXPERIENCE.md — The Patient Experience Layer

> Status: **Phase 1 live (WhatsApp slot-list tap-to-book); everything else Designed.**
> Supersedes `INTERACTIVE_WHATSAPP.md` (now a redirect stub). Executed through the
> Decision Engine (`DECISION_ENGINE.md`); UX flows: `../02-product/UI_FLOWS.md`.
>
> **Why "Patient Experience Layer", not "Interactive WhatsApp":** WhatsApp interactivity
> is one *renderer*, not the product. Voice (V3), the clinic dashboard (V4), follow-ups,
> reviews, and reminders all present the same patient experience through different
> surfaces. Everything patient-facing belongs to this layer; channels only render it.

---

## 1. Architecture position

```
                 AI (decision-maker)
                        │  Action envelopes  {action, screen, data}
                        ▼
                 Decision Engine executor (validate → veto → resolve → execute)
                        │
       ┌────────────────┼────────────────────┐
       ▼                ▼                    ▼
 WhatsApp renderer   Voice renderer (V3)  Dashboard renderer (V4)
 (text/buttons/list/ (spoken menus,       (queues, timelines,
  media/templates)    read-out slots)      canned actions)
```

One brain, many surfaces. A channel renderer may *degrade* an action (voice reads a
list aloud; a text-only clinic gets bullets) but never *decides* anything.

## 2. The action envelope — `{action, screen, data}`

Every AI decision is an **envelope**, not a bare verb:

```jsonc
{
  "action": "show_buttons",            // WHAT kind of interaction
  "screen": "booking_confirmation",    // WHICH semantic moment in the journey
  "data": {                            // channel-agnostic payload (keys, never content)
    "doctor": "Dr. Meera",
    "slotId": "MjAyNi0wNy0wNlQwNDoz..."
  }
}
```

- **`action`** tells the renderer the interaction mechanic (text, buttons, list, media…).
- **`screen`** names the semantic moment — the same `booking_confirmation` screen renders
  as buttons on WhatsApp, a spoken yes/no on voice, and a card on the dashboard. Screens
  are the unit of analytics ("where do patients drop off?") and of channel parity.
- **`data`** carries backend keys and structured values only — never raw channel JSON,
  URLs, or file bytes (executor hydrates those; DECISION_ENGINE.md §4).

Screen registry (grows additively; never repurpose a name):

| screen | Journey moment |
|---|---|
| `main_menu` | Welcome / "what can I do" entry point |
| `faq_answer` | A fact answered (fee, timings, parking, …) |
| `qualifying_question` | One intake question |
| `day_picker` | Open days offered (day-first booking) |
| `slot_picker` | Real availability offered |
| `booking_confirmation` | Confirm/change moment before or after booking |
| `booking_failed` | Slot lost / not available — alternatives offered |
| `treatment_info` | Treatment explanation (text or rich media) |
| `clinic_location` | Address / map moment |
| `handoff` | Escalated to humans |
| `free_text` | Anything conversational not covered above |

## 3. Main Menu — the front door

**The first thing most patients see.** Spec:

```
Hi / Hello / first contact
  ↓
Warm one-line welcome (clinic-branded, receptionist voice)
  ↓
Main Menu (list message, screen: main_menu)
   1. Book Appointment        id: menu_book_appointment
   2. Treatments              id: menu_treatments
   3. Consultation Fee        id: menu_consultation_fee
   4. Clinic Timings          id: menu_clinic_timings
   5. Location                id: menu_location
   6. Talk to Receptionist    id: menu_talk_to_human
```

Tap ids map 1:1 onto existing intents (`menu_book_appointment` → `book_appointment`,
`menu_talk_to_human` → `talk_to_human`, …) — a tap is parsed at the webhook boundary
exactly like typed text (title becomes the body), so the conversation brain needs no
special menu handling. Typing "book" instead of tapping works identically (§5 principle
2: every tap has a typed equivalent).

**Show the menu when:**
- A **new conversation** opens with a greeting or an unclear first message.
- The patient **asks for it** ("menu", "options", "what can you do").
- A **returning patient** re-opens after a closed/expired conversation (§7 resume rules)
  — greeted by name, then menu.

**Do NOT show the menu when:**
- The first message already states an intent ("I want to book tomorrow 5pm", "what's
  the fee?") — answer it directly; forcing a menu before answering adds a step (§5
  principle 1).
- **Mid-flow** — during qualifying, booking, or an open slot offer. Never reset an
  in-progress conversation to the menu.
- **Safety/handoff paths** — complaints, medical, emergencies go straight to the
  handoff behaviour, never a menu.
- Immediately after a booking confirmation (the natural close is a warm goodbye, not
  another menu; the patient can always type).

Status: **Live** (`lib/decision-engine/mainMenu.ts`; deterministic, no model call). Text-only
clinics get the same menu as a numbered text list, and a typed "1"–"6" resolves as a menu
pick only while `conversations.current_screen = 'main_menu'`. Menu picks for facts (fee,
timings, location, treatments) are answered deterministically from clinic knowledge;
`menu_book_appointment` enters the conversational booking flow (via a doctor list first
when the clinic has more than one active doctor); `menu_talk_to_human` hands off
immediately. Slot-row taps now go through a `booking_confirmation` buttons step
([Confirm] / [Pick another time]) before booking — the confirm button id carries the exact
slot id (`confirm_slot_<id>`), stateless.

## 4. AI Decision Matrix ⭐

The canonical situation → action mapping. Future actions extend this table; renderers
consume it; reviewers check behaviour against it.

| Situation | action | screen | WhatsApp rendering |
|---|---|---|---|
| Greeting / new conversation | `show_list` | `main_menu` | List message (menu) |
| FAQ (fee, timings, parking, policy) | `reply_text` | `faq_answer` | Text — facts never hide behind taps |
| Qualifying (name, concern, one at a time) | `reply_text` | `qualifying_question` | Text question |
| Ready to book, no day stated | `show_list` | `day_picker` | List of OPEN days only ("Today", "Tomorrow", "Sat, Jul 19" + free count) — closed days never appear |
| Day chosen (tap `day_<date>` or typed) | `show_calendar_slots` | `slot_picker` | List message, that day's real slots only |
| Patient stated exact day+time | `show_calendar_slots` | `slot_picker` | Skip the day picker — exact/nearest flow directly |
| Offering appointment times | `show_calendar_slots` | `slot_picker` | List message, rows = real slots |
| Confirm / change moment | `show_buttons` | `booking_confirmation` | ≤3 reply buttons |
| Booking result (success) | `reply_text` | `booking_confirmation` | Verified ✅ text |
| Slot lost / unavailable | `show_calendar_slots` | `booking_failed` | Honest text + fresh list |
| Treatment question | `reply_text` (V1) / `send_image`+`reply_text` (rich media, §8) | `treatment_info` | Text; later image + text + book button |
| "Where are you?" | `show_location` | `clinic_location` | Location pin + maps link text |
| Payment link (future) | `open_url` | `payment` | CTA URL button |
| Reminder T-24h/T-2h (V2) | `send_template` | `reminder` | Approved template (outside 24h window) |
| Review request (V2) | `send_template` + `open_url` | `review_request` | Template + review deep link |
| Complaint / billing / refund | `handoff` | `handoff` | Text + staff escalation — **never buttons on safety paths** |
| Emergency / medical advice | `handoff` | `handoff` | Urge immediate care, then escalate |
| Explicit "talk to a human" | `handoff` | `handoff` | Immediate, even mid-flow |

## 5. Component library — channel-agnostic senders

Renderers implement these; product logic calls only these. Voice (V3) implements the
same set with spoken equivalents — adding a channel never touches product logic.

| Component | Envelope action | Status | WhatsApp implementation |
|---|---|---|---|
| `sendText()` | `reply_text` | **Live** | `lib/whatsapp/sendMessage.ts` |
| `sendList()` | `show_list` / `show_calendar_slots` | **Live** (slots) | `lib/whatsapp/sendInteractive.ts` (≤10 rows, titles ≤24) |
| `sendReplyButtons()` | `show_buttons` | **Live (renderer)** — no flow uses it yet | `lib/whatsapp/sendInteractive.ts` (≤3, titles ≤20) |
| `sendLocation()` | `show_location` | Designed | Location message + maps-link text fallback |
| `sendMedia()` | `send_image` | Designed | Image by asset key (§8); caption support |
| `sendPDF()` | `send_pdf` | Designed | Document by asset key (price list, pre-care) |
| `sendTemplate()` | `send_template` | Planned (V2) | Approved template, opt-in enforced, metered |
| `sendReminder()` | `send_template` (reminder class) | Planned (V2) | T-24h / T-2h appointment reminders |
| `sendReview()` | `send_template` + `open_url` | Planned (V2) | Post-visit review ask, unhappy-path diversion |

Meta hard limits (encoded in the executor, never assumed): reply buttons ≤ **3**, title
≤ **20** chars; list ≤ **10 rows**, row title ≤ **24**, description ≤ 72; body ≤ 1024;
buttons and lists never combined; interactive = session messages (24h window);
templates = pre-approved, opt-in, paid, outside-window class — never blurred with
session traffic.

## 6. Interactive UX principles

1. **Interactivity reduces typing, never adds steps.** A button must save the patient a
   message, not decorate one.
2. **Every tap has a typed equivalent.** Free text resolves against the last presented
   options (`lib/scheduling/recoverSelectedSlot.ts`); a message answerable only by
   tapping is a defect.
3. **Ids are backend keys; titles are human labels.** The model never sees or invents
   payload JSON — it emits envelopes; the executor builds the channel payload.
4. **One interactive element per turn** (one question at a time).
5. **Warmth survives structure.** Body text stays in the receptionist's voice.
6. **Slot lists are system-rendered** from the SchedulingProvider — the model's
   slot-invention prohibition carries over unchanged.
7. **Never buttons on safety paths.**

## 7. Conversation Resume Strategy

Everything needed to resume is already persisted per conversation: `stage`,
`collected_slots` (durable patient memory), `booking_status`, `last_message_at`.
Resume rules when a patient returns after silence:

| Returning after | Persisted state | AI behaviour |
|---|---|---|
| Minutes–hours (same open conversation) | any stage | **Continue exactly where they left off.** Never restart intake, never re-ask anything in `<patient_info>` (prompt already enforces). |
| Any gap | `booking_status = waiting_for_confirmation` (slots were offered) | Re-fetch and **re-present fresh slots** — offered slot ids are single-turn and may be stale; never book against a list from a previous turn. |
| Any gap | `booking_status = booking_in_progress` | Duplicate-protection short-circuit: "we are still booking…" (never a second booking). |
| Any gap | `booking_status = confirmed` | Follow-up mode: answer questions about the existing appointment; reschedule/cancel paths. |
| > 24h (Meta session window expired) | any | Outbound replies now require templates (V2); inbound messages reopen a session normally — greet by name, offer the menu (§3), keep all collected info. |
| Conversation `closed` | — | New conversation, warm "welcome back {name}" + menu; patient record (name, history) persists across conversations. |

Hard rule: **resume never loses collected information** — `collected_slots` outlives
the message-history window by design (KNOWLEDGE_STRUCTURE / SYSTEM_PROMPT
`<patient_info>` contract).

## 8. Rich media flows (Designed)

Requires a per-clinic asset registry (`clinic_assets`: `asset_key`, type, storage URL,
caption — no-code onboarding rule applies; the model only ever references keys).

**Treatment enquiry (e.g. "PRP"):**
```
[send_image      screen: treatment_info  data: { assetKey: "prp_overview" }]
[reply_text      screen: treatment_info  data: { text: high-level explanation }]
[show_buttons    screen: treatment_info  data: { buttons: [Book Appointment] [More questions] }]
```

**Before/after ask:**
```
[send_image   screen: treatment_info  data: { assetKey: "prp_before_after" }]
[show_buttons screen: treatment_info  data: { buttons: [Book Appointment] [Talk to Receptionist] }]
```

Rules: only clinic-approved assets (medical-claims safe); never AI-generated imagery;
captions in the receptionist voice; one media message per turn; always followed by a
clear next step; safety rules unchanged — media never appears on handoff paths.

## 9. Future interactive actions (roadmap hooks)

| Version | Feature | New envelope usage |
|---|---|---|
| V2 | Missed Call Recovery | `send_template` `screen: missed_call_outreach` triggered by telephony webhook |
| V2 | Reminders | `send_template` `screen: reminder` at T-24h / T-2h (scheduled task) |
| V2 | Review Automation | `send_template` + `open_url` `screen: review_request`; unhappy path → `handoff` |
| V3 | Voice Receptionist | Voice renderer for the SAME envelopes — `show_calendar_slots` → read-out options; `show_buttons` → spoken yes/no |
| V4 | Dashboard | Dashboard renderer — screens become queue cards & timeline entries; per-screen analytics |

## 10. Multi-clinic branding (Designed)

Each clinic feels like *their* front desk, not a shared bot. Per-clinic branding lives
in clinic knowledge (no-code onboarding — adding a clinic never touches code):

| Field | Used by | Notes |
|---|---|---|
| `welcome_message` | Main Menu greeting (§3) | Falls back to a warm default with `{{CLINIC_NAME}}` |
| `brand_tone` | System prompt tone block | e.g. "premium & calm" / "friendly & casual" — a *modifier*, never overrides safety or simple-English rules |
| `language` / locale | Prompt + templates | `languages` column exists; Tamil/Tanglish is a V2 roadmap item |
| `timezone` | Scheduling (live) | `clinics.timezone` — already the single source of truth |
| `logo_url`, `primary_color` | Dashboard (V4), web surfaces, PDF headers | WhatsApp itself doesn't render themes; these serve the other channels |

Rule: branding changes are data changes (bump `knowledge_version` for cache
invalidation) — never per-clinic code or prompt forks.
