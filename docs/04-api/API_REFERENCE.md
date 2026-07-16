# API_REFERENCE.md — HTTP API Reference

> Owns every HTTP route this deployment exposes. Principles: `/CLAUDE.md` §10.
> Architecture context: `../03-engineering/PROJECT_ARCHITECTURE.md`. Auth caveats:
> `../03-engineering/SECURITY.md` §4.

All routes are Next.js App Router handlers on Vercel. There is **no public API** in V1 —
every route is either a webhook for an external platform or an admin stopgap.

---

## 1. WhatsApp webhook

### `GET /api/webhooks/whatsapp`
Meta verification handshake. Query: `hub.mode`, `hub.verify_token`, `hub.challenge`.
Returns `hub.challenge` (200) when `hub.verify_token === META_VERIFY_TOKEN`; 403 otherwise.

### `POST /api/webhooks/whatsapp`
Receives messages and status updates from Meta Cloud API.

Responsibilities, in order (the fast-ack contract — CLAUDE.md §10):
1. Verify `X-Hub-Signature-256` (HMAC over raw body with `META_APP_SECRET`); 401 on failure.
2. Extract message(s); dedupe on `message.id` (`processed_events` / unique
   `messages.wa_message_id`).
3. Enqueue one Trigger.dev `replyPipeline` task per new message.
4. Return `200` immediately — no AI work, no slow calls, well under Meta's timeout.

Inbound payload types handled: `text`; V2 adds `interactive.button_reply` and
`interactive.list_reply` (parsed at the boundary into the same internal message shape —
`../03-engineering/PATIENT_EXPERIENCE.md` §2).

## 2. Google OAuth (admin stopgap — not user-facing)

### `GET /api/auth/google/connect?clinic_id=<uuid>&admin_token=<ADMIN_SETUP_TOKEN>`
403 unless `admin_token` matches env. Redirects to Google consent
(`scope=https://www.googleapis.com/auth/calendar`, `access_type=offline`,
`prompt=consent`, `state=` HMAC-signed clinic_id).

### `GET /api/auth/google/callback`
Verifies `state` HMAC → exchanges `code` for tokens → encrypts (AES-256-GCM) → upserts
`clinic_google_accounts` → plain success/failure acknowledgement.

> ⚠️ Both routes are an **explicit MVP stopgap** gated by one shared token. Retired when
> V4 dashboard auth ships. Redirect URI: `https://app.medixum.ai/api/auth/google/callback`.

## 3. Scheduling (internal/testing)

### `GET /api/scheduling/slots`
Returns computed availability for a clinic (working hours ∩ Calendar free/busy ∩ existing
appointments). Used for verification/testing; the reply pipeline calls the provider
directly, not this route.

### `POST /api/scheduling/book`
Books a slot via `bookSlot()` (Postgres-mutex insert → Calendar event). Same code path
the pipeline uses; exists for testing/manual ops.

## 4. Conventions (binding for all future routes)

- **Thin handlers:** validate (zod) → delegate to `/lib` → respond.
- **Auth first:** any new route states its auth model in this doc before it merges;
  "none yet" is not an auth model for user-facing routes.
- **Versioning:** breaking changes to any externally-consumed route require
  `/api/v2/...`; webhooks tolerate additive payload changes.
- **Errors:** structured JSON bodies; 4xx for caller errors, 5xx only for genuine
  faults; no stack traces or internal identifiers in responses.
- **Planned (V2+):** missed-call webhook (`POST /api/webhooks/exotel` — provider seam),
  template-status webhook, dashboard API (V4, behind real auth).

## 5. Environment variables consumed by routes

`META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_WHATSAPP_TOKEN` (send path),
`ADMIN_SETUP_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_*`. Full deployment matrix:
`../08-deployment/DEPLOYMENT.md`.
