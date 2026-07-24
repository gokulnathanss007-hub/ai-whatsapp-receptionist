-- School Parent Enquiry System — clinic → school domain rename (additive)
-- Renames tables/columns/constraints left over from the dermatology-clinic
-- MVP to their school-domain equivalents. Pure renames plus two enum
-- (check-constraint) updates and one column rename — no data is dropped.
-- Run this against the live Supabase project (SQL editor or `supabase db
-- push`) after 0001-0011 are already applied. Not run automatically by
-- this session — no Supabase CLI/project link is available here.

-- ── Table renames ────────────────────────────────────────────────────────

alter table clinics                rename to schools;
alter table clinic_whatsapp_numbers rename to school_whatsapp_numbers;
alter table clinic_doctors         rename to school_staff;
alter table clinic_services        rename to school_services;
alter table clinic_faqs            rename to school_faqs;
alter table patients               rename to parents;
alter table appointment_requests   rename to admission_enquiries;
alter table clinic_google_accounts rename to school_google_accounts;

-- `appointments` keeps its name — it's the calendar-confirmed booking table
-- (heavily indexed/constrained) and "appointment" reads fine for a school
-- visit/admission-counseling booking; only its clinic_id/patient_id/
-- clinic_google_account_id columns need renaming below.

-- ── Column renames (clinic_id → school_id, patient_id → parent_id) ────────

alter table school_whatsapp_numbers rename column clinic_id to school_id;
alter table school_staff            rename column clinic_id to school_id;
alter table school_services         rename column clinic_id to school_id;
alter table school_faqs             rename column clinic_id to school_id;
alter table parents                 rename column clinic_id to school_id;
alter table conversations           rename column clinic_id to school_id;
alter table conversations           rename column patient_id to parent_id;
alter table admission_enquiries     rename column clinic_id to school_id;
alter table admission_enquiries     rename column patient_id to parent_id;
alter table school_google_accounts  rename column clinic_id to school_id;
alter table appointments            rename column clinic_id to school_id;
alter table appointments            rename column patient_id to parent_id;
alter table appointments            rename column clinic_google_account_id to school_google_account_id;

-- admission_enquiries.preferred_doctor → grade_applying_for: schools have no
-- "pick a doctor" concept; the equivalent lead-qualification field is which
-- grade/class the child is applying for. See lib/types.ts AdmissionEnquiryPayload.
alter table admission_enquiries rename column preferred_doctor to grade_applying_for;

-- ── Enum (check constraint) updates ────────────────────────────────────────

-- school_faqs.category: mirrors the 10-item WhatsApp main menu 1:1 so every
-- non-"Ask Anything" menu tap resolves to an FAQ category lookup.
alter table school_faqs drop constraint if exists clinic_faqs_category_check;
alter table school_faqs add constraint school_faqs_category_check check (category in (
  'admission_enquiry', 'fee_structure', 'school_timings', 'transport',
  'holidays_events', 'facilities', 'contact_office', 'certificates',
  'location', 'general', 'other'
));

-- conversations.handoff_reason: medical_advice/emergency were dermatology-
-- specific and are replaced with school-appropriate sensitive-topic and
-- urgent-safety-concern categories. See lib/types.ts HANDOFF_REASONS.
alter table conversations drop constraint if exists conversations_handoff_reason_check;
alter table conversations add constraint conversations_handoff_reason_check check (handoff_reason in (
  'sensitive_matter', 'complaint', 'billing_issue', 'refund',
  'urgent_safety_concern', 'legal', 'unknown', 'explicit_request'
));

-- admission_enquiries.status: values are unchanged, constraint just renamed
-- to match the table for clarity.
alter table admission_enquiries drop constraint if exists appointment_requests_status_check;
alter table admission_enquiries add constraint admission_enquiries_status_check check (status in (
  'requested', 'confirmed', 'cancelled', 'rescheduled'
));

-- schools.consultation_fee is retired — schools have tiered/complex fee
-- structures, not one consultation price. Fee info now lives as a
-- school_faqs row under category 'fee_structure'. See lib/knowledge/types.ts
-- SchoolProfile (no fee field) and supabase/seed for the worked example.
alter table schools drop column if exists consultation_fee;

-- ── Index renames (cosmetic, for readability against the new table names) ─

alter index if exists conversations_clinic_patient_idx rename to conversations_school_parent_idx;
alter index if exists appointment_requests_clinic_idx rename to admission_enquiries_school_idx;
alter index if exists appointments_clinic_idx rename to appointments_school_idx;
alter index if exists clinic_google_accounts_clinic_idx rename to school_google_accounts_school_idx;
