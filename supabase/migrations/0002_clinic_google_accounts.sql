-- Medixum AI WhatsApp Receptionist — Google Calendar OAuth (Phase 1)
-- See /docs/GOOGLE_CALENDAR_INTEGRATION.md for the full design. This migration only
-- adds storage for the OAuth connection itself — availability/booking fields
-- (working_hours, slot_duration_minutes, timezone) land in a later migration
-- once Phase 2 (availability) is implemented.

create table clinic_google_accounts (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null unique references clinics(id) on delete cascade,
  google_email      text not null,
  calendar_id       text not null default 'primary',
  access_token      text not null,      -- AES-256-GCM ciphertext, see lib/google/tokenCrypto.ts
  refresh_token     text not null,      -- AES-256-GCM ciphertext, see lib/google/tokenCrypto.ts
  token_expiry      timestamptz not null,
  scope             text not null,
  sync_status       text not null default 'connected' check (sync_status in (
                      'connected', 'error', 'disconnected'
                    )),
  last_sync_error   text,
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index clinic_google_accounts_clinic_idx on clinic_google_accounts (clinic_id);

-- Same deny-by-default RLS posture as every other table (see 0001_init.sql) —
-- access is via the service-role key from trusted server code only.
alter table clinic_google_accounts enable row level security;
