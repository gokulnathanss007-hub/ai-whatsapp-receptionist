# Google Calendar Scheduling — Technical Design

> Location: `docs/03-engineering/`. Related: `PROJECT_ARCHITECTURE.md`,
> `../05-database/DATABASE_SCHEMA.md`, `SECURITY.md` (expanded from §9 below),
> `../02-product/CONVERSATION_FLOWS.md` §2b (parent-facing flow). The implementation
> notes below are a deliberate engineering record — preserve them.

> Status: **Phases 1–4 implemented (OAuth connection, availability reading, booking with race
> protection, AI/conversation wiring).** MVP scope from the original ask is complete. See
> `/CLAUDE.md` for the conventions this design follows.
>
> Decisions locked in with the product owner (2026-07-03):
> 1. Availability = **per-school working hours (Supabase) filtered by Google Calendar busy time**, not raw free/busy alone.
> 2. **One Google Calendar per school** for the MVP (matches today's one-calendar-per-school data model, with no per-staff-member calendars), not one per staff member.
>
> Phase 1 implementation notes (2026-07-03) — the routes and table below were built exactly
> as designed, with two adjustments made during implementation:
> - Routes live under **`/api/auth/google/*`**, not `/api/oauth/google/*` as originally sketched
>   in §4 (redirect URI: `https://app.schoolparentenquiry.ai/api/auth/google/callback`).
> - `clinic_google_accounts` (renamed `school_google_accounts` in
>   `0012_rename_clinic_to_school.sql`, see §3) was created **without** `working_hours` /
>   `slot_duration_minutes` / `timezone` — those are deferred to the Phase 2 (availability)
>   migration, since Phase 1 only needed to prove the OAuth connection + token storage, not
>   scheduling math. See `supabase/migrations/0002_clinic_google_accounts.sql` for the actual
>   Phase 1 schema (pre-rename), and `lib/google/` for the actual implementation.
>
> Phase 2 implementation notes (2026-07-03) — `working_hours`/`slot_duration_minutes`/`timezone`
> added in `0003_clinic_scheduling_config.sql`; slot generation and Calendar freebusy filtering
> live in `lib/scheduling/{slotGenerator,listAvailableSlots}.ts`, exercised via
> `GET /api/scheduling/slots`. Verified against a live connected calendar, including that a
> manually-inserted test event correctly removed the overlapping slot and correctly reappeared
> after deletion.
>
> Phase 3 implementation notes (2026-07-03) — `appointments` table added in
> `0004_appointments.sql`; booking logic in `lib/scheduling/bookSlot.ts`, exercised via
> `POST /api/scheduling/book`. The `SchedulingProvider` interface (§5) was formalized at this
> point — deferred from Phase 2 since a one-method interface would have been premature; now
> that `bookSlot` exists alongside `listAvailableSlots`, `lib/scheduling/googleCalendarProvider.ts`
> implements it and `lib/scheduling/index.ts` exposes `getSchedulingProvider(schoolId)`.
>
> Phase 5 implementation notes (2026-07-04) — `working_hours`/`slot_duration_minutes`/`timezone`
> moved from `clinic_google_accounts` to `clinics` (`opening_hours` on the school profile; see
> `0005_clinic_opening_hours.sql`, table names pre-rename — see §3 for the current
> `schools.opening_hours` name). Bug this fixes: the school profile (`maps_url`, freeform
> `timings` text — what the front office tells parents) and the Google-account row's
> `working_hours` (what actually generated bookable slots) were two disconnected facts; a
> school could have a fully filled-in profile while `working_hours` silently sat at its empty
> `{}` default, so the AI would state hours the booking engine had no awareness of and could
> never produce a slot for. Hours now live in one place on the school profile;
> `lib/knowledge/loader.ts` derives the parent-facing "Timings" line from `opening_hours` via
> `formatOpeningHours()` (falling back to the legacy `timings` text only if `opening_hours` is
> still unset), and `lib/scheduling/listAvailableSlots.ts` reads the same `opening_hours` to
> generate slots — returning `null` (legacy fallback) if it's empty, the same way an
> unconnected Google account is treated, instead of silently offering zero slots forever.
>
> **One real bug found and fixed during Phase 3 testing**, worth recording: `listAvailableSlots`
> originally filtered only against Google Calendar's `freebusy.query` result. A live concurrent
> double-booking test (two simultaneous requests for the same slot) showed the losing request's
> "here are other slots" fallback still listed the slot the winner had just taken — because
> Postgres commits the booking instantly but the matching Calendar event is created in a
> separate follow-up call, so Calendar hadn't caught up yet at the moment the loser's alternatives
> were computed. Fixed by also filtering against `appointments` rows directly (`getBookedSlotWindows`
> in `lib/supabase/queries.ts`) — this was already specified as a "belt-and-suspenders" step in
> §5 of this doc but had not actually been wired into the Phase 2 code. Re-verified after the fix:
> the alternatives list is now correct instantly, with no dependency on Calendar sync timing.
>
> Phase 4 implementation notes (2026-07-03) — `booking_selection` added to `aiOutputSchema`
> (`lib/types.ts`) alongside the existing `enquiry_request` (named `appointment_request` at
> the time, renamed in `0012_rename_clinic_to_school.sql` — see §3), mirrored in
> `lib/ai/jsonSchema.ts`. `lib/ai/promptBuilder.ts` now accepts an optional `availableSlotsBlock`
> injected as `<available_slots>` after `<school_knowledge>` (kept out of the cached static
> prefix since it varies per turn). `trigger/replyPipeline.ts` fetches real availability only
> when `conversation.stage === "booking"` and `school.auto_confirm_enabled` — reusing the
> existing state machine rather than adding new conversation state. One addition beyond the
> original design: after a successful booking, the pipeline forces the next stage to
> `"followup"` instead of leaving it on `"booking"`, otherwise every subsequent message would
> re-trigger an availability fetch indefinitely.
>
> **Two real bugs found and fixed via a live end-to-end test against the real model** (not
> simulated): (1) despite the prompt distinguishing the calendar-slots path from the legacy
> free-text path, the model initially populated *both* `enquiry_request` and
> `booking_selection` in the same turn — fixed by making the prompt explicitly state the two
> outputs are mutually exclusive, plus a code-level backstop in the pipeline that drops
> `enquiry_request` if the model ever contradicts itself again (mirrors the existing
> `safetyOverride.ts` pattern of not trusting the model alone). (2) Verified separately that the
> model correctly echoes back the exact `selected_slot_id` given in `<available_slots>` rather
> than inventing one — tested against real Google Calendar data end-to-end, including a real
> booking + real Calendar event creation from the model's actual output, then cleaned up.

---

## 1. Why the current flow doesn't work

Today (`prompts/system_prompt.md` § ADMISSION VISITS, `lib/types.ts`
`admissionEnquiryPayloadSchema`): the AI asks for a **free-text** `preferred_date` /
`preferred_time`, and `insertAdmissionEnquiry` writes it verbatim into
`admission_enquiries.preferred_date/time` (`text` columns — no parsing, no timezone, no
real datetime anywhere in the codebase). Staff confirm manually later. There is no
availability check anywhere in the pipeline.

This design replaces that *for schools that have connected Google Calendar* with a flow
where the backend computes real availability before the AI ever speaks, and the AI can
only offer and book slots that are actually free — while leaving the existing free-text
`admission_enquiries` path untouched as the fallback for schools that haven't connected a
calendar. That keeps the change additive rather than a breaking rewrite of every school's
flow.

---

## 2. Architecture — updated pipeline

```
Parent message
  ↓
app/api/webhooks/whatsapp/route.ts        (unchanged: verify, dedupe, enqueue)
  ↓
trigger/replyPipeline.ts  ("whatsapp-reply-pipeline")
  ├─ load school, parent, conversation                           (unchanged)
  ├─ CONCURRENTLY: load knowledge, load history, insert inbound  (unchanged)
  ├─ NEW: if conversation is heading into "booking" stage AND
  │        school has a connected school_google_accounts row AND
  │        schools.auto_confirm_enabled = true
  │      → schedulingProvider.listAvailableSlots(school)
  │        (working hours ∩ Google Calendar free/busy, next 3 days, top ~5)
  ├─ build prompt: system + school knowledge + NEW <available_slots> block + history
  ├─ call GPT-5 nano → parse output (unchanged contract, + new `booking_selection` field)
  ├─ NEW: if output.booking_selection.selected_slot_id present
  │      → bookSlot(): Postgres unique-insert (the real mutex) → Google Calendar event create
  │      → on conflict: discard the model's "confirmed" reply, re-fetch slots, send a
  │        deterministic apology+alternatives message instead (no second LLM call)
  ├─ persist message / conversation state                        (unchanged)
  └─ send WhatsApp reply                                         (unchanged transport)

Scheduled task (NEW): trigger/syncFailedAppointments.ts
  — retries Google Calendar event creation for appointments whose booking succeeded
    in Postgres but whose calendar sync failed (network blip, token issue, etc.)
```

`schools.auto_confirm_enabled` already exists in the schema and is described in
`KNOWLEDGE_STRUCTURE.md` as "governs whether the AI may ever state a confirmed slot" —
this design **repurposes that exact flag** as the gate for the calendar-driven flow rather
than inventing a new one. Worth confirming that's the intended reuse before implementation.

---

## 3. Database changes

Two new tables, one column addition — described here in their **current, post-rename
names** (`0012_rename_clinic_to_school.sql` renamed every clinic-era table/column to its
school-domain equivalent; the phase notes above call out the original names where it
matters for the historical record). Everything else (`admission_enquiries`, `school_staff`,
etc.) is untouched — the legacy free-text request flow keeps working exactly as it does
today for any school without a connected calendar.

### `school_google_accounts` — one row per school, holds the OAuth connection

> **Current schema (as of Phase 5, `0005_clinic_opening_hours.sql`):** `working_hours` /
> `slot_duration_minutes` / `timezone` no longer live here — they live on
> `schools.opening_hours` / `schools.slot_duration_minutes` / `schools.timezone` instead,
> as the single source of truth shared with the AI front office's stated hours. See the
> Phase 5 note above and the `schools.opening_hours` section below. The snippet below is
> kept for OAuth-connection-field history only (column names shown as originally built,
> pre-`0012` rename; the table is `school_google_accounts` and its tenant column is
> `school_id` today).

```sql
create table school_google_accounts (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null unique references schools(id) on delete cascade,
  google_email           text not null,
  calendar_id            text not null,
  access_token           text not null,      -- encrypted at rest, see §8
  refresh_token          text not null,      -- encrypted at rest, see §8
  token_expiry           timestamptz not null,
  scope                  text not null,
  sync_status            text not null default 'connected'
                           check (sync_status in ('connected', 'error', 'disconnected')),
  last_sync_error        text,
  connected_at           timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table school_google_accounts enable row level security;
-- no policies, same deny-by-default / service-role-key-only pattern as every other table.
```

### `schools.opening_hours` — single source of truth for the school's real hours

```sql
alter table schools
  add column opening_hours          jsonb not null default '{}'::jsonb,  -- {"mon":[["09:00","16:00"]], ...}
  add column slot_duration_minutes  int not null default 30,
  add column timezone               text not null default 'Asia/Kolkata';
```

Lives on `schools` (alongside `maps_url`, `timings`, `address`) rather than
`school_google_accounts`, because hours are a fact about the *school*, independent of
which Google account happens to be connected right now — reconnecting/replacing the
Google account must never wipe out configured hours. `lib/knowledge/loader.ts` renders
the parent-facing "Timings" text from this value, and
`lib/scheduling/listAvailableSlots.ts` reads it to generate bookable slots — one edit
here updates both.

Working hours and slot length are still keyed at the school level rather than per staff
member, because the calendar is 1:1 with the *school* for the MVP (per the locked
decision), and `school_staff` today has no strong relational identity elsewhere — a
school visit is a time only, never assigned to a specific staff member
(`admission_enquiries.grade_applying_for` records which grade the enquiry is for, not
who it's with). If a school later needs per-department calendars, this becomes a
per-department-calendar table with a `department_id` FK — noted here as the seam for
that future change, not built now.

### `appointments` — confirmed, calendar-backed bookings (new; separate from `admission_enquiries`)

```sql
create table appointments (
  id                         uuid primary key default gen_random_uuid(),
  school_id                  uuid not null references schools(id) on delete cascade,
  parent_id                  uuid not null references parents(id) on delete cascade,
  conversation_id            uuid not null references conversations(id) on delete cascade,
  school_google_account_id   uuid not null references school_google_accounts(id) on delete restrict,
  name                       text not null,
  mobile                     text not null,     -- always parent.wa_phone, never model-supplied (same rule as today)
  reason                     text not null,
  slot_start                 timestamptz not null,
  slot_end                   timestamptz not null,
  timezone                   text not null,
  google_event_id            text,               -- null until calendar sync succeeds
  status                     text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  sync_status                text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed')),
  sync_retry_count           int not null default 0,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (school_google_account_id, slot_start)
);

create index appointments_school_idx on appointments (school_id, slot_start);
alter table appointments enable row level security;
```

**The `unique (school_google_account_id, slot_start)` constraint is the actual concurrency
control** — see §7. Google Calendar is never the arbiter of "who got the slot"; Postgres is.

Why a new table instead of extending `admission_enquiries`: `admission_enquiries`
represents *unconfirmed* requests staff must manually action (`status: requested|
confirmed|cancelled|rescheduled`, free-text date/time). A calendar-confirmed booking is a
different thing — it's already real, has a real datetime, and is tied to a specific
calendar event. Overloading one table with both shapes would mean nullable-everything and
lose the unique constraint's cleanliness. The two tables can be reconciled into one in a
later phase once the free-text path is retired; not worth doing in this pass.

---

## 4. Google OAuth flow

One gap this surfaces: **there is currently no staff-facing auth or dashboard anywhere in
this codebase** — every existing table is accessed only via the service-role key from
trusted server code. "One-time OAuth setup per school" needs *some* human to click
through a Google consent screen, which means at least one route that isn't behind the
service-role key.

MVP-minimal proposal (explicitly a stopgap, not a real auth system — flag for the V4
school dashboard per `../02-product/PRODUCT_ROADMAP.md`):

```
GET /app/api/auth/google/connect/route.ts
  ?school_id=<uuid>&admin_token=<ADMIN_SETUP_TOKEN>
  → 403 if admin_token doesn't match env ADMIN_SETUP_TOKEN
  → redirect to Google's consent screen:
      scope=https://www.googleapis.com/auth/calendar
      access_type=offline        (required to get a refresh_token)
      prompt=consent             (forces refresh_token even on re-consent)
      state=<HMAC-signed school_id>   (CSRF protection, see §8)

GET /app/api/auth/google/callback/route.ts
  → verify `state` HMAC, extract school_id
  → exchange `code` for {access_token, refresh_token, expiry} via googleapis OAuth2Client
  → encrypt tokens, upsert school_google_accounts row
  → redirect to a plain success/failure acknowledgement (no dashboard exists to return to yet)
```

Token refresh: access tokens expire hourly. `lib/google/oauthClient.ts` wraps
`googleapis`'s `OAuth2Client`, registers an on-`tokens` listener to persist a rotated
access token (and refresh token, if Google issues a new one) back to
`school_google_accounts` whenever the client silently refreshes during an API call.

---

## 5. Scheduling abstraction (`SchedulingProvider`)

This is the seam requirement #8 asks for — the AI/pipeline code only ever talks to this
interface, never to `googleapis` directly, so a future Outlook/other school-ERP calendar
provider is a new file implementing the same interface, not a conversation-logic change.

```ts
// lib/scheduling/types.ts
export interface SchedulingSlot {
  id: string;        // opaque stable id (e.g. base64url of ISO start time)
  startsAt: string;  // ISO 8601 UTC
  endsAt: string;
  label: string;     // human-readable, school-local time, e.g. "Today – 4:30 PM"
}

export interface SchedulingProvider {
  listAvailableSlots(params: {
    schoolId: string;
    fromDate: Date;
    daysAhead: number;
  }): Promise<SchedulingSlot[]>;

  isSlotStillAvailable(params: { schoolId: string; slotId: string }): Promise<boolean>;

  bookSlot(params: {
    schoolId: string;
    slotId: string;
    parentName: string;
    parentMobile: string;
    reason: string;
  }): Promise<{ googleEventId: string }>;
}
```

```
/lib/scheduling/
  types.ts                  # SchedulingSlot, SchedulingProvider
  googleCalendarProvider.ts # implements SchedulingProvider via googleapis calendar v3
  index.ts                  # getSchedulingProvider(school): SchedulingProvider | null
  slotGenerator.ts          # pure fn: working hours + busy intervals → candidate SchedulingSlot[]
  renderSlotsBlock.ts       # SchedulingSlot[] → the <available_slots> prompt text block

/lib/google/
  oauthClient.ts            # buildAuthUrl(schoolId), exchangeCodeForTokens(code), refresh handling
  tokenCrypto.ts             # AES-256-GCM encrypt/decrypt using GOOGLE_TOKEN_ENCRYPTION_KEY
```

`getSchedulingProvider(school)` returns `null` when the school has no connected
`school_google_accounts` row (or `sync_status !== 'connected'`) — the pipeline treats
`null` as "use the legacy free-text flow," so nothing breaks for schools that never
connect a calendar.

**`listAvailableSlots` algorithm:**
1. Read `opening_hours`, `slot_duration_minutes`, `timezone` from `schools`.
2. Generate candidate slot start times for the next `daysAhead` days (default 3) that fall
   inside working hours.
3. One batched `calendar.freebusy.query` call for `calendar_id` over `[now, now+daysAhead]` —
   not one call per candidate slot.
4. Drop any candidate overlapping a busy interval.
5. Drop any candidate that already has a row in `appointments` for that exact `slot_start`
   (belt-and-suspenders against calendar/DB drift, e.g. mid-retry states).
6. Return at most ~5 upcoming slots — kept short deliberately, per `/CLAUDE.md`'s "short by
   construction" rule; the AI is instructed to present them as a compact bulleted list.

This whole computation is skipped on turns where the AI isn't in/entering the booking
stage, so it doesn't add a Calendar API round-trip to every message — only
booking-relevant ones.

---

## 6. AI prompt & output contract changes

**`prompts/system_prompt.md` § ADMISSION VISITS** — replace the free-text date/time
collection instruction with:

```
# ADMISSION VISITS — CALENDAR-CHECKED SLOTS (when <available_slots> is present)
Never ask "what date and time works for you." When <available_slots> appears in context,
present each slot's label exactly as given, as a short bulleted list, and ask the parent to
pick one. Once they choose, set booking_selection.selected_slot_id to that slot's id — never
invent an id, and never state a slot as confirmed yourself; the booking result is applied by
the system after you respond. If <available_slots> is empty or absent, apologize briefly and
say our school office will follow up with timing — do not fall back to asking for a preferred
date/time.

# ADMISSION VISITS — LEGACY REQUEST FLOW (when <available_slots> is absent, no calendar connected)
[unchanged existing free-text enquiry_request behaviour]
```

The model is told the `id` values but instructed to only ever echo the `label` to the
parent — `id` is a backend-facing key, not something the parent should see.

**`lib/types.ts`** — new schema, additive alongside the existing
`admissionEnquiryPayloadSchema`:

```ts
export const bookingSelectionSchema = z.object({
  name: z.string(),
  reason: z.string(),
  selected_slot_id: z.string().nullable(),
});
export type BookingSelection = z.infer<typeof bookingSelectionSchema>;
```

`aiOutputSchema` gains `booking_selection: bookingSelectionSchema.nullable()` alongside
the existing `enquiry_request` field (both nullable; in practice only one is ever
populated, depending on whether `<available_slots>` was in context for that turn). Mirror
the same addition in `lib/ai/jsonSchema.ts`'s `AI_OUTPUT_JSON_SCHEMA` (`anyOf: [object,
null]`, same pattern already used for `enquiry_request`).

**Reply override for the booking-conflict case:** the model's `reply` text is generated
*before* the actual booking attempt, so it may say "confirmed for 10am tomorrow" optimistically.
If `bookSlot()` reports the slot was just taken (see §7), the pipeline **discards that reply**
and substitutes a deterministic, templated apology + fresh slot list — built directly from the
re-fetched `SchedulingSlot[]`, no second LLM call. Every other reply path (FAQ, qualifying,
handoff, legacy free-text booking) is untouched and keeps sending the model's `reply` verbatim,
exactly as today.

### Supported date/time expressions (`lib/scheduling/requestedDateTime.ts`)

`resolveRequestedDateTime` resolves a parent's free text into an exact school-local target
**only when both a day cue and an explicit clock time with an AM/PM marker are present** (or
the day is omitted entirely, meaning today). Everything else deliberately resolves to `null`
— a wrong guess would drive which slot gets treated as authoritative, so no guess is ever
made. Regression-tested in `tests/scheduling/ambiguousRequests.test.ts` and
`tests/scheduling/timezone.test.ts`.

| Parent says | Resolves to | Why |
|---|---|---|
| "today 7 PM" / "7 PM" | Today 19:00 school-local | Explicit time; missing day defaults to today |
| "tomorrow 6 PM" | Tomorrow 18:00 | Explicit day + time |
| "Monday 5 PM" | Coming Monday 17:00 (today if today is Monday and 5 PM is still ahead; next week if passed) | Weekday + explicit time |
| "next Monday 5 PM" | Always the following week's Monday | "next" skips today even if today is Monday |
| "Visit Monday" (no time) | `null` | Day without a clock time |
| "tomorrow evening" / "in the morning" / "after lunch" | `null` | Day-part words, no clock time |
| "after 5" / "at 5" | `null` | No AM/PM marker — 5 AM vs 5 PM is a guess |
| "next week" / "anytime tomorrow" | `null` | No concrete time |
| "12/8 at 5 PM" | `null` | Numeric dates are ambiguous (Dec 8 vs Aug 12) |

**What `null` means downstream (the safe path, not an error):** the pipeline falls back to
the parent's already-collected `preferred_date`/`preferred_time` if present; otherwise it
presents the real availability list and the parent picks an entry explicitly. A booking then
proceeds only via a picked slot id, still protected by `verifySlotIntegrity` and the
time-mention mismatch guard. Vague phrasing can therefore never produce a guessed booking —
at worst it costs one extra "which time works for you?" turn.

All resolution happens in the school's IANA timezone (`schools.timezone`); slot ids encode
the UTC instant, and labels render school-local — the timezone tests prove the same instant
is preserved across the local-midnight/UTC-date boundary (e.g. a 23:30–00:00 slot).

---

## 7. Race condition protection

Two clients hitting "book 10am tomorrow" at the same moment is the scenario requirement
#7 calls out. Google Calendar's Events API has no compare-and-swap primitive, so it cannot
be the thing that decides who wins — **Postgres is**:

1. On `selected_slot_id`, first action is an `insert into appointments (...) values (...)`
   targeting the unique `(school_google_account_id, slot_start)` pair. This is the one
   atomic serialization point.
2. If the insert succeeds → proceed to create the Google Calendar event, store
   `google_event_id`, send the real confirmation reply.
3. If the insert fails with Postgres `23505` (unique violation, the same pattern already used
   for `messages.wa_message_id` and `processed_events` today) → **no calendar event is
   created**, the model's optimistic reply is discarded, `listAvailableSlots` is re-fetched,
   and a "that slot was just taken — here's what's still open" message is sent instead.
4. If the Postgres insert succeeds but the *subsequent* Google Calendar event creation fails
   (network blip, expired token) → the booking is **not** rolled back (it's real, the parent
   was told yes) — `appointments.sync_status` is set to `'failed'`, and a scheduled task
   (`trigger/syncFailedAppointments.ts`, `sync_retry_count` bounded) retries calendar event
   creation until it succeeds or exhausts retries, at which point staff can reconcile manually
   via Supabase. This matches requirement #3: Calendar is a downstream view of bookings, not
   the primary database — a temporary calendar/DB disagreement is recoverable; a lost booking
   or a double-booking is not.

---

## 8. Environment variables

Following the existing flat, provider-prefixed `SCREAMING_SNAKE_CASE` convention
(`OPENAI_*`, `META_*`, `SUPABASE_*`, `TRIGGER_*`):

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
GOOGLE_TOKEN_ENCRYPTION_KEY     # 32-byte key, AES-256-GCM, for encrypting stored OAuth tokens
ADMIN_SETUP_TOKEN               # MVP-only gate on the OAuth connect route (§4) — no real staff auth exists yet
SCHEDULING_LOOKAHEAD_DAYS       # optional, default 3
```

---

## 9. Security considerations

- **Tokens encrypted at rest.** `access_token`/`refresh_token` in `school_google_accounts` are
  encrypted in application code (AES-256-GCM via `GOOGLE_TOKEN_ENCRYPTION_KEY`) before insert,
  decrypted only in-memory when a Calendar API call needs them. Never logged — extends the
  existing "never log full PII" rule in `/CLAUDE.md` §7.
- **OAuth `state` is signed**, not a raw `school_id` — prevents CSRF and prevents an attacker
  from swapping which school a callback attaches tokens to.
- **Minimal-but-workable scope**: `https://www.googleapis.com/auth/calendar` (read/write) is
  used rather than the narrower `calendar.events`, because `freebusy.query` on the connected
  calendar needs read access beyond just event CRUD. Documented here as a deliberate
  scope-vs-simplicity trade-off, not an oversight.
- **RLS**: both new tables follow the exact existing pattern — RLS enabled, no policies,
  service-role key only. Consistent with every other table; no new access model introduced.
- **The OAuth-connect route is an explicit MVP stopgap**, gated by a single shared
  `ADMIN_SETUP_TOKEN` rather than real per-staff auth. This should not be considered
  production-grade multi-tenant admin access — flagged here so it isn't mistaken for a
  finished feature. A real school-dashboard auth system is V4 territory per
  `../02-product/PRODUCT_ROADMAP.md`.
- **`mobile` is still always `parent.wa_phone`**, never accepted from the model's output —
  same rule the existing `insertAdmissionEnquiry` already enforces, carried into
  `bookSlot()`.

---

## 10. Error handling

- **Calendar API failure while listing slots** (rate limit, transient error, revoked token):
  `listAvailableSlots` throws → pipeline catches and falls back to the **legacy free-text
  flow** for that turn (the `<available_slots>` block is simply omitted, and the prompt's
  legacy-flow instructions apply) rather than forcing a human handoff — availability lookup
  failing isn't safety-critical the way a sensitive-matter or urgent-safety-concern message is,
  so it degrades gracefully instead of failing closed.
- **Booking write failure after the model already promised a slot** (Postgres error unrelated
  to the unique constraint, or Calendar API hard-fails past retry): fail closed to the existing
  `fallbackHandoffOutput()` pattern — "I'll connect you with our school office to confirm this
  visit" — never send an unconfirmed "booked!" message.
- **Token refresh failure** (revoked access, deleted Google account): mark
  `school_google_accounts.sync_status = 'error'`, populate `last_sync_error`;
  `getSchedulingProvider()` then returns `null` for that school until manually reconnected,
  transparently routing every parent of that school back to the legacy flow until fixed.
- **Calendar sync retry exhaustion**: after `sync_retry_count` hits its bound,
  `appointments.sync_status` stays `'failed'` permanently and is left queryable in Supabase for
  manual staff reconciliation — no staff UI is built for this in the MVP, matching requirement
  #9's scope limits.

---

## 11. New dependencies

| Package | Why |
|---|---|
| `googleapis` | Official Google API Node client — covers both the OAuth2 client and Calendar v3 API in one dependency, avoiding a separate `google-auth-library` install. |
| `luxon` (+ `@types/luxon`) | Timezone-aware slot generation (working hours in a school's local timezone, crossing day/DST boundaries) — nothing in the codebase currently does any date/time math. |

No existing dependency changes; `zod` and the strict-TypeScript conventions carry through
unchanged.

---

## 12. Documentation updates required

- This file (`docs/03-engineering/GOOGLE_CALENDAR_INTEGRATION.md`) is the source design
  doc.
- `PROJECT_ARCHITECTURE.md` §3 — add `school_google_accounts` and `appointments` schema.
- `../02-product/CONVERSATION_FLOWS.md` §2b — the calendar-driven booking example, kept
  alongside the existing free-text example labeled as the no-calendar fallback.
- `../02-product/INTENTS.md` — `book_visit` slot description kept current.
- `SYSTEM_PROMPT.md` — mirrors the `prompts/system_prompt.md` change (§6).
- `KNOWLEDGE_STRUCTURE.md` — documents `schools.opening_hours` /
  `slot_duration_minutes` as scheduling config, distinct from the parent-facing knowledge
  block.
- `.env.example` — the variables from §8.
- **`/CLAUDE.md` itself** — a genuine scope change worth flagging directly: §2 "Scope
  (MVP)" doesn't currently mention calendar-based scheduling, and §6 "Folder Conventions"
  doesn't list `/lib/google` or `/lib/scheduling`. Both should be updated once this design
  is approved, since `/CLAUDE.md` is the north-star doc other contributors (human or AI)
  read first.

---

## 13. Updated conversation flow (worked example)

```
Parent: I want to visit for an admission enquiry.

  [pipeline: conversation entering "booking" stage, school has connected calendar
   and auto_confirm_enabled=true → listAvailableSlots() runs before the AI call]

AI: Sure! We have openings at:
    • Today – 4:30 PM
    • Tomorrow – 10:00 AM
    • Tomorrow – 11:30 AM
    Which time would you like?
    [booking_selection: null — still waiting on a pick]

Parent: Tomorrow 10 AM.

  [AI matches the parent's reply to the offered slot's label, returns
   booking_selection.selected_slot_id = "<id for tomorrow 10:00>", reply is optimistic:
   "Great, you're booked for tomorrow at 10:00 AM."]

  [pipeline: insert into appointments (..., slot_start=tomorrow 10:00) —
     CASE A: insert succeeds → create Google Calendar event → send the AI's reply as-is
     CASE B: insert 23505 (someone else just took it) → discard that reply, re-fetch slots,
             send instead: "Sorry, that slot was just taken. Still available: ..."]
```

---

## 14. Open items to confirm before implementation

1. Reusing `schools.auto_confirm_enabled` as the gate for the whole calendar-driven flow
   (§2) — confirm that's the intended semantics, vs. a dedicated new flag.
2. The OAuth-connect route's `ADMIN_SETUP_TOKEN` stopgap (§4, §9) is acceptable for MVP,
   given no staff dashboard/auth exists yet — confirm, or scope a minimal auth system in
   first.
3. `SCHEDULING_LOOKAHEAD_DAYS` default of 3 days / cap of ~5 offered slots — confirm these
   feel right for a K-12 school's typical visit-booking horizon.
4. Default timezone `Asia/Kolkata` with a per-school override column — confirm this
   matches all target schools (consistent with the current pilot seed data being
   Madurai-based).
