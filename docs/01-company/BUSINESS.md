# BUSINESS.md — School Parent Enquiry AI Founder Document

> Audience: **founders.** This is the business master document. It narrates strategy and
> delegates numbers/details to single-source-of-truth companions:
> `COMPANY_VISION.md` (vision/mission/values) · `ICP.md` (who we sell to) ·
> `PRICING.md` (all ₹ figures — PROPOSED) · `REVENUE_MODEL.md` (unit economics) ·
> `GOALS.md` (targets/KPIs) · `docs/02-product/PRODUCT_ROADMAP.md` (versions).
> Engineering never takes direction from this file — that's `/CLAUDE.md`.

---

## 1. Company vision & mission

Build **India's leading AI-powered School Growth System.** Mission: no Indian school
ever loses a parent enquiry to a missed message. The WhatsApp AI Parent Enquiry System is
V1 of a platform that will own the school's entire admissions funnel — enquiry →
qualification → school visit → follow-up → admission → renewal → referral. Full
narrative: `COMPANY_VISION.md`.

## 2. Core values

Child safety over everything · Schools grow, we grow · Trust through restraint ·
Small team, compounding systems · Truth in documentation. (Defined in `COMPANY_VISION.md` §4.)

## 3. Target market & ICP

Private K-12 schools in India (single campus, owner/principal-operated, 20–80 WhatsApp
admission enquiries/day during season), starting Tamil Nadu. Expansion: coaching
institutes, preschools/daycares, colleges; then multi-campus school groups. Full
profile and disqualifiers: `ICP.md`.

## 4. Unique value proposition

**"Every WhatsApp enquiry answered in seconds, every serious parent qualified — without
hiring anyone."** Concretely: 24/7 instant replies in a premium front-office voice; leads
qualified before a visit is offered; real calendar-checked school visits (not "we'll call
you back"); clean human handoff for anything sensitive, urgent, or admissions-decision
related.

## 5. Competitive advantage

1. **Safeguarding-first front office, not a chatbot.** Fail-closed handoff on sensitive
   and safety matters at prompt AND code level — competitors bolt safety on; ours is
   constitutional (`/CLAUDE.md` §3). In education, one bad AI answer about a child's
   safety or an admission promise ends the parent relationship; ours structurally can't
   give one.
2. **Real visit booking, not lead capture.** Postgres-mutex race-safe calendar booking is
   live (V1). Most "WhatsApp bots" stop at collecting a phone number.
3. **Vertical depth.** Admissions conversation design (qualification per grade/program:
   kindergarten, primary, middle, high school) beats horizontal bot builders on
   conversion.
4. **Cost structure.** Direct Meta Cloud API (no BSP markup) + prompt caching +
   inbound-free-form messaging → >90% gross margin (`REVENUE_MODEL.md` §2) → we can
   underprice and outlast.
5. **No-code multi-tenant onboarding.** A school goes live as database rows. Sales
   velocity is not gated on engineering.

## 6. Business model & pricing

Per-school monthly SaaS + usage pass-through (templates V2+, voice minutes V3+).
Current (PROPOSED): Starter ₹4,999 / Growth ₹7,999 / onboarding ₹4,999.
Future tiers: School Growth System ₹12,999 (V2), Voice add-on (V3), Platform ₹19,999
with multi-campus discounts (V4). **All figures pending founder approval** — details,
rules, and open questions: `PRICING.md`; economics: `REVENUE_MODEL.md`.

## 7. Revenue targets

- **2-year:** 200 schools, ₹13–15L MRR, V2 shipped, Voice in pilot.
- **5-year:** 2,000+ schools, ₹2Cr+ MRR, V4 platform, 4–6 verticals.
Trajectory and KPI definitions: `GOALS.md` (PROPOSED).

## 8. Expansion strategy

Sequence: **depth before breadth.**
1. Win K-12 private-school admissions in Tamil Nadu (Tamil/Tanglish support is the unlock).
2. Add adjacent high-enquiry verticals — same architecture, new master service list per
   vertical (a records change, not a build).
3. South India → pan-India.
4. Multi-campus school groups once V4 multi-school management ships.

## 9. Go-to-market strategy

- **Phase 1 (now):** founder-led sales. Pilot schools free for 30 days; convert on
  demonstrated admission-enquiry lift during the season. Every pilot produces a case
  study.
- **Phase 2:** referral loops — principals talk to principals; referral credit per
  converted school. Local presence at school-association and CBSE-affiliation meets.
- **Phase 3:** channel partners — school-ERP vendors, uniform/textbook distributors, and
  school-transport vendors who already walk into schools weekly.
- **Wedge motion:** the demo IS the product — prospect messages the pilot school's
  WhatsApp and watches the AI qualify and route them to a school visit in real time.

## 10. Sales strategy

- Sell the outcome number: "schools like yours miss X enquiries/month during admission
  season; each admitted child is worth ₹Y over their years at the school." The monthly
  enquiry report (Growth tier) is the renewal engine.
- Land with Growth (calendar-booked school visits are the "wow"), expand via module
  ladder (`REVENUE_MODEL.md` §3).
- Close in one visit: onboarding is same-day (records + number mapping).

## 11. Customer success strategy

- Onboarding = white-glove knowledge-base creation (we write the school's FAQs from a
  30-minute call) + staff training on the handoff queue.
- Weekly automated health check: handoff rate, unanswered-handoff count, knowledge gaps
  (questions the AI deferred) → we close gaps proactively by editing knowledge records.
- Quarterly business review armed with conversion metrics (V4 makes this self-serve).
- Support SLA: same-day response; visit-booking-affecting incidents are P0.

## 12. Marketing strategy & brand positioning

- **Positioning:** "The AI front office for your school" — premium, safe, invisible to
  parents (the parent thinks they're talking to the school — because they are).
- **Not** positioned as: chatbot, WhatsApp marketing/broadcast tool, or an admissions
  decision-maker.
- Content: before/after enquiry-response case studies, missed-enquiry cost calculators,
  founder-led content for school-owner and principal communities.
- Brand promise ordering: Safe → Reliable → Effortless → Growth.

## 13. KPIs & MRR goals (pointer)

North star: admission enquiries qualified via School Parent Enquiry AI per school per
month. Business and product KPI definitions live in `GOALS.md` §4 — one definition set,
shared with engineering observability so founder dashboards and system metrics never
diverge.

## 14. Roadmap summary & future expansion

V1 AI WhatsApp Parent Enquiry System (live, incl. Google Calendar auto-booking) →
V2 School Growth System (interactive WhatsApp, visit management, missed call recovery,
review automation) → V3 AI Voice Front Office → V4 Complete Platform (dashboard,
analytics, re-engagement, follow-up automation, multi-school). Owner:
`docs/02-product/PRODUCT_ROADMAP.md`. Beyond V4: school-ERP/SIS integrations,
payments-in-chat (fee payment links), and transport-tracking workflows are candidate
expansions — deliberately unscheduled until the platform era.
