-- Medixum AI — direct reception contact number
-- The "Talk to Receptionist" handoff previously told patients staff would
-- reply "here soon" with no way to reach a real person directly. This adds
-- a per-clinic contact number (WhatsApp or call) surfaced on that handoff —
-- never hardcoded, so it works for any clinic (CLAUDE.md: no clinic data in
-- code). Nullable: clinics that haven't set one keep the generic message.

alter table clinics
  add column reception_phone text;
