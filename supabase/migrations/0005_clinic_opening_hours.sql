-- Medixum AI WhatsApp Receptionist — single source of truth for clinic hours
-- Bug this fixes: clinic_google_accounts.working_hours (used by the actual
-- slot generator / Google Calendar booking) and clinics.timings (the
-- freeform text the AI receptionist reads out to patients) were two
-- disconnected fields. A clinic's profile could be fully filled in —
-- address, Google Maps link, "10 AM to 8 PM" text — while working_hours
-- silently defaulted to '{}' (empty), so the receptionist would claim hours
-- that the booking engine had zero awareness of and could never generate a
-- slot for. Moving the structured hours onto the clinic profile itself
-- (alongside maps_url) makes them one fact the whole app reads, instead of
-- two facts someone has to remember to keep in sync.

alter table clinics
  add column opening_hours jsonb not null default '{}'::jsonb,
  add column slot_duration_minutes int not null default 30,
  add column timezone text not null default 'Asia/Kolkata';

alter table clinic_google_accounts
  drop column if exists working_hours,
  drop column if exists slot_duration_minutes,
  drop column if exists timezone;
