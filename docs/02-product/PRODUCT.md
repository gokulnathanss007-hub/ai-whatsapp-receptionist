# PRODUCT.md — The School Parent Enquiry AI Product Bible

> Single source of truth for **what the product is and how it behaves**, across all
> versions. Detail is delegated: flows → `CONVERSATION_FLOWS.md`, intents → `INTENTS.md`,
> journeys → `USER_JOURNEY.md`, feature catalog → `FEATURES.md`, screens/UX →
> `UI_FLOWS.md`, shipping bars → `ACCEPTANCE_CRITERIA.md`, versions →
> `PRODUCT_ROADMAP.md`. Behavioural contract (safety-binding) →
> `../03-engineering/AI_RECEPTIONIST_SPEC.md`. The V1 PRD is preserved verbatim as
> `PRODUCT_REQUIREMENTS.md` (historical; this file supersedes it as the living doc).

---

## 1. Problem statement

Small private schools run on a busy front office. Enquiries arrive on WhatsApp (and as
phone calls) at all hours, especially during admission season; staff are in class,
on calls, or off-shift. Result:

- Enquiries unanswered for minutes-to-hours — the parent enquires at a competing school.
- The front office re-answers the same questions (fees, timings, transport, location) all
  day.
- High-intent admission enquiries (which grade, transfer from where) aren't captured or
  qualified.
- Missed calls vanish without a trace; cold enquiries go unmanaged; parents who visited
  are never followed up with; happy parents are never asked for a referral or review.
- No structured record of who asked what — follow-up is ad hoc.

Every one of these is a lost admission and lost multi-year relationship. The front office
is the school's enquiry bottleneck.

## 2. Product vision

**The AI School Growth System:** an AI layer that owns the school's entire
parent-enquiry funnel — answer every enquiry, qualify every lead, book every school
visit, recover every missed call, remind every parent, collect every review, re-engage
every lapsed enquiry. WhatsApp first (where Indian parents already are), voice next,
dashboard on top.

**One-line pitch (V1):** Every enquiry a school misses on WhatsApp is a lost admission.
School Parent Enquiry AI answers every one, instantly, in the voice of a premium front
office.

## 3. MVP (V1 — live)

A WhatsApp AI parent-enquiry system for K-12 schools that:
- Replies within seconds, warm and human, 24/7 — inbound conversations only.
- Answers FAQs (fees, timings, transport, holidays, facilities, location, certificates)
  from a per-school knowledge base.
- Qualifies admission enquiries (parent + child details, grade applying for, one
  question at a time).
- Books real, calendar-checked school visits when the school has Google Calendar
  connected (`auto_confirm_enabled`), or records admission **enquiries** for staff
  confirmation otherwise.
- Hands off to a human the moment a message is a sensitive matter, a complaint,
  billing/refund, an urgent safety concern, legal, or unknown.
- Never promises admission or a seat, gives legal/safeguarding advice, invents facts, or
  reveals it is an AI.

MVP success definition, scope boundaries, and functional requirements are preserved in
`PRODUCT_REQUIREMENTS.md` (V1 PRD).

## 4. Current features (V1) and future features (V2–V4)

Authoritative catalog with per-feature detail: `FEATURES.md`. Version gates:

- **Version 1 — AI WhatsApp Parent Enquiry System (live):** inbound WhatsApp AI front
  office · FAQ answering · lead qualification · admission-enquiry capture · Google
  Calendar integration with race-safe auto-booking · human handoff · multi-tenant
  no-code onboarding · English.
- **Version 2 — School Growth System:** Interactive WhatsApp Experience (buttons, lists,
  location, media) · Visit Management (cancel/reschedule closed loop, reminders) ·
  Missed Call Recovery · Review Automation · Tamil/Tanglish · basic school view.
- **Version 3 — AI Voice Front Office:** the school's phone answered by AI; voice ↔
  WhatsApp continuity (one parent timeline); voice-grade safety handoff.
- **Version 4 — Complete School Growth Platform:** Dashboard · Analytics · Parent
  Re-engagement · Follow-up Automation · Multi-school Management · self-serve knowledge
  editing.

## 5. User personas

**Buyer:** school principal/correspondent or admissions officer — see `../01-company/ICP.md`.

**Parent-side personas**
1. **New parent (Priya, evaluating Grade 1):** found the school on Google/referral;
   messages at 9 PM; wants fees + "is a seat available"; visits if answered fast and
   warmly.
2. **Transfer parent (Ravi, moving his child mid-year):** has a transfer-process
   question; needs certificates info and to know which grade his child fits; effortless
   rebooking of a visit if the first one didn't work out.
3. **Comparison shopper (Anitha, comparing three schools):** messaging multiple schools;
   converts on speed, clarity, and a concrete bookable visit time.
4. **Sensitive-matter parent (safety/family-specific):** "my child is being bullied" —
   must be handled with care and escalated instantly, never resolved by the AI itself.

