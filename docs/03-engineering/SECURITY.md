# SECURITY.md — Security & Privacy

> Consolidates and expands the security posture previously spread across
> PROJECT_ARCHITECTURE.md §7 and GOOGLE_CALENDAR_INTEGRATION.md §9. Constitutional
> rules: `/CLAUDE.md` §3 (safety), §7 (coding standards incl. logging), §8 (domain
> model). This is a child-safeguarding-adjacent product: privacy and safeguarding
> failures are existential, not reputational.

---

## 1. Threat model (what we defend against)

- **Webhook forgery** — attacker posts fake "parent messages" to trigger sends/writes.
- **Cross-tenant leakage** — school A seeing school B's parents (fatal to the business).
- **Prompt-level manipulation** — parents steering the AI into promising admission,
  fabricated facts, or off-context behaviour.
- **Token/secret theft** — Google OAuth tokens, Meta tokens, service-role keys.
- **PII exposure** — parent/child identities and family-sensitive concerns leaking via
  logs, errors, or over-collection.
- **OAuth CSRF** — attaching an attacker-controlled callback to the wrong school.

## 2. Inbound trust boundary

- **Every Meta webhook POST verified** via `X-Hub-Signature-256` (app-secret HMAC)
  before any parsing (`lib/whatsapp/verifySignature.ts`). Failures logged + alerting.
- GET verification handshake uses `META_VERIFY_TOKEN`.
- Payloads are untrusted until zod-parsed at the boundary; unknown shapes are rejected,
  additive Meta changes tolerated.
- Dedupe (`processed_events`, `messages.wa_message_id`) bounds replay impact.

## 3. Secrets management

- All secrets in env only — `OPENAI_API_KEY`, `META_WHATSAPP_TOKEN`, `META_APP_SECRET`,
  `META_VERIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_*`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_TOKEN_ENCRYPTION_KEY`, `ADMIN_SETUP_TOKEN`. Never committed
  (`.env.example` documents names only), never logged, never sent to the model.
- **OAuth tokens encrypted at rest** (AES-256-GCM via `GOOGLE_TOKEN_ENCRYPTION_KEY`,
  `lib/google/tokenCrypto.ts`); decrypted only in-memory at call time.
- Key rotation: `GOOGLE_TOKEN_ENCRYPTION_KEY` rotation requires re-encrypt migration;
  Meta/OpenAI keys rotate via env swap (no code change).

## 4. Multi-tenant isolation

- Every domain table carries `school_id`; every query filters by it. Row-level
  isolation is a product guarantee (`/CLAUDE.md` §6).
- **Current RLS pattern:** RLS enabled, **no policies**, service-role key only from
  trusted server code — deny-by-default for any other credential.
- **Dashboard era (V4) prerequisite:** real per-user auth + real RLS policies before
  any user-facing DB access. The `ADMIN_SETUP_TOKEN` gate on `/api/auth/google/*` is an
  explicit MVP stopgap (one shared token, no per-staff identity) — documented as such;
  nothing user-facing ships on it, and it is retired when dashboard auth lands.
- One school's failure states (revoked tokens, hostile parents) are contained per
  school.

## 5. OAuth security (Google Calendar)

- `state` parameter is **HMAC-signed** (school_id bound) — CSRF protection and
  school-swap prevention.
- `access_type=offline` + `prompt=consent` to guarantee refresh tokens; silent
  refresh rotations persisted via the on-`tokens` listener.
- Scope: `https://www.googleapis.com/auth/calendar` (read/write) — deliberately broader
  than `calendar.events` because `freebusy.query` needs read access; a documented
  trade-off, not an oversight.
- Revocation handling: refresh failure → `sync_status='error'` → provider returns
  `null` → school transparently falls back to the legacy flow until reconnected.

## 6. PII & data minimisation

- **Collect the minimum:** parent name, child name, WhatsApp number, visit/enquiry
  details, stated reason. No addresses, no payment data, no photos stored in V1.
- **No admissions decision is generated or stored by the AI** — it never promises
  admission or a seat, so no unauthorised admission record ever exists in our system
  (scope-level privacy control).
- **`mobile` is always `parent.wa_phone`** — never model-supplied (prevents the model
  from writing arbitrary numbers into records).
- **Logs:** message ids, school ids, intents, handoff reasons — never full message
  bodies beyond what the DB holds, never tokens, never decrypted secrets.
- Parent/child data deletion on school request: cascade deletes are in place
  (`on delete cascade` per schema); a documented deletion runbook is a V2 to-do.

## 7. Model-layer security

Defense in depth per `PROMPT_ENGINEERING.md` §6: prompt prohibitions → Structured
Outputs → deterministic code overrides → fail-closed default. Security-relevant
consequences:
- Parent text cannot make the executor perform unvalidated actions (unknown slot ids
  rejected; assets by registered key only; Meta limits enforced in code).
- Prompt-injection attempts ("ignore your instructions…") are out-of-scope intents →
  redirect or handoff; the model holds no secrets to leak (knowledge block contains
  only parent-shareable facts — a design invariant worth preserving).

## 8. Compliance posture & future work

- India DPDP Act alignment: consent (WhatsApp-initiated contact + template opt-ins),
  purpose limitation (enquiry/communication only), minimisation (§6), erasure (runbook
  to formalise). Formal DPDP review before V4 dashboard launch — child data (parent
  enquiries reference a minor) raises the bar on this review, not just standard PII.
- V2+: template opt-in records; V3 voice recordings bring consent + retention policy
  requirements — scoped at V3 design time.
- Security reviews are release gates for each version bump
  (`../02-product/ACCEPTANCE_CRITERIA.md`).
