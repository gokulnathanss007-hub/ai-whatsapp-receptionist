# DEPLOYMENT.md — Deployment & Environments

> Owns how the system is deployed and configured. Architecture:
> `../03-engineering/PROJECT_ARCHITECTURE.md` §9 (summary). Secrets handling:
> `../03-engineering/SECURITY.md` §3.

---

## 1. Topology

| Component | Platform | Notes |
|---|---|---|
| Next.js app + webhook routes | **Vercel** | `.vercel/project.json` links the project; `vercel` CLI in devDeps |
| Reply pipeline + sweeps | **Trigger.dev v4** | `trigger.config.ts`; tasks in `/trigger` |
| Database | **Supabase (Postgres)** | Migrations in `supabase/migrations/` (append-only) |
| Messaging | **Meta WhatsApp Cloud API (direct)** | Clinic numbers → shared webhook |
| AI | **OpenAI** (`gpt-5-nano`) | Structured Outputs; automatic prompt caching |
| Calendar | **Google Calendar API** | Per-clinic OAuth; redirect `https://app.medixum.ai/api/auth/google/callback` |

## 2. Environment variables (complete matrix)

Naming convention: flat, provider-prefixed `SCREAMING_SNAKE_CASE` (`/CLAUDE.md` §3).
Template: `.env.example` (names only, never values).

```
# OpenAI
OPENAI_API_KEY

# Meta WhatsApp Cloud API
META_WHATSAPP_TOKEN
META_APP_SECRET
META_VERIFY_TOKEN

# Supabase
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# Trigger.dev
TRIGGER_*                      # per Trigger.dev project config

# Google Calendar integration
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
GOOGLE_TOKEN_ENCRYPTION_KEY    # 32-byte key, AES-256-GCM token encryption

# Admin stopgap (retired at V4 dashboard auth)
ADMIN_SETUP_TOKEN

# Optional tuning
SCHEDULING_LOOKAHEAD_DAYS      # default 3
```

## 3. Deploy workflow

1. **Migrations first:** apply new `supabase/migrations/*.sql`
   (`scripts/applyMigrations.ts`); verify with `scripts/checkState.ts`.
2. **Trigger.dev deploy:** tasks versioned with the app (`npm run trigger:dev` locally;
   Trigger.dev deploy for prod). SDK + build packages pinned and upgraded together.
3. **Vercel deploy:** `next build` gate; env vars set per environment in Vercel.
4. Pre-deploy checks: `npm run typecheck`, `npm test`, and the release gates in
   `../07-testing/TESTING_STRATEGY.md` §5 for version bumps.

## 4. Onboarding a clinic (production runbook — no code, no deploy)

1. Create `clinics` row (profile, fees, policies, `opening_hours`, timezone,
   `auto_confirm_enabled`); `knowledge_version = 1`.
2. Add `clinic_doctors`, `clinic_services` (from master list), `clinic_faqs`.
3. Map the WhatsApp number: `clinic_whatsapp_numbers.phone_number_id` → clinic.
4. Optional calendar: run the OAuth connect route with `ADMIN_SETUP_TOKEN`; verify
   `clinic_google_accounts.sync_status = 'connected'`; verify a slot listing.
5. Send a live test message end-to-end before handover.
(Seed precedent: `supabase/seed/glow_skin_madurai.sql`.)

## 5. Operational notes

- **Webhook health is P0:** Meta disables webhooks that fail repeatedly — alert on
  signature failures and non-200s.
- **Token refresh failures** flip `sync_status='error'` and silently degrade that clinic
  to the free-text flow — surface these in monitoring; they're invisible to patients by
  design.
- **Calendar sync retries** run via scheduled sweep; exhausted retries stay queryable
  for manual reconciliation.
- Rollback: Vercel instant rollback for app code; migrations are forward-only — write
  compensating migrations, never revert applied ones.
- Local dev: `npm run dev` + `npm run trigger:dev`; webhook tunneling per Meta app
  config; `dev.log` is git-ignored scratch.
