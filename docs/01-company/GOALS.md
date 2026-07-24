# GOALS.md — Company Goals, KPIs & Targets

> ⚠️ All numeric targets are PROPOSED — founder approval required (`PRICING.md` caveat
> applies). Related: `REVENUE_MODEL.md`, `BUSINESS.md`, `docs/02-product/PRODUCT_ROADMAP.md`.

---

## 1. 2-Year Goal (mid-2028) — PROPOSED

**"The default AI parent-enquiry front office for K-12 private schools in South India."**

- **Schools live:** 200 paying schools.
- **MRR:** ₹13–15 lakh (≈ ₹1.6–1.8 Cr ARR) at a blended ₹6,500–₹7,500/school.
- **Product:** V2 (School Growth System) fully shipped; V3 (Voice) in pilot.
- **Geography:** Tamil Nadu dense; presence in Karnataka, Kerala, Telangana.
- **Language:** Tamil/Tanglish live (prerequisite for TN density).
- **Team:** ≤8 people (multi-tenant no-code onboarding is what makes this possible).

## 2. 5-Year Goal (mid-2031) — PROPOSED

**"India's leading School Growth Platform."**

- **Schools live:** 2,000+ across 4–6 verticals (K-12, preschools, coaching institutes,
  colleges).
- **MRR:** ₹2+ Cr (≈ ₹25 Cr ARR) at a blended ₹10,000/school (Platform tier +
  voice/usage revenue).
- **Product:** V4 complete — dashboard, analytics, re-engagement, multi-school
  management.
- **Moat:** per-school enquiry history, review pipeline, and parent re-engagement data
  make School Parent Enquiry AI the system of record for the school's admissions funnel.

## 3. Customer growth trajectory (PROPOSED planning curve)

| Milestone | Schools | Blended MRR |
|---|---|---|
| +6 months | 15 (pilot cohort → paid) | ₹0.9L |
| +12 months | 50 | ₹3.3L |
| +18 months | 110 | ₹7.5L |
| +24 months | 200 | ₹13.5L |
| +36 months | 500 | ₹40L |
| +60 months | 2,000 | ₹2 Cr |

## 4. KPIs

**North star:** qualified admission enquiries via School Parent Enquiry AI per school per
month.

**Business KPIs**
- MRR, NRR (target ≥120% post-V2), logo churn (<2.5%/mo early, <1.5% steady),
  CAC payback (≤3 months), schools onboarded per week without engineering involvement.

**Product/ops KPIs (mirror `docs/03-engineering/` observability metrics — same
definitions, one source)**
- Median first-response latency (seconds).
- AI-containment rate (% enquiries resolved without staff).
- Enquiry → admission-enquiry conversion rate.
- Handoff rate by reason (trends down as knowledge improves — never at safety's expense).
- Booking-conflict rate; calendar sync failure rate.
- Containment quality: % AI answers rated correct on staff review.

## 5. Roadmap summary (pointer)

Version-by-version scope is owned by `docs/02-product/PRODUCT_ROADMAP.md`:
V1 AI WhatsApp Parent Enquiry System (live) → V2 School Growth System (+ missed call
recovery, reviews, interactive UX, visit management) → V3 AI Voice Front Office →
V4 Complete School Growth Platform (dashboard, analytics, re-engagement, multi-school).

## 6. Goal-setting rules

- Targets are reviewed quarterly; the *definitions* of KPIs change only with a changelog
  entry (`docs/09-changelog/CHANGELOG.md`) so trend lines stay honest.
- Safety metrics (handoff correctness, zero admission-promise incidents, zero
  safeguarding-advice incidents) are constraints, not goals — they never trade off
  against growth targets.
