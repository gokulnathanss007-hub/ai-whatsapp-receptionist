# ICP.md — Ideal Customer Profile

> Source of truth for who we sell to. `BUSINESS.md` references this; product personas
> (patient-side) live in `docs/02-product/PRODUCT.md` §User Personas.

---

## 1. Primary ICP (V1–V2): Private dermatology & cosmetology clinics, India

**Firmographics**
- Single-location private clinic (1–3 doctors), owner-operated.
- Tier 1/2/3 Indian cities; pilot base: Tamil Nadu (Madurai pilot: Glow Skin Clinic).
- 20–80 WhatsApp enquiries/day; consultation fee ₹300–₹1,000; procedure tickets
  ₹3,000–₹1,50,000 (hair transplant, laser packages).
- Front desk: 1–2 receptionists, overloaded, offline after 8 PM and on Sundays.

**Buyer**
- The dermatologist-owner (most common) or a practice manager. Buys outcomes
  ("more consultations booked, fewer missed enquiries"), not technology.
- WhatsApp-native, not dashboard-native. Wants zero setup effort — our no-code
  onboarding (records only, no deploys) exists because of this buyer.

**Pain (ranked)**
1. Enquiries unanswered for minutes-to-hours → patient books a competitor.
2. Receptionist re-answers fees/timings/location all day.
3. High-intent treatment enquiries (acne, hair fall, pigmentation) never captured or
   qualified.
4. Missed calls during procedures and after hours vanish without a trace.
5. No structured record of who asked what; follow-up is ad hoc; no-shows uncontrolled.

**Qualifying criteria (a good-fit clinic)**
- Runs enquiries primarily on WhatsApp; willing to route its number via Meta Cloud API.
- Has (or accepts) a Google Calendar for bookings, or is fine with staff-confirmed
  requests.
- Front desk agrees to own the human-handoff queue.

**Disqualifiers**
- Hospital chains with procurement cycles and existing enterprise call centers (later).
- Clinics wanting the AI to give medical advice or diagnose — permanently out of scope.
- Clinics unwilling to answer handoffs (the AI's safety model requires a human backstop).

## 2. End users of the product (patient side)

- **New patient** — has a skin/hair concern; wants fees, treatments, availability.
- **Returning / follow-up patient** — post-treatment questions, rebooking.
- **Price/information shopper** — comparing clinics; needs fast, clear answers.

Detailed journeys: `docs/02-product/USER_JOURNEY.md`.

## 3. Expansion ICPs (V3–V4, sequenced)

1. **Adjacent high-enquiry verticals:** dental, hair transplant centres, aesthetic/plastic
   surgery, IVF, physiotherapy — same qualification-heavy funnel, same knowledge-block
   architecture (new master service lists per vertical, no code change).
2. **Multi-branch clinic groups** (2–10 branches) — unlocked by V4 multi-clinic
   management (`organizations → clinics`).
3. **Geography:** Tamil Nadu → South India → pan-India. Language expansion
   (Tamil/Tanglish first) gates this — see `docs/02-product/PRODUCT_ROADMAP.md`.

## 4. ICP-driven product constraints (why engineering cares)

- Buyer is non-technical → onboarding must remain rows-not-code (CLAUDE.md §7).
- Patients are not fluent English readers → prompt mandates simple everyday words.
- Clinics are small → pricing must undercut a receptionist salary; cost discipline
  (caching, free-form messages) is an ICP requirement, not an optimisation.
