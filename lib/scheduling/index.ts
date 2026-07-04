import { GoogleCalendarProvider } from "@/lib/scheduling/googleCalendarProvider";
import type { SchedulingProvider } from "@/lib/scheduling/types";
import { getClinicGoogleAccount } from "@/lib/supabase/queries";

/**
 * Returns the scheduling backend for a clinic, or null if it has none
 * connected/working — callers should treat null as "fall back to the legacy
 * free-text appointment_requests flow," not as an error.
 *
 * Currently always a GoogleCalendarProvider; this is the seam a future
 * provider selection (Outlook, Practo Ray, MocDoc, ...) plugs into without
 * touching any caller of this function.
 */
export async function getSchedulingProvider(clinicId: string): Promise<SchedulingProvider | null> {
  const account = await getClinicGoogleAccount(clinicId);
  if (!account || account.sync_status !== "connected") return null;
  return new GoogleCalendarProvider(clinicId);
}

export type { BookSlotParams, BookSlotResult, SchedulingProvider, SchedulingSlot } from "@/lib/scheduling/types";
