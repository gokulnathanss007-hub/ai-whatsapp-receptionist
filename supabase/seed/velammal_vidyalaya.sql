-- Pilot school seed — Velammal Vidyalaya, Viraganoor, Madurai (real tenant,
-- renamed 2026-07-24 from the earlier "Sunrise Public School" placeholder).
-- Mirrors the worked example in /docs/FAQ_SCHEMA.json and
-- /docs/03-engineering/KNOWLEDGE_STRUCTURE.md §4.
-- Run after 0012_rename_clinic_to_school.sql. The prior "Glow Skin Clinic"
-- seed (supabase/seed/glow_skin_madurai*.sql) is left untouched as
-- historical reference for the clinic-era pilot, not reused here.

with new_school as (
  insert into schools (
    name, city, address, maps_url, timings, parking_info, languages,
    payment_methods, follow_up_policy, cancellation_policy,
    rescheduling_policy, auto_confirm_enabled, interactive_enabled, knowledge_version
  ) values (
    'Velammal Vidyalaya',
    'Madurai',
    'Viraganoor, Madurai',
    'https://www.google.com/maps/search/?api=1&query=Velammal+Vidyalaya%2C+Viraganoor%2C+Madurai',
    'Monday to Saturday, 9 AM to 4 PM. Closed Sunday.',
    'Visitor parking available inside the main gate.',
    '{en}',
    '{cash,upi,card,bank_transfer}',
    'Our admissions office follows up within 2 working days of an enquiry.',
    'Let us know and our office will cancel your scheduled visit.',
    'Share your preferred new day/time; our office will update it.',
    false,
    -- Interactive (tappable buttons/lists) — on by default for this pilot
    -- tenant so the redesigned Admission Desk sub-flow (2026-07-23) renders
    -- as real WhatsApp list messages, not just numbered text.
    true,
    2
  )
  returning id
)
insert into school_whatsapp_numbers (school_id, phone_number_id, display_number)
select id, '1229528263568640', null from new_school;

insert into school_staff (school_id, name, role, is_active)
select schools.id, s.name, s.role, true
from schools, (values
  ('Mrs. Kavitha Raman', 'Principal'),
  ('Mr. Arun Kumar', 'Admissions Officer')
) as s(name, role)
where schools.name = 'Velammal Vidyalaya';

insert into school_services (school_id, service_key, display_name, high_level_info, is_active)
select id, service_key, display_name, high_level_info, true
from schools, (values
  ('kindergarten', 'Kindergarten', 'Play group through UKG; admission enquiries welcome year-round.'),
  ('primary', 'Primary School (Grades 1-5)', 'CBSE-affiliated primary curriculum.'),
  ('middle', 'Middle School (Grades 6-8)', 'CBSE-affiliated middle school curriculum.'),
  ('high_school', 'High School (Grades 9-10)', 'CBSE-affiliated high school curriculum, board exam preparation.'),
  ('senior_secondary', 'Senior Secondary (Grades 11-12)', 'Science and Commerce streams available.')
) as s(service_key, display_name, high_level_info)
where schools.name = 'Velammal Vidyalaya';

insert into school_faqs (school_id, faq_id, category, question, answer, keywords, requires_staff)
select id, faq_id, category, question, answer, keywords, requires_staff
from schools, (values
  ('admission_enquiry', 'admission_enquiry', 'How do I apply for admission?',
   'Share your child''s name, age, and the grade you are applying for, and our admissions office will guide you through the next steps.', array['admission','apply','enquiry','join','enroll'], false),
  ('fee_structure', 'fee_structure', 'What is the fee structure?',
   'Fees vary by grade. Our admissions office will share the exact fee structure for the grade you are enquiring about.', array['fee','fees','cost','charges','tuition'], true),
  ('school_timings', 'school_timings', 'What are the school timings?',
   'We are open Monday to Saturday, 9 AM to 4 PM. We are closed on Sundays.', array['timing','hours','open','school hours'], false),
  ('transport', 'transport', 'Is school bus transport available?',
   'Yes, we offer bus transport on select routes. Share your area and our office will confirm if a route covers it.', array['bus','transport','route','pickup','drop'], false),
  ('holidays_events', 'holidays_events', 'When is the next holiday?',
   'Our academic calendar lists all holidays and events. Our office can share the current term''s calendar with you.', array['holiday','vacation','event','calendar'], false),
  ('facilities', 'facilities', 'What facilities does the school have?',
   'Our campus has a library, science and computer labs, a playground, and a sports ground.', array['facilities','library','lab','playground','sports'], false),
  ('contact_office', 'contact_office', 'How do I contact the school office?',
   'You can continue chatting here, and our office team will also be happy to speak with you directly.', array['contact','office','phone','talk','reach'], false),
  ('certificates', 'certificates', 'How do I get a transfer certificate?',
   'Transfer and bonafide certificates are issued by our office on request. Our office will guide you through the process.', array['certificate','transfer certificate','bonafide','tc'], true),
  ('location', 'location', 'Where is the school located?',
   'We are at Viraganoor, Madurai. A Google Maps link is shared on request.', array['address','where','location','directions','maps'], false),
  ('curriculum', 'general', 'What curriculum/board do you follow?',
   'We follow the CBSE curriculum from Kindergarten through Grade 12.', array['curriculum','board','cbse','syllabus'], false)
) as f(faq_id, category, question, answer, keywords, requires_staff)
where schools.name = 'Velammal Vidyalaya';
