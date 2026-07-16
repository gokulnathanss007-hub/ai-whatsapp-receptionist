# DATABASE_SCHEMA.md — Consolidated Database Schema

> Owns the *map* of the schema. The **migrations are the source of truth**
> (`supabase/migrations/`, append-only); table-design rationale lives in the design docs
> referenced per table. Principles: `/CLAUDE.md` §9.

---

## 1. Migration register

| Migration | Adds |
|---|---|
| `0001_init.sql` | Core tables: clinics (+knowledge fields), clinic_whatsapp_numbers, clinic_doctors, clinic_services, clinic_faqs, patients, conversations, messages, appointment_requests, processed_events |
| `0002_clinic_google_accounts.sql` | `clinic_google_accounts` (OAuth connection, encrypted tokens) |
| `0003_clinic_scheduling_config.sql` | Scheduling config (working hours/slot duration/timezone — later moved, see 0005) |
| `0004_appointments.sql` | `appointments` (calendar-confirmed bookings, unique slot mutex) |
| `0005_clinic_opening_hours.sql` | Moves hours to `clinics.opening_hours` — single source of truth for stated timings AND bookable slots |
| `0006_conversation_booking_status.sql` | Conversation booking status tracking |
| `0007_claim_booking_attempt.sql` | Booking-attempt claim (concurrency) |
| `0008_appointments_wa_message_id.sql` | Links appointments to originating WhatsApp message (idempotency) |

Seeds: `supabase/seed/glow_skin_madurai*.sql` (pilot clinic — records only, per the
no-code onboarding rule).

## 2. Table map (by domain)

### Tenancy & knowledge (design: `../03-engineering/KNOWLEDGE_STRUCTURE.md`)
- **`clinics`** — profile, `opening_hours` (jsonb, single source of truth),
  `slot_duration_minutes`, `timezone` (IANA, default Asia/Kolkata), fees, policies,
  `auto_confirm_enabled`, `knowledge_version` (cache key), languages.
- **`clinic_whatsapp_numbers`** — `phone_number_id → clinic_id` resolution (what makes
  one deployment serve many clinics).
- **`clinic_doctors`**, **`clinic_services`** (master-list keys + high-level info),
  **`clinic_faqs`** (per `docs/FAQ_SCHEMA.json`, `requires_staff` flag).

### Conversations (design: `../03-engineering/PROJECT_ARCHITECTURE.md` §3)
- **`patients`** — per-clinic identity, `UNIQUE (clinic_id, wa_phone)`.
- **`conversations`** — `stage` (greeting|qualifying|booking|faq|followup|handoff|closed),
  `collected_slots` (jsonb accumulating state → rendered as `<patient_info>`),
  `human_handoff` + `handoff_reason`, booking status (0006).
- **`messages`** — `UNIQUE (wa_message_id)` (idempotency), direction, intent.
- **`processed_events`** — webhook idempotency guard (double protection with messages).

### Booking (design: `../03-engineering/GOOGLE_CALENDAR_INTEGRATION.md` §3)
- **`appointment_requests`** — unconfirmed free-text requests (staff confirm);
  status requested|confirmed|cancelled|rescheduled.
- **`appointments`** — calendar-confirmed bookings; **`UNIQUE
  (clinic_google_account_id, slot_start)` is the booking mutex**; `sync_status`
  pending|synced|failed with bounded `sync_retry_count`; `google_event_id` null until
  sync succeeds; `wa_message_id` link (0008).
- **`clinic_google_accounts`** — one OAuth connection per clinic; tokens AES-256-GCM
  encrypted; `sync_status` connected|error|disconnected.

Kept as **two tables deliberately**: requests (free-text, unconfirmed) vs appointments
(real datetimes, calendar-backed) have different shapes; merging means
nullable-everything and loses the mutex constraint's cleanliness. Reconcile only when
the free-text path retires.

## 3. Binding principles (from `/CLAUDE.md` §9)

1. Append-only migrations; never edit an applied migration.
2. Unique constraints are the concurrency control; `23505` is a handled signal.
3. One source of truth per fact (`opening_hours` is the exemplar — the AI's stated
   timings and the slot generator read the same column and can never drift).
4. jsonb for accumulating state, relational for entities.
5. RLS enabled, no policies, service-role only — until V4 dashboard brings real
   per-user auth + real policies.
6. Encrypt secrets at rest; minimum PII; `mobile` always from `patient.wa_phone`.
7. Indexes ship with the queries that need them, in the same migration.

## 4. Future schema (design seams, build when scheduled)

- **V2:** `patient_optins` (template consent), `reviews` (ask/response tracking),
  `missed_calls` (provider call id dedupe), reminders bookkeeping.
- **V3:** `voice_calls` (recordings pointer, consent, transcript ref) — retention policy
  decided at V3 design.
- **V4:** `organizations` → `clinics` parent (multi-clinic), `users`/roles (real auth),
  RLS policies per role; per-doctor calendars becomes a `doctor_id`-keyed calendar table
  (seam noted in GOOGLE_CALENDAR_INTEGRATION.md §3).
