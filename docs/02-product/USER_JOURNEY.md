# USER_JOURNEY.md — Parent & School Journeys

> Owns end-to-end journeys. Conversation-level detail: `CONVERSATION_FLOWS.md`.
> Personas: `PRODUCT.md` §5. Buyer profile: `../01-company/ICP.md`.

---

## 1. Parent journey (V1, live)

### 1.1 New parent — enquiry to booked school visit

| Stage | Parent experience | System behaviour |
|---|---|---|
| Discover | Finds school on Google/referral/signboard; taps WhatsApp | — |
| First contact | "Hi" / "admission for grade 3?" at any hour | Webhook ack <1s; reply in seconds |
| Greeting | Warm welcome in school's name; asked their name | Stage `greeting`; name → `collected_slots` |
| Question answered | Fee/timings answered plainly, then invited to enquire further | FAQ from knowledge block; never invented |
| Qualification | 1–2 questions per turn (child's name, grade applying for) | Stage `qualifying`; slots accumulate in `<parent_info>`, never re-asked |
| Booking | Real available times offered (calendar schools) or preferences collected (request schools) | Stage `booking`; slots computed from `opening_hours` ∩ calendar ∩ bookings |
| Confirmation | "You're booked for tomorrow 10 AM" or "our office will confirm shortly" | Postgres-mutex booking + calendar event, or `admission_enquiry` recorded |
| Reminder (V2) | T-24h/T-2h reminder; can reschedule in-thread | Template message; visit management loop |
| Visit | Arrives; front office already has parent/child name and grade | Staff view (V2) / dashboard (V4) |
| Review (V2) | Post-visit thank-you + review link | Review automation; unhappy → private feedback |
| Re-engagement (V4) | Months later: relevant, respectful win-back nudge | Opt-in re-engagement campaign |

### 1.2 Transfer parent
Recognised continuity ("Good to hear from you again"); sensitive family-specific
questions (custody, disciplinary history) → handoff to staff; rebooking a visit → straight
to booking flow with known details.

### 1.3 Escalation journeys (safety-critical)
- **Sensitive matter / urgent safety concern:** instant handoff; urgent safety concerns
  additionally urged to contact the school office directly by phone (no safeguarding
  instructions). Staff alerted with reason code.
- **Complaint/billing/refund:** brief empathy → handoff → staff resolve in-thread.
- The parent never feels "bounced": one handoff line, then a human continues in the
  same WhatsApp thread.

### 1.4 Missed-call parent (V2)
Calls school → no answer → within seconds receives WhatsApp: "Sorry we missed your
call — how can we help?" → continues as §1.1 from Greeting.

### 1.5 Voice parent (V3)
Calls school → AI answers → same journey as §1.1 by voice → visit confirmed verbally +
WhatsApp confirmation message → summary in the same parent timeline.

## 2. School journey (customer lifecycle)

| Stage | Experience | Owner/notes |
|---|---|---|
| Demo | Prospect messages a live pilot school's WhatsApp; watches the AI qualify + route them to a visit | GTM: the demo is the product (`../01-company/BUSINESS.md` §9) |
| Onboarding (same-day) | 30-min call → we create profile, staff, services/grades, FAQs, hours as records; map WhatsApp number; optionally connect Google Calendar (OAuth) | No code, no deploy (`/CLAUDE.md` §6); `knowledge_version = 1` |
| Go-live | AI answers the school's number; staff trained on the handoff queue | Staff must own handoffs (ICP disqualifier otherwise) |
| Week 1 health check | We review handoff reasons + knowledge gaps; edit records; bump `knowledge_version` | Customer success (`BUSINESS.md` §11) |
| Steady state | Monthly enquiry report: enquiries answered, requests captured, visits booked | Renewal engine |
| Expansion | Calendar auto-booking → V2 growth modules → voice → platform | Module ladder (`../01-company/REVENUE_MODEL.md` §3) |
| Renewal | ROI self-evident from qualified-enquiry metrics | V4 analytics makes this self-serve |

## 3. Journey principles

1. **Speed is the first feature** — every journey begins with an answer in seconds.
2. **No dead ends** — every path terminates in a booking, a recorded enquiry, or a
   flagged human handoff. Silence is a defect.
3. **One timeline per parent** — every channel (WhatsApp, missed call, voice) writes to
   the same parent record; the school sees one story (fully realised V3).
4. **The parent talks to the school**, never to "a bot" — across all versions.
