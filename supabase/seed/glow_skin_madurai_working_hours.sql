-- Sets Glow Skin Clinic's scheduling config to match its existing
-- clinics.timings text ("Monday to Saturday, 10 AM to 8 PM. Closed Sunday.").
-- Run after 0003_clinic_scheduling_config.sql, and after the clinic has
-- connected its Google Calendar via /api/auth/google/connect (Phase 1).

update clinic_google_accounts
set
  working_hours = '{
    "mon": [["10:00", "20:00"]],
    "tue": [["10:00", "20:00"]],
    "wed": [["10:00", "20:00"]],
    "thu": [["10:00", "20:00"]],
    "fri": [["10:00", "20:00"]],
    "sat": [["10:00", "20:00"]]
  }'::jsonb,
  slot_duration_minutes = 30,
  timezone = 'Asia/Kolkata'
from clinics
where clinics.id = clinic_google_accounts.clinic_id
  and clinics.name = 'Glow Skin Clinic';
