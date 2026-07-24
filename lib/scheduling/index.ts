import { GoogleCalendarProvider } from "@/lib/scheduling/googleCalendarProvider";
import type { SchedulingProvider } from "@/lib/scheduling/types";
import { getSchoolGoogleAccount } from "@/lib/supabase/queries";

/**
 * Returns the scheduling backend for a school, or null if it has none
 * connected/working — callers should treat null as "fall back to the legacy
 * free-text admission_enquiries flow," not as an error.
 *
 * Currently always a GoogleCalendarProvider; this is the seam a future
 * provider selection (Outlook, ...) plugs into without touching any caller
 * of this function.
 */
export async function getSchedulingProvider(schoolId: string): Promise<SchedulingProvider | null> {
  const account = await getSchoolGoogleAccount(schoolId);
  if (!account || account.sync_status !== "connected") return null;
  return new GoogleCalendarProvider(schoolId);
}

export type { BookSlotParams, BookSlotResult, SchedulingProvider, SchedulingSlot } from "@/lib/scheduling/types";
