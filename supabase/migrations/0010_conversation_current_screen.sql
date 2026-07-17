-- Medixum AI — Patient Experience Layer conversation state
-- PATIENT_EXPERIENCE.md §2/§7: current_screen records the semantic journey
-- moment last shown to the patient. Used to resolve typed equivalents of
-- taps (e.g. replying "2" to the numbered text menu is only a menu pick if
-- the menu was the last screen), for resume behaviour, and as the unit of
-- funnel analytics.

alter table conversations
  add column current_screen text not null default 'free_text';
