# ICP.md — Ideal Customer Profile

> Source of truth for who we sell to. `BUSINESS.md` references this; product personas
> (parent-side) live in `docs/02-product/PRODUCT.md` §User Personas.

---

## 1. Primary ICP (V1–V2): Private K-12 schools, India

**Firmographics**
- Single-campus private school, owner/principal-operated.
- Tier 1/2/3 Indian cities; pilot base: Tamil Nadu (Madurai pilot: Sunrise Public School).
- 20–80 WhatsApp admission enquiries/day during admission season; annual fees ranging
  ₹15,000–₹1,50,000/year depending on grade and board (CBSE/State/ICSE).
- Front office: 1–2 admissions staff, overloaded during admission season, offline after
  4 PM and on Sundays.

**Buyer**
- The Principal/Correspondent (most common) or an admissions officer/school
  administrator. Buys outcomes ("more qualified admission enquiries, fewer missed
  messages"), not technology.
- WhatsApp-native, not dashboard-native. Wants zero setup effort — our no-code
  onboarding (records only, no deploys) exists because of this buyer.

**Pain (ranked)**
1. Enquiries unanswered for minutes-to-hours → parent enquires at a competing school.
2. Front office staff re-answer fees/timings/transport/location all day, especially
   during admission season.
3. High-intent admission enquiries (which grade, transfer from where) never captured or
   qualified.
4. Missed calls during class hours and after hours vanish without a trace.
5. No structured record of who asked what; follow-up is ad hoc; enquiries go cold
   uncontrolled.

**Qualifying criteria (a good-fit school)**
- Runs enquiries primarily on WhatsApp; willing to route its number via Meta Cloud API.
- Has (or accepts) a Google Calendar for school visit bookings, or is fine with
  staff-confirmed requests.
- Front office agrees to own the human-handoff queue.

**Disqualifiers**
- Large school chains/trusts with procurement cycles and existing enterprise call
  centers (later).
- Schools wanting the AI to promise admission, a seat, or a fee waiver — permanently out
  of scope.
- Schools unwilling to answer handoffs (the AI's safety model requires a human backstop).

## 2. End users of the product (parent side)

- **New parent** — evaluating schools for their child; wants fees, grade availability,
  transport, timings.
- **Transfer parent** — moving their child from another school; needs transfer-certificate
  and mid-year admission process info.
- **Comparison-shopping parent** — comparing schools; needs fast, clear answers.

Detailed journeys: `docs/02-product/USER_JOURNEY.md`.

## 3. Expansion ICPs (V3–V4, sequenced)

1. **Adjacent high-enquiry verticals:** preschools/daycares, coaching institutes/tuition
   centers, colleges — same qualification-heavy funnel, same knowledge-block
   architecture (new master service lists per vertical, no code change).
2. **Multi-campus school groups** (2–10 campuses) — unlocked by V4 multi-school
   management (`organizations → schools`).
3. **Geography:** Tamil Nadu → South India → pan-India. Language expansion
   (Tamil/Tanglish first) gates this — see `docs/02-product/PRODUCT_ROADMAP.md`.

## 4. ICP-driven product constraints (why engineering cares)

- Buyer is non-technical → onboarding must remain rows-not-code (`/CLAUDE.md` §6).
- Parents are not fluent English readers → prompt mandates simple everyday words.
- Schools are cost-conscious → pricing must undercut a front-office hire; cost
  discipline (caching, free-form messages) is an ICP requirement, not an optimisation.
