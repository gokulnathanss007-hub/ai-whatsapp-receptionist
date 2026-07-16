# USER_JOURNEY.md — Patient & Clinic Journeys

> Owns end-to-end journeys. Conversation-level detail: `CONVERSATION_FLOWS.md`.
> Personas: `PRODUCT.md` §5. Buyer profile: `../01-company/ICP.md`.

---

## 1. Patient journey (V1, live)

### 1.1 New patient — enquiry to booked consultation

| Stage | Patient experience | System behaviour |
|---|---|---|
| Discover | Finds clinic on Instagram/Google/referral; taps WhatsApp | — |
| First contact | "Hi" / "acne treatment cost?" at any hour | Webhook ack <1s; reply in seconds |
| Greeting | Warm welcome in clinic's name; asked their name | Stage `greeting`; name → `collected_slots` |
| Question answered | Fee/timings answered plainly, then invited to book | FAQ from knowledge block; never invented |
| Qualification | 1–2 concern-specific questions, one per message | Stage `qualifying`; slots accumulate in `<patient_info>`, never re-asked |
| Booking | Real available times offered (calendar clinics) or preferences collected (request clinics) | Stage `booking`; slots computed from `opening_hours` ∩ calendar ∩ bookings |
| Confirmation | "You're booked for tomorrow 10 AM" or "staff will confirm shortly" | Postgres-mutex booking + calendar event, or `appointment_request` recorded |
| Reminder (V2) | T-24h/T-2h reminder; can reschedule in-thread | Template message; appointment management loop |
| Visit | Arrives; front desk already has name/concern/history | Staff view (V2) / dashboard (V4) |
| Review (V2) | Post-visit thank-you + review link | Review automation; unhappy → private feedback |
| Reactivation (V4) | Months later: relevant, respectful win-back nudge | Opt-in reactivation campaign |

### 1.2 Returning patient
Recognised continuity ("Good to hear from you again"); clinical post-procedure
questions → handoff to doctor; rebooking → straight to booking flow with known details.

### 1.3 Escalation journeys (safety-critical)
- **Medical/emergency:** instant handoff; emergencies additionally urged to seek
  immediate in-person care (no medical instructions). Staff alerted with reason code.
- **Complaint/billing/refund:** brief empathy → handoff → staff resolve in-thread.
- The patient never feels "bounced": one handoff line, then a human continues in the
  same WhatsApp thread.

### 1.4 Missed-call patient (V2)
Calls clinic → no answer → within seconds receives WhatsApp: "Sorry we missed your
call — how can we help?" → continues as §1.1 from Greeting.

### 1.5 Voice patient (V3)
Calls clinic → AI answers → same journey as §1.1 by voice → booking confirmed verbally +
WhatsApp confirmation message → summary in the same patient timeline.

## 2. Clinic journey (customer lifecycle)

| Stage | Experience | Owner/notes |
|---|---|---|
| Demo | Prospect messages a live pilot clinic's WhatsApp; watches the AI qualify + book them | GTM: the demo is the product (`../01-company/BUSINESS.md` §9) |
| Onboarding (same-day) | 30-min call → we create profile, doctors, services, FAQs, hours as records; map WhatsApp number; optionally connect Google Calendar (OAuth) | No code, no deploy (CLAUDE.md §7); `knowledge_version = 1` |
| Go-live | AI answers the clinic's number; staff trained on the handoff queue | Staff must own handoffs (ICP disqualifier otherwise) |
| Week 1 health check | We review handoff reasons + knowledge gaps; edit records; bump `knowledge_version` | Customer success (`BUSINESS.md` §11) |
| Steady state | Monthly enquiry report: enquiries answered, requests captured, bookings made | Renewal engine |
| Expansion | Calendar auto-booking → V2 growth modules → voice → platform | Module ladder (`../01-company/REVENUE_MODEL.md` §3) |
| Renewal | ROI self-evident from booked-consultation metrics | V4 analytics makes this self-serve |

## 3. Journey principles

1. **Speed is the first feature** — every journey begins with an answer in seconds.
2. **No dead ends** — every path terminates in a booking, a recorded request, or a
   flagged human handoff. Silence is a defect.
3. **One timeline per patient** — every channel (WhatsApp, missed call, voice) writes to
   the same patient record; the clinic sees one story (fully realised V3).
4. **The patient talks to the clinic**, never to "a bot" — across all versions.
