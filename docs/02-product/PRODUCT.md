# PRODUCT.md — The Medixum AI Product Bible

> Single source of truth for **what the product is and how it behaves**, across all
> versions. Detail is delegated: flows → `CONVERSATION_FLOWS.md`, intents → `INTENTS.md`,
> journeys → `USER_JOURNEY.md`, feature catalog → `FEATURES.md`, screens/UX →
> `UI_FLOWS.md`, shipping bars → `ACCEPTANCE_CRITERIA.md`, versions →
> `PRODUCT_ROADMAP.md`. Behavioural contract (safety-binding) →
> `../03-engineering/AI_RECEPTIONIST_SPEC.md`. The V1 PRD is preserved verbatim as
> `PRODUCT_REQUIREMENTS.md` (historical; this file supersedes it as the living doc).

---

## 1. Problem statement

Small private clinics run on a busy front desk. Enquiries arrive on WhatsApp (and as
phone calls) at all hours; staff are with patients, on calls, or off-shift. Result:

- Enquiries unanswered for minutes-to-hours — the patient books elsewhere.
- The receptionist re-answers the same questions (fees, timings, location) all day.
- High-intent treatment enquiries (acne, hair fall, pigmentation) aren't captured or
  qualified.
- Missed calls vanish without a trace; no-shows go unmanaged; lapsed patients are never
  reactivated; happy patients are never asked for reviews.
- No structured record of who asked what — follow-up is ad hoc.

Every one of these is a lost consultation and lost lifetime value. The front desk is the
clinic's revenue bottleneck.

## 2. Product vision

**The AI Clinic Growth System:** an AI layer that owns the clinic's entire
patient-acquisition funnel — answer every enquiry, qualify every lead, book every
appointment, recover every missed call, remind every patient, collect every review,
reactivate every lapsed patient. WhatsApp first (where Indian patients already are),
voice next, dashboard on top.

**One-line pitch (V1):** Every enquiry a clinic misses on WhatsApp is a lost
consultation. Medixum AI answers every one, instantly, in the voice of a premium front
desk.

## 3. MVP (V1 — live)

A WhatsApp AI receptionist for dermatology & cosmetology clinics that:
- Replies within seconds, warm and human, 24/7 — inbound conversations only.
- Answers FAQs (fees, timings, location, parking, doctors, treatments, policies) from a
  per-clinic knowledge base.
- Qualifies treatment enquiries (concern-specific questions, one at a time).
- Books real, calendar-checked appointments when the clinic has Google Calendar
  connected (`auto_confirm_enabled`), or records appointment **requests** for staff
  confirmation otherwise.
- Hands off to a human the moment a message is medical, a complaint, billing/refund,
  emergency, legal, or unknown.
- Never diagnoses, prescribes, promises outcomes, invents facts, or reveals it is an AI.

MVP success definition, scope boundaries, and functional requirements are preserved in
`PRODUCT_REQUIREMENTS.md` (V1 PRD).

## 4. Current features (V1) and future features (V2–V4)

Authoritative catalog with per-feature detail: `FEATURES.md`. Version gates:

- **Version 1 — AI WhatsApp Receptionist (live):** inbound WhatsApp AI receptionist ·
  FAQ answering · lead qualification · appointment-request capture · Google Calendar
  integration with race-safe auto-booking · human handoff · multi-tenant no-code
  onboarding · English.
- **Version 2 — Clinic Growth System:** Interactive WhatsApp Experience (buttons, lists,
  location, media) · Appointment Management (cancel/reschedule closed loop, reminders) ·
  Missed Call Recovery · Review Automation · Tamil/Tanglish · basic clinic view.
- **Version 3 — AI Voice Receptionist:** the clinic's phone answered by AI; voice ↔
  WhatsApp continuity (one patient timeline); voice-grade safety handoff.
- **Version 4 — Complete Clinic Growth Platform:** Dashboard · Analytics · Patient
  Reactivation · Follow-up Automation · Multi-clinic Management · self-serve knowledge
  editing.

## 5. User personas

**Buyer:** clinic owner/practice manager — see `../01-company/ICP.md`.

**Patient-side personas**
1. **New patient (Priya, 24, acne):** found the clinic on Instagram/Google; messages at
   10 PM; wants fee + "can this be fixed"; books if answered fast and warmly.
2. **Returning patient (Ravi, 31, post-peel):** has a care question a week after a
   procedure — clinical questions must reach the doctor (handoff), rebooking must be
   effortless.
3. **Shopper (Anitha, 28, laser):** messaging four clinics; converts on speed, clarity,
   and a concrete bookable slot.
