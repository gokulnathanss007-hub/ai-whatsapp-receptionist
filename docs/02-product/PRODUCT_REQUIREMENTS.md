# PRODUCT_REQUIREMENTS.md — School Parent Enquiry AI WhatsApp Front Office (V1 PRD)

> **Status: historical V1 PRD, preserved in full.** The living product document is
> `PRODUCT.md`; version scope is `PRODUCT_ROADMAP.md`. This PRD remains the authoritative
> record of the original MVP requirements and is unchanged below (reworded to the
> school domain the product now serves; see `../09-changelog/CHANGELOG.md` for the
> clinic → school conversion record).

**Product:** School Parent Enquiry AI — AI WhatsApp Parent Enquiry System (K-12 School MVP)
**Owner:** Gokul (School Parent Enquiry AI)
**Status:** V1 specification (shipped)
**Vertical:** K-12 school admissions

---

## 1. Problem

Small private schools run on a busy front office. Enquiries arrive on WhatsApp at all
hours, especially during admission season; staff are in class, on calls, or off-shift.
The result:

- Enquiries go unanswered for minutes to hours — the parent enquires elsewhere.
- The front office re-answers the same questions (fees, timings, transport, location)
  all day.
- Genuine admission enquiries (which grade, transfer from where) aren't captured or
  qualified.
- No structured record of who asked what, so follow-up is ad hoc.

For a school, an unanswered WhatsApp enquiry is a lost admission and lost multi-year
relationship.

## 2. Solution

A WhatsApp AI front office that responds instantly in the voice of a premium,
well-trained school office. It answers FAQs, qualifies admission enquiries, captures
admission enquiries for staff to confirm, and hands off cleanly whenever a human is
needed. It never promises admission, gives legal/safeguarding advice, or behaves like a
general AI assistant.

## 3. Goals

**Primary goal**
- Convert WhatsApp enquiries into recorded admission enquiries / booked school visits.

**Secondary goals**
- Answer frequently asked questions without staff involvement.
- Reduce front-office workload.
- Collect and structure parent and child information.
- Guide parents through the enquiry journey.
- Escalate to human staff when required.

**Non-goals (explicit)**
- Not an admissions decision-maker or seat-availability guarantor.
- Not a general chatbot; no off-topic conversation.
- Not an auto-confirming booking engine in the MVP (records requests only, unless a
  connected calendar allows real booking — see §9).

## 4. Target User

**Buyer:** Owner/Principal/Correspondent of a private K-12 school (often the Principal
themselves, or an admissions officer/school administrator).

**End users of the chat:**
- *New parent* — evaluating the school for their child, wants to know fees, grade
  availability, transport, timings.
- *Transfer parent* — moving their child from another school, needs the transfer
  process and current-grade fit.
- *Comparison shopper* — comparing schools, needs fast, clear answers.

**Typical school programs/grades the AI must understand** (high level only — never an
admissions-decision level of detail): kindergarten, primary school, middle school, high
school, senior secondary, and any grade-specific streams (e.g. Science/Commerce) the
school offers.

## 5. Functional Requirements

The front office AI must be able to:

1. Greet parents warmly and set school context.
2. Answer fee-structure questions (from school knowledge — fees vary by grade, never a
   single invented number).
3. Share school timings, location, transport, and facilities information.
4. Explain available programs/grades at a **high level only**.
5. Qualify leads by collecting the right details per enquiry (see §7).
6. Capture admission **enquiries** (parent name, child name, grade applying for,
   preferred date, preferred time, reason). The mobile number is never asked for — it
   is taken automatically from the parent's WhatsApp number.
7. Handle new parents and transfer/returning parents differently.
8. Answer structured FAQs (fees, timings, transport, holidays & events, facilities,
   certificates, location, payment methods, follow-up policy).
9. Handle cancellation and rescheduling requests for a school visit (captured for
   staff).
10. Escalate to a human on defined triggers (see §8).
11. Operate in English, with the design allowing multilingual expansion later.

## 6. Behavioural Requirements (summary — full spec in AI_RECEPTIONIST_SPEC.md)

**Tone:** warm, professional, calm, helpful, human, short. Prefer 2–3 short sentences.
Never robotic, never salesy, never pushy.

**Hard prohibitions — the AI must never:**
- Guarantee, promise, or imply that admission or a seat is confirmed.
- Quote a fee, seat availability, or a cutoff/date not in school knowledge.
- Promise or guarantee any result, timeline, or outcome.
- Act as the Principal or Admissions Officer, or make an admissions decision itself.
- Give legal, disciplinary, or custody advice, or attempt to resolve a child-safety or
  family-sensitive matter itself.
- Invent information.
- Discuss politics, coding, math, history, or any topic outside the school.
- Reveal it is an AI or behave like a general assistant.

**When unsure:** "I'll connect you with our school office."

## 7. Lead Qualification Rules

Instead of booking immediately, collect useful information first, then offer a visit.

- **Admission enquiry:** parent's name, child's name, age, gender, grade applying for,
  previous school (if a transfer), preferred visit time.
- **General visit request:** name, child's name, grade applying for, preferred date,
  preferred time, reason for the visit. Mobile number is never asked for — it comes
  from the parent's WhatsApp number automatically.

Collection should feel conversational — one question at a time, not a form dump.

## 8. Escalation / Human Handoff

The AI hands off immediately when a message involves:
- A sensitive or family-specific matter (custody, disciplinary issues, bullying, a
  child-safety concern)
- A complaint
- A billing issue
- A refund
- An urgent safety concern
- A legal issue
- Any question it cannot answer from school knowledge

Handoff message pattern: *"I will connect you with our school office team."* The
conversation is flagged for staff; the AI does not attempt to resolve.

## 9. Admission Visit Handling

The AI collects the admission enquiry and records it. It must **not** confirm a school
visit unless the school's rules explicitly allow auto-confirmation via a connected
Google Calendar. Default response:

> "Perfect! I've recorded your enquiry. Our school office will confirm your visit
> shortly."

## 10. Non-Functional Requirements

- **Latency:** first reply within a few seconds of the inbound message.
- **Reliability:** webhook acks fast; reply pipeline is idempotent and retry-safe.
- **Multi-tenancy:** each school's data isolated; onboarding a school requires no code
  change.
- **Cost:** replies use free-form messages inside the 24h service window (no template
  cost); AI cost minimised via prompt caching.
- **Safety:** fail closed — on any generation error or ambiguity, hand off to staff.
- **Privacy:** parent/child data stored per-school, only necessary PII collected.

## 11. Success Metrics (MVP)

- **Response coverage:** % of inbound enquiries answered by the AI without staff.
  Target: high.
- **Enquiry → admission-enquiry conversion rate.**
- **Median first-response time** (seconds).
- **Handoff rate** and handoff reasons (should trend down as knowledge improves, but
  never at the expense of safety).
- **Containment quality:** % of AI answers rated correct/appropriate on staff review.

## 12. Deliverables

The complete design set: `/CLAUDE.md`, `PRODUCT_REQUIREMENTS.md`,
`../03-engineering/AI_RECEPTIONIST_SPEC.md`, `CONVERSATION_FLOWS.md`,
`../FAQ_SCHEMA.json`, `INTENTS.md`, `../03-engineering/SYSTEM_PROMPT.md`,
`../03-engineering/KNOWLEDGE_STRUCTURE.md`, `../03-engineering/PROJECT_ARCHITECTURE.md`,
`PRODUCT_ROADMAP.md`.
