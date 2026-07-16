# GOALS.md — Company Goals, KPIs & Targets

> ⚠️ All numeric targets are PROPOSED — founder approval required (`PRICING.md` caveat
> applies). Related: `REVENUE_MODEL.md`, `BUSINESS.md`, `docs/02-product/PRODUCT_ROADMAP.md`.

---

## 1. 2-Year Goal (mid-2028) — PROPOSED

**"The default AI receptionist for dermatology & cosmetology clinics in South India."**

- **Clinics live:** 200 paying clinics.
- **MRR:** ₹13–15 lakh (≈ ₹1.6–1.8 Cr ARR) at a blended ₹6,500–₹7,500/clinic.
- **Product:** V2 (Clinic Growth System) fully shipped; V3 (Voice) in pilot.
- **Geography:** Tamil Nadu dense; presence in Karnataka, Kerala, Telangana.
- **Language:** Tamil/Tanglish live (prerequisite for TN density).
- **Team:** ≤8 people (multi-tenant no-code onboarding is what makes this possible).

## 2. 5-Year Goal (mid-2031) — PROPOSED

**"India's leading Clinic Growth Platform."**

- **Clinics live:** 2,000+ across 4–6 verticals (derma/cosmo, dental, hair, aesthetics,
  IVF, physio).
- **MRR:** ₹2+ Cr (≈ ₹25 Cr ARR) at a blended ₹10,000/clinic (Platform tier +
  voice/usage revenue).
- **Product:** V4 complete — dashboard, analytics, reactivation, multi-clinic management.
- **Moat:** per-clinic booking history, review pipeline, and patient-reactivation data
  make Medixum the system of record for the clinic's growth funnel.

## 3. Customer growth trajectory (PROPOSED planning curve)

| Milestone | Clinics | Blended MRR |
|---|---|---|
| +6 months | 15 (pilot cohort → paid) | ₹0.9L |
| +12 months | 50 | ₹3.3L |
| +18 months | 110 | ₹7.5L |
| +24 months | 200 | ₹13.5L |
| +36 months | 500 | ₹40L |
| +60 months | 2,000 | ₹2 Cr |

## 4. KPIs

**North star:** consultations booked via Medixum per clinic per month.

**Business KPIs**
- MRR, NRR (target ≥120% post-V2), logo churn (<2.5%/mo early, <1.5% steady),
  CAC payback (≤3 months), clinics onboarded per week without engineering involvement.

**Product/ops KPIs (mirror `docs/03-engineering/` observability metrics — same
definitions, one source: CLAUDE.md §12)**
- Median first-response latency (seconds).
- AI-containment rate (% enquiries resolved without staff).
- Enquiry → appointment-request conversion rate.
- Handoff rate by reason (trends down as knowledge improves — never at safety's expense).
- Booking-conflict rate; calendar sync failure rate.
- Containment quality: % AI answers rated correct on staff review.

## 5. Roadmap summary (pointer)

Version-by-version scope is owned by `docs/02-product/PRODUCT_ROADMAP.md`:
V1 AI WhatsApp Receptionist (live) → V2 Clinic Growth System (+ missed call recovery,
reviews, interactive UX, appointment management) → V3 AI Voice Receptionist →
V4 Complete Clinic Growth Platform (dashboard, analytics, reactivation, multi-clinic).

## 6. Goal-setting rules

- Targets are reviewed quarterly; the *definitions* of KPIs change only with a changelog
  entry (`docs/09-changelog/CHANGELOG.md`) so trend lines stay honest.
- Safety metrics (handoff correctness, zero medical-advice incidents) are constraints,
  not goals — they never trade off against growth targets.
