-- Sets Glow Skin Clinic's structured opening hours (clinics.opening_hours) to
-- match its existing clinics.timings text ("Monday to Saturday, 10 AM to
-- 8 PM. Closed Sunday."). This is the single source of truth read by both
-- the AI receptionist (lib/knowledge/loader.ts) and the Google Calendar slot
-- generator (lib/scheduling/listAvailableSlots.ts) — see
-- /supabase/migrations/0005_clinic_opening_hours.sql.
-- Run after 0005_clinic_opening_hours.sql, and after the clinic has
-- connected its Google Calendar via /api/auth/google/connect (Phase 1).

update clinics
set
  opening_hours = '{
    "mon": [["10:00", "20:00"]],
    "tue": [["10:00", "20:00"]],
    "wed": [["10:00", "20:00"]],
    "thu": [["10:00", "20:00"]],
    "fri": [["10:00", "20:00"]],
    "sat": [["10:00", "20:00"]]
  }'::jsonb,
  slot_duration_minutes = 30,
  timezone = 'Asia/Kolkata'
where clinics.name = 'Glow Skin Clinic';