4. **Anxious patient (emergency-adjacent):** "my face is swelling" — must be urged to
   immediate care and escalated instantly, never advised.

**Staff-side persona:** the receptionist — owns the handoff queue; must trust that the
AI only escalates what genuinely needs a human, and that everything else is silently done.

## 6. Patient journey & clinic journey (pointer)

End-to-end journeys — enquiry→visit for patients; onboarding→renewal for clinics — are
owned by `USER_JOURNEY.md`.

## 7. Conversation principles

The receptionist's voice is the product. Binding rules (enforced in
`../03-engineering/AI_RECEPTIONIST_SPEC.md` and the production prompt):

1. Warm, professional, calm, helpful, human, **short** (2–3 sentences).
2. Simple everyday words — every patient understands on the first read.
3. **One question at a time.** Never a form, never an interrogation.
4. Acknowledge, then act. Use the clinic's and patient's names naturally.
5. Answer first, then invite the next step (never skip to qualifying before the
   patient's question is answered).
6. Never re-ask what is already known (`<patient_info>` durable state).
7. Describe the menu; only the doctor decides the dish (treatment talk stays
   high-level).
8. When unsure: "I'll connect you with our clinic staff."
9. Never salesy, never pushy, never robotic — and never reveals it is an AI.

These principles apply to **every channel** — interactive messages (V2) and voice (V3)
change the medium, never the manners.

## 8. Interactive WhatsApp design (V2 — pointer)

Buttons, lists, location, media, and the decision tree for when the AI uses each are
specified in `../03-engineering/INTERACTIVE_WHATSAPP.md`; patient-facing UX flows in
`UI_FLOWS.md`. Core product rule: interactivity reduces typing, never adds friction —
every interactive message must remain answerable by plain text.

## 9. Human handoff rules

The AI hands off **immediately** on: medical advice/symptom interpretation · complaint ·
billing issue · refund · emergency (with an urge to seek immediate care, no medical
instructions) · legal issue · explicit request for a human · any in-context question not
answerable from clinic knowledge.

The AI **never** hands off for: FAQs, booking, rescheduling — those are its job start to
finish. Handoff line: *"I will connect you with our clinic team. They will reply to you
here soon."* After handoff the conversation is flagged (`human_handoff = true` + reason
code), the AI stops attempting to resolve, and staff take over. Escalation logic and
reason codes: `../03-engineering/AI_RECEPTIONIST_SPEC.md` §8, `INTENTS.md`.

## 10. Booking flow (summary — full detail `CONVERSATION_FLOWS.md` §2, §2b)

Two paths, selected automatically per clinic:

- **Calendar path** (Google Calendar connected + `auto_confirm_enabled`): qualify →
  backend computes real availability (working hours ∩ calendar free/busy ∩ existing
  bookings) → AI presents real slots → patient picks → Postgres-mutex booking → calendar
  event → confirmed message. Conflicts produce an honest "just taken — here's what's
  open" with fresh slots.
- **Request path** (no calendar): collect name, date, time, reason (never the mobile
  number — WhatsApp provides it) → summary → "our clinic will confirm shortly" → staff
  confirm.

## 11. Review flow (V2 — design intent)

After a completed visit, send a template message thanking the patient and requesting a
Google review (deep link). Rules: opt-in respected; one ask per visit; unhappy signals
divert to a private feedback capture + staff alert instead of a public review ask;
fully automated via scheduled sweeps. Detail lands in `FEATURES.md` §V2 as it is built.

## 12. Reminder flow (V2 — design intent)

T-24h and T-2h reminders for confirmed appointments (template messages, opt-in),
reschedule/cancel handled in-thread by the AI (closing the appointment-management loop).
No-show reduction is the KPI.

## 13. Missed call recovery flow (V2 — design intent)

Clinic's number misses a call (busy/after hours) → telephony provider webhook (Exotel
seam) → within seconds the AI opens a WhatsApp thread: "Sorry we missed your call —
how can we help?" → normal receptionist flow takes over. The missed call becomes a
qualified, booked enquiry instead of a competitor's patient.

## 14. Voice receptionist flow (V3 — design intent)

Inbound call → AI answers in the clinic's voice → same brain (intents, knowledge,
booking, safety rails) through a voice provider seam → bookings identical to WhatsApp
path → conversation summary lands in the same patient timeline; escalation = warm
transfer to staff + WhatsApp follow-up. Voice never gets looser safety rules than chat.

## 15. Acceptance criteria & definition of done (pointer)

Per-feature acceptance criteria and the global Definition of Done are owned by
`ACCEPTANCE_CRITERIA.md`. Nothing ships without meeting its bar there.
