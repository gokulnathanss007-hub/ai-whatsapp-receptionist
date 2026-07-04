import { logger, schedules } from "@trigger.dev/sdk";
import { BOOKING_IN_PROGRESS_TIMEOUT_MS } from "@/lib/ai/bookingStatus";
import { markStaleBookingsTimedOut } from "@/lib/supabase/queries";

/**
 * Safety net for the requirement that every booking attempt reaches a
 * terminal state (confirmed / failed / timeout), covering the one gap the
 * reactive check in trigger/replyPipeline.ts can't: that check only fires
 * when a NEW inbound message arrives for a conversation stuck at
 * booking_in_progress. If a run crashes mid-booking and the patient never
 * writes back, nothing would otherwise ever move that conversation out of
 * booking_in_progress — it would sit there permanently. This sweep runs
 * independently of any patient activity and guarantees a terminal state is
 * always eventually reached.
 */
export const bookingTimeoutSweepTask = schedules.task({
  id: "booking-timeout-sweep",
  cron: "*/2 * * * *",
  run: async () => {
    const staleBefore = new Date(Date.now() - BOOKING_IN_PROGRESS_TIMEOUT_MS).toISOString();
    const timedOutConversationIds = await markStaleBookingsTimedOut(staleBefore);
    if (timedOutConversationIds.length > 0) {
      logger.error("Booking Timeout — swept stale booking_in_progress conversations", {
        count: timedOutConversationIds.length,
        conversationIds: timedOutConversationIds,
      });
    }
    return { timedOut: timedOutConversationIds.length };
  },
});
