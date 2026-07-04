-- Medixum AI WhatsApp Receptionist — Availability config (Phase 2)
-- See /docs/GOOGLE_CALENDAR_INTEGRATION.md §3, §5. Deferred from
-- 0002_clinic_google_accounts.sql on purpose — Phase 1 only needed to prove
-- the OAuth connection, not scheduling math.

alter table clinic_google_accounts
  add column working_hours jsonb not null default '{}'::jsonb,
  add column slot_duration_minutes int not null default 30,
  add column timezone text not null default 'Asia/Kolkata';
