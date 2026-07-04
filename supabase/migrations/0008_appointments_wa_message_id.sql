-- Medixum AI WhatsApp Receptionist — idempotent booking retries
-- See /lib/scheduling/bookSlot.ts.
--
-- Production-hardening fix: if a task run crashes AFTER the Postgres insert
-- in bookSlot() succeeds but BEFORE the WhatsApp reply is sent, Trigger.dev
-- retries the same wa_message_id. Without this column, the retry would see
-- the slot correctly filtered out of fresh availability (it's already
-- booked) and wrongly tell the very patient who just booked it that the
-- slot is unavailable. Storing which inbound message created each
-- appointment lets bookSlot() recognize "this exact message already
-- succeeded" and resend the same confirmation instead.
alter table appointments
  add column wa_message_id text;

-- At most one appointment per originating message — defense in depth in the
-- database itself, not just the application-level check in bookSlot.ts.
create unique index appointments_wa_message_id_idx
  on appointments (wa_message_id)
  where wa_message_id is not null;
