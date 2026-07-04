-- Pilot clinic seed — Glow Skin Clinic (Madurai)
-- Mirrors the worked example in /docs/FAQ_SCHEMA.json and /docs/KNOWLEDGE_STRUCTURE.md §4.
-- Run after 0001_init.sql.

with new_clinic as (
  insert into clinics (
    name, city, address, maps_url, timings, parking_info, languages,
    consultation_fee, payment_methods, follow_up_policy, cancellation_policy,
    rescheduling_policy, auto_confirm_enabled, knowledge_version
  ) values (
    'Glow Skin Clinic',
    'Madurai',
    '1st Floor, Anna Nagar Main Road, Madurai',
    'https://maps.google.com/?q=Glow+Skin+Clinic+Madurai',
    'Monday to Saturday, 10 AM to 8 PM. Closed Sunday.',
    'Two-wheeler and car parking in front of the clinic.',
    '{en}',
    500,
    '{cash,upi,card}',
    'Follow-up within 7 days is complimentary.',
    'Inform us and staff will cancel.',
    'Share new preferred day/time; staff will update.',
    false,
    1
  )
  returning id
)
insert into clinic_whatsapp_numbers (clinic_id, phone_number_id, display_number)
select id, '1229528263568640', null from new_clinic;

insert into clinic_doctors (clinic_id, name, role, is_active)
select id, 'Dr. Meera', 'Consultant Dermatologist', true
from clinics where name = 'Glow Skin Clinic';

insert into clinic_services (clinic_id, service_key, display_name, high_level_info, is_active)
select id, service_key, display_name, high_level_info, true
from clinics, (values
  ('acne', 'Acne', 'Treatments to improve acne; consultation required.'),
  ('pigmentation', 'Pigmentation', 'Treatments to improve uneven skin tone; consultation required.'),
  ('laser_hair_reduction', 'Laser hair reduction', 'Reduces unwanted hair over sessions; consultation required.'),
  ('hydrafacial', 'HydraFacial', 'Hydrating facial treatment; consultation required.')
) as s(service_key, display_name, high_level_info)
where clinics.name = 'Glow Skin Clinic';

insert into clinic_faqs (clinic_id, faq_id, category, question, answer, keywords, requires_staff)
select id, faq_id, category, question, answer, keywords, requires_staff
from clinics, (values
  ('consultation_fee', 'consultation_fee', 'What is the consultation fee?',
   'Our consultation fee is ₹500.', array['fee','charges','consultation cost','price'], false),
  ('clinic_timings', 'clinic_timings', 'What are your clinic timings?',
   'We are open Monday to Saturday, 10 AM to 8 PM. We are closed on Sundays.', array['timing','open','hours','working hours'], false),
  ('location', 'location', 'Where is the clinic located?',
   'We are at 1st Floor, Anna Nagar Main Road, Madurai. Google Maps link is shared on request.', array['address','where','location','directions','maps'], false),
  ('parking', 'parking', 'Is parking available?',
   'Yes, two-wheeler and car parking are available in front of the clinic.', array['parking','car','bike'], false),
  ('insurance', 'insurance', 'Do you accept insurance?',
   'Most cosmetic and dermatology consultations are self-pay. For specific insurance queries, our staff will assist you.', array['insurance','claim','mediclaim'], true),
  ('doctors', 'doctors', 'Who are the doctors?',
   'Consultations are with Dr. Meera, our consultant dermatologist. Cosmetology procedures are performed under her supervision.', array['doctor','dermatologist','who'], false),
  ('payment_methods', 'payment_methods', 'What payment methods are accepted?',
   'We accept cash, UPI, and cards.', array['payment','upi','card','cash','gpay'], false),
  ('follow_up_policy', 'follow_up_policy', 'Is there a follow-up charge?',
   'A follow-up within 7 days of consultation is complimentary.', array['follow up','review','revisit'], false),
  ('appointment_cancellation', 'appointment_cancellation', 'How do I cancel an appointment?',
   'You can let us know here and our staff will cancel it for you.', array['cancel','cancellation'], false),
  ('rescheduling', 'rescheduling', 'Can I reschedule my appointment?',
   'Yes, share your preferred new day and time and we''ll update your request.', array['reschedule','change time','postpone'], false)
) as f(faq_id, category, question, answer, keywords, requires_staff)
where clinics.name = 'Glow Skin Clinic';
