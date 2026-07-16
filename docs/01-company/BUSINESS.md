# BUSINESS.md — Medixum AI Founder Document

> Audience: **founders.** This is the business master document. It narrates strategy and
> delegates numbers/details to single-source-of-truth companions:
> `COMPANY_VISION.md` (vision/mission/values) · `ICP.md` (who we sell to) ·
> `PRICING.md` (all ₹ figures — PROPOSED) · `REVENUE_MODEL.md` (unit economics) ·
> `GOALS.md` (targets/KPIs) · `docs/02-product/PRODUCT_ROADMAP.md` (versions).
> Engineering never takes direction from this file — that's `/CLAUDE.md`.

---

## 1. Company vision & mission

Build **India's leading AI-powered Clinic Growth System**. Mission: no Indian clinic
ever loses a patient to a missed message. The WhatsApp AI Receptionist is V1 of a
platform that will own the clinic's entire growth funnel — enquiry → qualification →
booking → reminder → visit → review → reactivation. Full narrative: `COMPANY_VISION.md`.

## 2. Core values

Patient safety over everything · Clinics grow, we grow · Trust through restraint ·
Small team, compounding systems · Truth in documentation. (Defined in `COMPANY_VISION.md` §4.)

## 3. Target market & ICP

Private dermatology & cosmetology clinics in India (1–3 doctors, owner-operated,
20–80 WhatsApp enquiries/day), starting Tamil Nadu. Expansion: dental, hair, aesthetics,
IVF, physio; then multi-branch groups. Full profile and disqualifiers: `ICP.md`.

## 4. Unique value proposition

**"Every WhatsApp enquiry answered in seconds, every bookable patient booked — without
hiring anyone."** Concretely: 24/7 instant replies in a premium front-desk voice; leads
qualified before slots are offered; real calendar-checked bookings (not "we'll call you
back"); clean human handoff for anything medical or sensitive.

## 5. Competitive advantage

1. **Safety-first receptionist, not a chatbot.** Fail-closed medical handoff at prompt
   AND code level — competitors bolt safety on; ours is constitutional (CLAUDE.md §8).
   In healthcare, one bad AI answer ends the customer relationship; ours structurally
   can't give one.
2. **Real booking, not lead capture.** Postgres-mutex race-safe calendar booking is live
   (V1). Most "WhatsApp bots" stop at collecting a phone number.
3. **Vertical depth.** Dermatology conversation design (qualification per concern:
   acne/hair fall/pigmentation) beats horizontal bot builders on conversion.
4. **Cost structure.** Direct Meta Cloud API (no BSP markup) + prompt caching +
   inbound-free-form messaging → >90% gross margin (`REVENUE_MODEL.md` §2) → we can
   underprice and outlast.
5. **No-code multi-tenant onboarding.** A clinic goes live as database rows. Sales
   velocity is not gated on engineering.

## 6. Business model & pricing

Per-clinic monthly SaaS + usage pass-through (templates V2+, voice minutes V3+).
Current (PROPOSED): Starter ₹4,999 / Growth ₹7,999 / onboarding ₹4,999.
Future tiers: Clinic Growth System ₹12,999 (V2), Voice add-on (V3), Platform ₹19,999
with multi-branch discounts (V4). **All figures pending founder approval** — details,
rules, and open questions: `PRICING.md`; economics: `REVENUE_MODEL.md`.

## 7. Revenue targets

- **2-year:** 200 clinics, ₹13–15L MRR, V2 shipped, Voice in pilot.
- **5-year:** 2,000+ clinics, ₹2Cr+ MRR, V4 platform, 4–6 verticals.
Trajectory and KPI definitions: `GOALS.md` (PROPOSED).

## 8. Expansion strategy

Sequence: **depth before breadth.**
1. Win dermatology/cosmetology in Tamil Nadu (Tamil/Tanglish support is the unlock).
2. Add adjacent high-enquiry verticals — same architecture, new master service list per
   vertical (a records change, not a build).
3. South India → pan-India.
4. Multi-branch groups once V4 multi-clinic management ships.

## 9. Go-to-market strategy

- **Phase 1 (now):** founder-led sales. Pilot clinics free for 30 days; convert on
  demonstrated booked-consultation lift. Every pilot produces a case study.
- **Phase 2:** referral loops — dermatologists talk to dermatologists; referral credit
  per converted clinic. Local presence at IADVL/derma association meets.
- **Phase 3:** channel partners — clinic-equipment distributors, pharma reps, and PMS
  vendors who already walk into clinics weekly.
- **Wedge motion:** the demo IS the product — prospect messages the pilot clinic's
  WhatsApp and watches the AI qualify and book them in real time.

## 10. Sales strategy

- Sell the outcome number: "clinics like yours miss X enquiries/month; each consultation
  is worth ₹Y lifetime." The monthly enquiry report (Growth tier) is the renewal engine.
- Land with Growth (calendar booking is the "wow"), expand via module ladder
  (`REVENUE_MODEL.md` §3).
- Close in one visit: onboarding is same-day (records + number mapping).

## 11. Customer success strategy

- Onboarding = white-glove knowledge-base creation (we write the clinic's FAQs from a
  30-minute call) + staff training on the handoff queue.
- Weekly automated health check: handoff rate, unanswered-handoff count, knowledge gaps
  (questions the AI deferred) → we close gaps proactively by editing knowledge records.
- Quarterly business review armed with conversion metrics (V4 makes this self-serve).
- Support SLA: same-day response; booking-affecting incidents are P0.

## 12. Marketing strategy & brand positioning

- **Positioning:** "The AI front desk for your clinic" — premium, safe, invisible to
  patients (the patient thinks they're talking to the clinic — because they are).
- **Not** positioned as: chatbot, WhatsApp marketing/broadcast tool, or medical AI.
- Content: before/after enquiry-response case studies, missed-enquiry cost calculators,
  founder-led content for clinic-owner communities.
- Brand promise ordering: Safe → Reliable → Effortless → Growth.

## 13. KPIs & MRR goals (pointer)

North star: consultations booked via Medixum per clinic per month. Business and product
KPI definitions live in `GOALS.md` §4 — one definition set, shared with engineering
observability (CLAUDE.md §12) so founder dashboards and system metrics never diverge.

## 14. Roadmap summary & future expansion

V1 AI WhatsApp Receptionist (live, incl. Google Calendar auto-booking) →
V2 Clinic Growth System (interactive WhatsApp, appointment management, missed call
recovery, review automation) → V3 AI Voice Receptionist → V4 Complete Platform
(dashboard, analytics, reactivation, follow-up automation, multi-clinic).
Owner: `docs/02-product/PRODUCT_ROADMAP.md`. Beyond V4: PMS/EMR integrations,
payments-in-chat, and insurance workflows are candidate expansions — deliberately
unscheduled until the platform era.
