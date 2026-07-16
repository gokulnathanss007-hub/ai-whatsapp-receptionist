# PRICING.md — Pricing Strategy

> ⚠️ **STATUS: PROPOSED — every ₹ figure in this document requires founder approval
> before being quoted to a customer.** No pricing existed in the repo before this
> document; these numbers are drafted from India clinic-SaaS market norms and our unit
> economics (`REVENUE_MODEL.md`). Structure is stable; numbers are the variable.

Related: `REVENUE_MODEL.md` (unit economics), `GOALS.md` (MRR targets), `ICP.md` (buyer).

---

## 1. Pricing philosophy

1. **Anchor to a receptionist's salary, not to software.** A front-desk hire costs
   ₹12,000–₹20,000/month. We price the AI at a fraction of that while working 24/7.
2. **Value metric = booked consultations,** not messages. Message-metering punishes
   success; we keep conversations unlimited within fair use.
3. **Flat subscription + pass-through of hard costs.** Model tokens and session messages
   are near-zero (see REVENUE_MODEL.md); WhatsApp *template* messages (reminders,
   reactivation — V2+) and voice minutes (V3) are metered pass-through with margin.
4. **Land narrow, expand with modules.** Each roadmap version adds an upsell tier rather
   than repricing the base.

## 2. Current pricing (V1 — PROPOSED)

| Plan | Price | Includes |
|---|---|---|
| **Starter** | **₹4,999/month** | AI WhatsApp Receptionist: FAQ answering, lead qualification, appointment-request capture, human handoff. Unlimited inbound conversations (fair use). |
| **Growth** | **₹7,999/month** | Starter + Google Calendar auto-confirmed booking, priority support, monthly enquiry report. |
| One-time onboarding | **₹4,999** (waived for pilot clinics) | Meta number setup, knowledge base creation, calendar connection, staff training. |

- Billing: monthly, advance; annual = 2 months free (16% discount).
- Pilot clinics: 30-day free pilot, then Growth pricing grandfathered −20% for 12 months.

## 3. Future pricing (V2–V4 — PROPOSED, indicative)

| Plan | Price | Adds (availability per `docs/02-product/PRODUCT_ROADMAP.md`) |
|---|---|---|
| **Clinic Growth System** (V2) | **₹12,999/month** | Interactive WhatsApp UX, appointment management (cancel/reschedule loop), missed call recovery, review automation. Template messages metered at cost + 30%. |
| **Voice add-on** (V3) | **+₹6,999/month + per-minute** | AI Voice Receptionist. Voice minutes pass-through + margin (telephony + STT/TTS). |
| **Platform** (V4) | **₹19,999/month per clinic; multi-branch discounts at 3+/5+/10+ branches** | Dashboard, analytics, patient reactivation, follow-up automation, multi-clinic management. |

## 4. Pricing rules

- Never price per-message for inbound conversations (misaligned with clinic success).
- Never discount below hard-cost floor (see REVENUE_MODEL.md §4).
- Grandfather existing clinics for ≥12 months on any repricing.
- All new modules launch as paid add-ons or higher tiers — the base plan never silently
  absorbs new scope.

## 5. Open questions for founder

1. Approve/adjust all ₹ figures above.
2. Free pilot length (30 days proposed) and grandfathering policy.
3. Whether Starter (no calendar) should exist at all, or Growth becomes the floor.
4. Template-message margin (30% proposed) and voice per-minute rate (set at V3 design).
