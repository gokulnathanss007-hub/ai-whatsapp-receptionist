-- Medixum AI WhatsApp Receptionist — atomic booking claim
-- See /trigger/replyPipeline.ts and /lib/supabase/queries.ts (beginBookingAttempt).
--
-- Production-hardening fix: two near-simultaneous inbound messages (e.g. a
-- patient double-tapping "Confirm") each start their own Trigger.dev run,
-- and both can pass the in-memory "is a booking already in progress?" check
-- before either has written anything — a read-then-write race. A single
-- conditional UPDATE is atomic under Postgres row-level locking: when two
-- concurrent calls target the same conversation row, the second one's WHERE
-- clause is evaluated only after the first commits, so at most one of them
-- can ever see the row as "still claimable." No advisory lock or explicit
-- multi-statement transaction is needed — one UPDATE statement already is
-- one atomic unit of work.
create or replace function claim_booking_attempt(p_conversation_id uuid, p_wa_message_id text)
returns boolean
language plpgsql
as $$
declare
  v_row_count int;
begin
  update conversations
  set booking_status = 'booking_in_progress',
      booking_status_updated_at = now(),
      booking_in_progress_message_id = p_wa_message_id
  where id = p_conversation_id
    and (
      -- Claimable from any non-locked, non-final state...
      booking_status not in ('booking_in_progress', 'confirmed')
      -- ...or it's already booking_in_progress but for THIS SAME message —
      -- a Trigger.dev retry of the run that originally claimed it, not a
      -- second, different inbound message racing against it.
      or booking_in_progress_message_id = p_wa_message_id
    );

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;
