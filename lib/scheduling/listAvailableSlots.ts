import { google } from "googleapis";
import { getValidGoogleClient } from "@/lib/google/tokenManager";
import { getBookedSlotWindows, getClinicGoogleAccount } from "@/lib/supabase/queries";
import { filterOutBusy, generateCandidateSlots } from "@/lib/scheduling/slotGenerator";
import type { SchedulingSlot } from "@/lib/scheduling/types";

const DEFAULT_LOOKAHEAD_DAYS = 3;
const MAX_OFFERED_SLOTS = 5;

/**
 * Real, calendar-checked available slots for a clinic: working hours minus
 * (a) whatever Google Calendar reports as busy, and (b) whatever Postgres
 * already has booked for this clinic. (b) matters because Postgres commits
 * a booking instantly while the matching Calendar event is created in a
 * separate follow-up call — without this check, a slot that was just booked
 * a moment ago could still show up as "available" here until Calendar sync
 * catches up. Returns null if the clinic has no connected (or currently
 * working) Google Calendar — callers should treat that as "fall back to the
 * legacy flow," not as an error.
 */
export async function listAvailableSlots(params: {
  clinicId: string;
  daysAhead?: number;
}): Promise<SchedulingSlot[] | null> {
  const account = await getClinicGoogleAccount(params.clinicId);
  if (!account || account.sync_status !== "connected") return null;

  const client = await getValidGoogleClient(params.clinicId);
  if (!client) return null;

  const daysAhead = params.daysAhead ?? DEFAULT_LOOKAHEAD_DAYS;
  const now = new Date();
  const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const calendar = google.calendar({ version: "v3", auth: client });
  const [freebusy, bookedWindows] = await Promise.all([
    calendar.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: account.calendar_id }],
      },
    }),
    getBookedSlotWindows(account.id, now.toISOString(), timeMax.toISOString()),
  ]);

  const busy = freebusy.data.calendars?.[account.calendar_id]?.busy ?? [];

  const candidates = generateCandidateSlots({
    workingHours: account.working_hours,
    slotDurationMinutes: account.slot_duration_minutes,
    timezone: account.timezone,
    fromDate: now,
    daysAhead,
  });

  const busyIntervals = [
    ...busy
      .filter((interval) => interval.start && interval.end)
      .map((interval) => ({ start: interval.start!, end: interval.end! })),
    ...bookedWindows.map((window) => ({ start: window.slot_start, end: window.slot_end })),
  ];

  const available = filterOutBusy(candidates, busyIntervals);

  return available.slice(0, MAX_OFFERED_SLOTS);
}
