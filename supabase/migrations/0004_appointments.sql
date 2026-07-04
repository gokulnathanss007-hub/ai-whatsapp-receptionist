-- Medixum AI WhatsApp Receptionist — Booking (Phase 3)
-- See /docs/GOOGLE_CALENDAR_INTEGRATION.md §3, §7.
--
-- Separate from appointment_requests (the legacy free-text, staff-confirmed
-- flow, unchanged) — this table is for calendar-confirmed bookings, where
-- the AI (eventually) confirms directly because it already checked real
-- availability. The unique constraint below is the actual concurrency
-- control for double-booking prevention: Google Calendar has no
-- compare-and-swap primitive, so Postgres has to be the arbiter.

create table appointments (
  id                         uuid primary key default gen_random_uuid(),
  clinic_id                  uuid not null references clinics(id) on delete cascade,
  patient_id                 uuid not null references patients(id) on delete cascade,
  conversation_id            uuid not null references conversations(id) on delete cascade,
  clinic_google_account_id   uuid not null references clinic_google_accounts(id) on delete restrict,
  name                       text not null,
  mobile                     text not null,
  reason                     text not null,
  slot_start                 timestamptz not null,
  slot_end                   timestamptz not null,
  timezone                   text not null,
  google_event_id            text,
  status                     text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  sync_status                text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed')),
  last_sync_error            text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (clinic_google_account_id, slot_start)
);

create index appointments_clinic_idx on appointments (clinic_id, slot_start);

alter table appointments enable row level security;
