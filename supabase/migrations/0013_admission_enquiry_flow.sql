-- Admission Enquiry flow redesign (2026-07-23) — additive only, no data
-- dropped, no other table touched. Backs the new deterministic "Admission
-- Desk" sub-menu (Is Admission Open / Talk to Admission Office) — see
-- lib/decision-engine/admissionMenu.ts and trigger/replyPipeline.ts.

-- The "Talk to Admission Office" step now collects the child's name as its
-- own field (previously only the parent's name/reason were captured here).
alter table admission_enquiries add column if not exists child_name text;

-- Eligibility screen (per-class age ranges) was removed from the Admission
-- Desk before this migration shipped anywhere (2026-07-24) — drop in case an
-- earlier version of this file already ran against a dev database.
alter table school_services drop column if exists eligibility_min_age;
alter table school_services drop column if exists eligibility_max_age;
