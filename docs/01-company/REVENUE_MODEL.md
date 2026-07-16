# REVENUE_MODEL.md — Business & Revenue Model

> ⚠️ Figures marked PROPOSED require founder approval (see `PRICING.md`).
> Related: `GOALS.md` (targets), `BUSINESS.md` (strategy), `/CLAUDE.md` §17 (cost-scaling rules).

---

## 1. Business model

**B2B SaaS subscription, per clinic, per month** — with metered pass-through for
hard-cost channels (WhatsApp template messages in V2+, voice minutes in V3+).

Revenue streams by version:

| Stream | Version | Type |
|---|---|---|
| Receptionist subscription (Starter/Growth) | V1 | Recurring |
| Onboarding fee | V1 | One-time |
| Clinic Growth System tier | V2 | Recurring (upsell) |
| Template-message margin (reminders, reviews, reactivation) | V2 | Usage |
| Voice add-on + per-minute margin | V3 | Recurring + usage |
| Platform tier / multi-clinic | V4 | Recurring (expansion) |

## 2. Unit economics (V1, per clinic per month — engineering-grounded)

Cost structure is a designed property of the architecture (CLAUDE.md §2.7, §17):

| Cost item | Basis | Est. cost |
|---|---|---|
| AI tokens (GPT-5 nano) | Inbound-only replies; static prefix prompt-cached (~90% discount on cached input); low reasoning effort; history trimmed to 12 messages | ₹100–₹400 |
| WhatsApp messages | Replies are **free-form session messages inside the 24h window → ₹0** | ₹0 |
| Infra (Vercel, Supabase, Trigger.dev amortised) | Shared multi-tenant deployment | ₹100–₹300 |
| **Total hard cost** | | **≈ ₹200–₹700** |

Against Growth at ₹7,999 (PROPOSED): **gross margin > 90%.** This margin is why
inbound-first + caching + direct Cloud API are constitutional engineering rules, not
optimisations.

V2+ changes: template messages cost ~₹0.3–₹0.8 each (Meta utility/marketing rates,
category-dependent) → metered pass-through + margin. V3 voice adds telephony + STT/TTS
per-minute costs → usage-priced.

## 3. Expansion revenue logic

Net revenue retention comes from the module ladder, not seat counts:
Starter → Growth → Clinic Growth System → +Voice → Platform/multi-branch.
Target (PROPOSED): ≥120% NRR once V2 ships; expansion driven by demonstrated ROI
(booked-consultation reports per clinic — the metric the dashboard exists to show).

## 4. Pricing floor (never sell below)

Hard cost (₹700 ceiling) + support allocation (₹500) ≈ **₹1,200/clinic/month floor.**
Any discount below this is cash-negative and requires founder sign-off explicitly.

## 5. Payback & CAC guardrails (PROPOSED)

- Target CAC (founder-led/direct sales era): ≤ ₹15,000 per clinic.
- Payback: ≤ 3 months on Growth tier.
- Churn assumption for planning: 2.5%/month early, trending to <1.5% as calendar
  booking + reviews create switching costs (the clinic's booking history and review
  pipeline live with us).

## 6. Why this model wins

- **Costs scale sub-linearly, revenue scales linearly.** One deployment, 500+ clinics
  (CLAUDE.md §17); adding a clinic is rows in a database.
- **The value metric is visible to the buyer:** every booked consultation traces to the
  AI. V4 analytics makes ROI self-evident at renewal time.
- **Hard-cost pass-through protects margin** as usage-heavy modules (templates, voice)
  arrive.
