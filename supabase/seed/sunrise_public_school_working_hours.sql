-- Sets Sunrise Public School's structured opening hours (schools.opening_hours)
-- to match its existing schools.timings text ("Monday to Saturday, 9 AM to
-- 4 PM. Closed Sunday."). This is the single source of truth read by both
-- the AI receptionist (lib/knowledge/loader.ts) and the Google Calendar slot
-- generator (lib/scheduling/listAvailableSlots.ts) — see
-- /supabase/migrations/0005_clinic_opening_hours.sql.
-- Run after 0012_rename_clinic_to_school.sql, and after the school has
-- connected its Google Calendar via /api/auth/google/connect.

update schools
set
  opening_hours = '{
    "mon": [["09:00", "16:00"]],
    "tue": [["09:00", "16:00"]],
    "wed": [["09:00", "16:00"]],
    "thu": [["09:00", "16:00"]],
    "fri": [["09:00", "16:00"]],
    "sat": [["09:00", "16:00"]]
  }'::jsonb,
  slot_duration_minutes = 30,
  timezone = 'Asia/Kolkata'
where schools.name = 'Sunrise Public School';
