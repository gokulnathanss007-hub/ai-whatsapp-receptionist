# DATABASE_SCHEMA.md — Consolidated Database Schema

> Owns the *map* of the schema. The **migrations are the source of truth**
> (`supabase/migrations/`, append-only); table-design rationale lives in the design docs
> referenced per table. Principles: `/CLAUDE.md` §8.

---

## 1. Migration register

| Migration | Adds |
|---|---|
| `0001_init.sql` | Core tables (clinic-era names at the time): clinics (+knowledge fields), clinic_whatsapp_numbers, clinic_doctors, clinic_services, clinic_faqs, patients, conversations, messages, appointment_requests, processed_events |
| `0002_clinic_google_accounts.sql` | `clinic_google_accounts` (OAuth connection, encrypted tokens) |
| `0003_clinic_scheduling_config.sql` | Scheduling config (working hours/slot duration/timezone — later moved, see 0005) |
| `0004_appointments.sql` | `appointments` (calendar-confirmed bookings, unique slot mutex) |
| `0005_clinic_opening_hours.sql` | Moves hours to `clinics.opening_hours` — single source of truth for stated timings AND bookable slots |
| `0006_conversation_booking_status.sql` | Conversation booking status tracking |
| `0007_claim_booking_attempt.sql` | Booking-attempt claim (concurrency) |
| `0008_appointments_wa_message_id.sql` | Links appointments to originating WhatsApp message (idempotency) |
| `0009_clinic_interactive_flag.sql` | `clinics.interactive_enabled` (V2 interactive rollout flag) |
| `0010_conversation_current_screen.sql` | `conversations.current_screen` (Parent Experience Layer state) |
| `0011_clinic_reception_phone.sql` | `clinics.reception_phone` (direct-contact handoff line) |
| `0012_rename_clinic_to_school.sql` | **Renames every clinic-era table/column to its school-domain equivalent** (see §2) — pure renames + two check-constraint updates + one column rename + one dropped column (`consultation_fee`); no data dropped otherwise |

Migrations `0001`–`0011` keep their original clinic-era filenames (filenames are
immutable history; migrations are append-only and never renamed) even though the
tables/columns they created were subsequently renamed by `0012`. Read each migration's
`CREATE`/`ALTER` statements alongside `0012` to see a table's full lineage.

Seeds: `supabase/seed/sunrise_public_school.sql` (+
`sunrise_public_school_working_hours.sql`) — the live demo tenant, records only, per the
no-code onboarding rule. `supabase/seed/glow_skin_madurai*.sql` is left in place as
historical clinic-era reference data, not used by the school product.

## 2. Table map (by domain, current post-`0012` names)

### Tenancy & knowledge (design: `../03-engineering/KNOWLEDGE_STRUCTURE.md`)
- **`schools`** (was `clinics`) — profile, `opening_hours` (jsonb, single source of
  truth), `slot_duration_minutes`, `timezone` (IANA, default Asia/Kolkata), policies,
  `auto_confirm_enabled`, `interactive_enabled`, `reception_phone`, `knowledge_version`
  (cache key), languages. **No fee column** — `consultation_fee` was dropped in `0012`;
  fee info lives only as a `school_faqs` row (`category = 'fee_structure'`).
- **`school_whatsapp_numbers`** (was `clinic_whatsapp_numbers`) — `phone_number_id →
  school_id` resolution (what makes one deployment serve many schools).
- **`school_staff`** (was `clinic_doctors`), **`school_services`** (was
  `clinic_services`; school-defined `service_key` + high-level info, no fixed master
  list), **`school_faqs`** (was `clinic_faqs`; per `docs/FAQ_SCHEMA.json`,
  `requires_staff` flag; `category` enum: `admission_enquiry`, `fee_structure`,
  `school_timings`, `transport`, `holidays_events`, `facilities`, `contact_office`,
  `certificates`, `location`, `general`, `other`).

### Conversations (design: `../03-engineering/PROJECT_ARCHITECTURE.md` §3)
- **`parents`** (was `patients`) — per-school identity, `UNIQUE (school_id, wa_phone)`.
- **`conversations`** — `stage` (greeting|qualifying|booking|faq|followup|handoff|closed),
  `collected_slots` (jsonb accumulating state → rendered as `<parent_info>`),
  `human_handoff` + `handoff_reason` (enum: `sensitive_matter`, `complaint`,
  `billing_issue`, `refund`, `urgent_safety_concern`, `legal`, `unknown`,
  `explicit_request` — set by `0012`), booking status (0006), `current_screen` (0010).
- **`messages`** — `UNIQUE (wa_message_id)` (idempotency), direction, intent.
- **`processed_events`** — webhook idempotency guard (double protection with messages).

### Booking (design: `../03-engineering/GOOGLE_CALENDAR_INTEGRATION.md` §3)
- **`admission_enquiries`** (was `appointment_requests`) — unconfirmed free-text
  requests (staff confirm); status requested|confirmed|cancelled|rescheduled;
  `grade_applying_for` (was `preferred_doctor` — schools have no "pick a doctor"
  concept; the equivalent qualification field is the grade/class applied for).
- **`appointments`** — calendar-confirmed bookings; kept its name across `0012` (reads
  fine for a school visit booking); **`UNIQUE (school_google_account_id, slot_start)`
  is the booking mutex**; `sync_status` pending|synced|failed with bounded
  `sync_retry_count`; `google_event_id` null until sync succeeds; `wa_message_id` link
  (0008).
- **`school_google_accounts`** (was `clinic_google_accounts`) — one OAuth connection per
  school; tokens AES-256-GCM encrypted; `sync_status` connected|error|disconnected.

Kept as **two tables deliberately**: requests (free-text, unconfirmed) vs appointments
(real datetimes, calendar-backed) have different shapes; merging means
nullable-everything and loses the mutex constraint's cleanliness. Reconcile only when
the free-text path retires.

## 3. Binding principles (from `/CLAUDE.md` §8)

1. Append-only migrations; never edit an applied migration.
2. Unique constraints are the concurrency control; `23505` is a handled signal.
3. One source of truth per fact (`opening_hours` is the exemplar — the AI's stated
   timings and the slot generator read the same column and can never drift).
4. jsonb for accumulating state, relational for entities.
5. RLS enabled, no policies, service-role only — until V4 dashboard brings real
   per-user auth + real policies.
6. Encrypt secrets at rest; minimum PII; `mobile` always from `parent.wa_phone`.
7. Indexes ship with the queries that need them, in the same migration.

## 4. Future schema (design seams, build when scheduled)

- **V2:** `parent_optins` (template consent), `reviews` (ask/response tracking),
  `missed_calls` (provider call id dedupe), reminders bookkeeping.
- **V3:** `voice_calls` (recordings pointer, consent, transcript ref) — retention policy
  decided at V3 design.
- **V4:** `organizations` → `schools` parent (multi-school), `users`/roles (real auth),
  RLS policies per role.
