-- Medixum AI WhatsApp Receptionist — persisted booking negotiation state
-- See /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7 and the incident this closes:
-- a patient confirming an offered slot could see the AI claim success, then
-- walk it back, then stall on "still confirming" for 15+ minutes with no
-- real backend state behind any of it. booking_status is the backend's own
-- record of where a booking attempt actually is — the AI must read it, never
-- invent it.
--
-- One-way once booking_in_progress starts: the only valid next values are
-- confirmed / failed / timeout (enforced in lib/ai/bookingStatus.ts, not the
-- database — Postgres check constraints can't express "valid successor of
-- the current row", so the app is the source of truth for the transition
-- rule; this constraint only guards against typos/garbage values).
alter table conversations
  add column booking_status text not null default 'none' check (booking_status in (
    'none', 'waiting_for_confirmation', 'booking_in_progress', 'confirmed', 'failed', 'timeout'
  )),
  add column booking_status_updated_at timestamptz not null default now(),
  -- The wa_message_id that started the current booking_in_progress attempt.
  -- Lets a retried Trigger.dev run of THAT SAME message tell itself apart
  -- from a genuinely new inbound message arriving while the attempt is still
  -- in flight — only the latter gets the "still being confirmed" short-circuit
  -- reply in trigger/replyPipeline.ts.
  add column booking_in_progress_message_id text;
