# School Parent Enquiry AI — AI WhatsApp Parent Enquiry System

**School Parent Enquiry AI** is a WhatsApp AI front-office system for schools.
This repository contains **Version 1: the AI WhatsApp Parent Enquiry System** — live for
K-12 schools — and the documentation architecture for the full platform.

The system answers every parent WhatsApp enquiry in seconds in the voice of a
premium school front office: admissions FAQs, lead qualification, real calendar-checked
visit booking, and clean human handoff for anything sensitive or unknown. It never
promises admission outcomes, quotes unconfirmed fees, or behaves like a general AI
assistant.

## Start here

| You are… | Read |
|---|---|
| Writing code (human or AI) | [`CLAUDE.md`](CLAUDE.md) — the Engineering Constitution |
| Anyone navigating the docs | [`docs/README.md`](docs/README.md) — full documentation index |
| Product | [`docs/02-product/PRODUCT.md`](docs/02-product/PRODUCT.md) + [`PRODUCT_ROADMAP.md`](docs/02-product/PRODUCT_ROADMAP.md) |
| Founders | [`docs/01-company/BUSINESS.md`](docs/01-company/BUSINESS.md) |

## Stack

Next.js (App Router) on Vercel · Meta WhatsApp Cloud API (direct) · OpenAI GPT-5 nano
(Structured Outputs + prompt caching) · Supabase (Postgres) · Trigger.dev v4 ·
Google Calendar API (per-school OAuth). Architecture:
[`docs/03-engineering/PROJECT_ARCHITECTURE.md`](docs/03-engineering/PROJECT_ARCHITECTURE.md).

## Development

```bash
npm install
npm run dev            # Next.js app
npm run trigger:dev    # Trigger.dev tasks
npm run typecheck      # strict TS — merge gate
npm test               # vitest — merge gate
```

Environment setup and school onboarding runbook:
[`docs/08-deployment/DEPLOYMENT.md`](docs/08-deployment/DEPLOYMENT.md)
(env template: `.env.example`).

## Repository shape

```
/app        Next.js routes (webhook, OAuth, scheduling)
/lib        Domain modules — ai, whatsapp, knowledge, scheduling, google, supabase
/trigger    Trigger.dev v4 tasks (reply pipeline, sweeps)
/prompts    Production system prompt (source of truth)
/supabase   Migrations (append-only) + seeds
/tests      Vitest unit tests
/docs       Documentation tree (01-company … 09-changelog) — see docs/README.md
```

## The one rule

If a change contradicts [`CLAUDE.md`](CLAUDE.md), update `CLAUDE.md` first (with
approval), then change the code. Safety rules (never promise admission, never invent
fees, fail-closed handoff) are permanent and non-negotiable.