**Staff-side persona:** the school office/front office team — owns the handoff queue;
must trust that the AI only escalates what genuinely needs a human, and that everything
else is silently done.

**Worked example (canonical, used across docs):** Sunrise Public School (Madurai) —
Mrs. Kavitha Raman (Principal) and Mr. Arun Kumar (Admissions Officer) — see
`supabase/seed/sunrise_public_school.sql`.

## 6. Parent journey & school journey (pointer)

End-to-end journeys — enquiry→visit for parents; onboarding→renewal for schools — are
owned by `USER_JOURNEY.md`.

## 7. Conversation principles

The front office's voice is the product. Binding rules (enforced in
`../03-engineering/AI_RECEPTIONIST_SPEC.md` and the production prompt):

1. Warm, professional, calm, helpful, human, **short** (2–3 sentences).
2. Simple everyday words — every parent understands on the first read.
3. **One question at a time.** Never a form, never an interrogation.
4. Acknowledge, then act. Use the school's and parent's names naturally.
5. Answer first, then invite the next step (never skip to qualifying before the
   parent's question is answered).
6. Never re-ask what is already known (`<parent_info>` durable state).
7. Describe what's on offer; only the admissions office decides (program/grade talk
   stays high-level, never an admissions decision).
8. When unsure: "I'll connect you with our school office."
9. Never salesy, never pushy, never robotic — and never reveals it is an AI.

These principles apply to **every channel** — interactive messages (V2) and voice (V3)
change the medium, never the manners.

## 8. Interactive WhatsApp design (V2 — pointer)

Buttons, lists, location, media, and the decision tree for when the AI uses each are
specified in `../03-engineering/PATIENT_EXPERIENCE.md`; parent-facing UX flows in
`UI_FLOWS.md`. Core product rule: interactivity reduces typing, never adds friction —
every interactive message must remain answerable by plain text.

## 9. Human handoff rules

The AI hands off **immediately** on: a sensitive or family-specific matter (custody,
disciplinary issues, bullying, a child-safety concern) · complaint · billing issue ·
refund · urgent safety concern (with an urge to contact the school office directly by
phone, no safeguarding instructions) · legal issue · explicit request for a human · any
in-context question not answerable from school knowledge.

The AI **never** hands off for: FAQs, visit booking, rescheduling — those are its job
start to finish. Handoff line: *"I will connect you with our school office team."* After
handoff the conversation is flagged (`human_handoff = true` + reason code), the AI stops
attempting to resolve, and staff take over. Escalation logic and reason codes:
`../03-engineering/AI_RECEPTIONIST_SPEC.md` §8, `INTENTS.md`.

## 10. Booking flow (summary — full detail `CONVERSATION_FLOWS.md` §2, §2b)

Two paths, selected automatically per school:

- **Calendar path** (Google Calendar connected + `auto_confirm_enabled`): qualify →
  backend computes real availability (working hours ∩ calendar free/busy ∩ existing
  bookings) → AI presents real slots → parent picks → Postgres-mutex booking → calendar
  event → confirmed message. Conflicts produce an honest "just taken — here's what's
  open" with fresh slots.
- **Request path** (no calendar): collect name, grade applying for, date, time, reason
  (never the mobile number — WhatsApp provides it) → summary → "our school office will
  confirm shortly" → staff confirm.

## 11. Review flow (V2 — design intent)

After a completed school visit, send a template message thanking the parent and
requesting a Google review (deep link). Rules: opt-in respected; one ask per visit;
unhappy signals divert to a private feedback capture + staff alert instead of a public
review ask; fully automated via scheduled sweeps. Detail lands in `FEATURES.md` §V2 as
it is built.

## 12. Reminder flow (V2 — design intent)

T-24h and T-2h reminders for confirmed school visits (template messages, opt-in),
reschedule/cancel handled in-thread by the AI (closing the visit-management loop).
No-show reduction is the KPI.

## 13. Missed call recovery flow (V2 — design intent)

School's number misses a call (busy/after hours) → telephony provider webhook (Exotel
seam) → within seconds the AI opens a WhatsApp thread: "Sorry we missed your call — how
can we help?" → normal front-office flow takes over. The missed call becomes a
qualified, booked enquiry instead of a competing school's admission.

## 14. Voice front office flow (V3 — design intent)

Inbound call → AI answers in the school's voice → same brain (intents, knowledge,
booking, safety rails) through a voice provider seam → bookings identical to WhatsApp
path → conversation summary lands in the same parent timeline; escalation = warm
transfer to staff + WhatsApp follow-up. Voice never gets looser safety rules than chat.

## 15. Acceptance criteria & definition of done (pointer)

Per-feature acceptance criteria and the global Definition of Done are owned by
`ACCEPTANCE_CRITERIA.md`. Nothing ships without meeting its bar there.
