# PRODUCT_REQUIREMENTS.md — Medixum AI WhatsApp Receptionist (V1 PRD)

> **Status: historical V1 PRD, preserved in full.** The living product document is
> `PRODUCT.md`; version scope is `PRODUCT_ROADMAP.md`. This PRD remains the authoritative
> record of the original MVP requirements and is unchanged below.

**Product:** Medixum AI — AI WhatsApp Receptionist (Dermatology & Cosmetology MVP)
**Owner:** Gokul (Medixum AI)
**Status:** V1 specification (shipped)
**Vertical:** Dermatology & cosmetology clinics

---

## 1. Problem

Small dermatology and cosmetology clinics run on a busy front desk. Enquiries arrive on
WhatsApp at all hours; staff are with patients, on calls, or off-shift. The result:

- Enquiries go unanswered for minutes to hours — the patient books elsewhere.
- The receptionist re-answers the same questions (fees, timings, location) all day.
- Genuine treatment enquiries (acne, hair fall, pigmentation) aren't captured or qualified.
- No structured record of who asked what, so follow-up is ad hoc.

For a clinic, an unanswered WhatsApp enquiry is a lost consultation and lost lifetime value.

## 2. Solution

A WhatsApp AI receptionist that responds instantly in the voice of a premium, well-trained
clinic front desk. It answers FAQs, qualifies treatment enquiries, captures appointment
requests for staff to confirm, and hands off cleanly whenever a human is needed. It never
diagnoses, prescribes, or behaves like a general AI assistant.

## 3. Goals

**Primary goal**
- Convert WhatsApp enquiries into booked consultation requests.

**Secondary goals**
- Answer frequently asked questions without staff involvement.
- Reduce receptionist workload.
- Collect and structure patient information.
- Guide patients through the enquiry journey.
- Escalate to human staff when required.

**Non-goals (explicit)**
- Not a medical adviser, symptom checker, or diagnostic tool.
- Not a general chatbot; no off-topic conversation.
- Not an auto-confirming booking engine in the MVP (records requests only).

## 4. Target User

**Buyer:** Owner or manager of a private dermatology/cosmetology clinic (often the
dermatologist themselves, or a practice manager).

**End users of the chat:**
- *New patient* — has a skin/hair concern, wants to know fees, treatments, availability.
- *Returning / follow-up patient* — post-treatment questions, rebooking.
- *Price/information shopper* — comparing clinics, needs fast, clear answers.

**Typical clinic services the AI must understand** (high level only — never clinical depth):
acne, acne scars, pigmentation, melasma, hair fall, PRP, GFC, hair transplant, laser hair
reduction, anti-aging, Botox, fillers, skin rejuvenation, chemical peel, HydraFacial, wart
removal, mole removal, nail disorders, eczema, psoriasis, vitiligo, fungal infections.

## 5. Functional Requirements

The receptionist must be able to:

1. Greet patients warmly and set clinic context.
2. Answer consultation-fee questions (from clinic knowledge).
3. Share clinic timings, location, and parking information.
4. Explain available treatments at a **high level only**.
5. Qualify leads by collecting the right details per enquiry type (see §7).
6. Capture appointment **requests** (name, preferred doctor, date, time, reason). The mobile
   number is never asked for — it is taken automatically from the patient's WhatsApp number.
7. Handle new patients and follow-up/returning patients differently.
8. Answer structured FAQs (fees, timings, parking, insurance, maps, doctors, treatments,
   payment methods, follow-up policy, cancellation, rescheduling).
9. Handle cancellation and rescheduling requests (captured for staff).
10. Escalate to a human on defined triggers (see §8).
11. Operate in English, with the design allowing multilingual expansion later.

## 6. Behavioural Requirements (summary — full spec in AI_RECEPTIONIST_SPEC.md)

**Tone:** warm, professional, calm, helpful, human, short. Prefer 2–3 short sentences.
Never robotic, never salesy, never pushy.

**Hard prohibitions — the AI must never:**
- Diagnose diseases.
- Prescribe medicines.
- Promise or guarantee treatment results/outcomes.
- Replace a dermatologist or give emergency advice.
- Invent information.
- Discuss politics, coding, math, history, or any topic outside the clinic.
- Reveal it is an AI or behave like a general assistant.

**When unsure:** "I'll connect you with our clinic staff."

## 7. Lead Qualification Rules

Instead of booking immediately, collect useful information first, then offer slots.

- **Acne:** name, age, gender, duration, previous treatment, preferred consultation time,
  preferred doctor (optional).
- **Hair fall:** gender, age, duration, current medications, previous treatments, preferred
  consultation time.
- **Pigmentation:** affected area, duration, previous treatments, preferred consultation time.
- **General appointment:** name, preferred doctor, preferred date, preferred time,
  reason for visit. Mobile number is never asked for — it comes from the patient's WhatsApp
  number automatically.

Collection should feel conversational — one or two questions at a time, not a form dump.

## 8. Escalation / Human Handoff

The AI hands off immediately when a message involves:
- Medical advice or symptom interpretation
- A complaint
- A billing issue
- A refund
- An emergency
- A legal issue
- Any question it cannot answer from clinic knowledge

Handoff message pattern: *"I'll forward this to our clinic staff. They'll assist you
shortly."* The conversation is flagged for staff; the AI does not attempt to resolve.

## 9. Appointment Handling

The AI collects the appointment request and records it. It must **not** confirm an
appointment unless the clinic's rules explicitly allow auto-confirmation. Default response:

> "Thank you. Your appointment request has been recorded. Our clinic will confirm your
> appointment shortly."

## 10. Non-Functional Requirements

- **Latency:** first reply within a few seconds of the inbound message.
- **Reliability:** webhook acks fast; reply pipeline is idempotent and retry-safe.
- **Multi-tenancy:** each clinic's data isolated; onboarding a clinic requires no code change.
- **Cost:** replies use free-form messages inside the 24h service window (no template cost);
  AI cost minimised via prompt caching.
- **Safety:** fail closed — on any generation error or ambiguity, hand off to staff.
- **Privacy:** patient data stored per-clinic; only necessary PII collected.

## 11. Success Metrics (MVP)

- **Response coverage:** % of inbound enquiries answered by the AI without staff. Target: high.
- **Enquiry → appointment-request conversion rate.**
- **Median first-response time** (seconds).
- **Handoff rate** and handoff reasons (should trend down as knowledge improves, but never
  at the expense of safety).
- **Containment quality:** % of AI answers rated correct/appropriate on staff review.

## 12. Deliverables

The complete design set: `CLAUDE.md`, `PRODUCT_REQUIREMENTS.md`, `AI_RECEPTIONIST_SPEC.md`,
`CONVERSATION_FLOWS.md`, `FAQ_SCHEMA.json`, `INTENTS.md`, `SYSTEM_PROMPT.md`,
`KNOWLEDGE_STRUCTURE.md`, `PROJECT_ARCHITECTURE.md`, `DEVELOPMENT_ROADMAP.md`.
