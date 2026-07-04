import { google } from "googleapis";
import { getValidGoogleClient } from "@/lib/google/tokenManager";
import { getBookedSlotWindows, getClinic, getClinicGoogleAccount } from "@/lib/supabase/queries";
import { resolveRequestedDateTime } from "@/lib/scheduling/requestedDateTime";
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
 *
 * `requestHint` is raw text (typically the patient's current message, or
 * their previously-collected preferred_date/preferred_time) that may state
 * a specific date/time. When it resolves to a real target, this function
 * NEVER falls back to "just the earliest slots" — production bug: a
 * patient asking for "tomorrow 5pm" was shown (and sometimes booked into)
 * today's earliest slots instead, because the old version of this function
 * always returned the chronologically-earliest N candidates with zero
 * awareness of what was actually requested. See
 * /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7.
 */
export async function listAvailableSlots(params: {
  clinicId: string;
  daysAhead?: number;
  requestHint?: string;
}): Promise<SchedulingSlot[] | null> {
  const account = await getClinicGoogleAccount(params.clinicId);
  if (!account || account.sync_status !== "connected") return null;

  const clinic = await getClinic(params.clinicId);
  if (!clinic || Object.keys(clinic.opening_hours).length === 0) {
    // No structured hours configured yet — treat exactly like "no working
    // Google connection" (fall back to the legacy flow) rather than silently
    // generating zero slots forever, which would look like a permanently
    // fully-booked clinic instead of a missing setup step.
    return null;
  }

  const client = await getValidGoogleClient(params.clinicId);
  if (!client) return null;

  const now = new Date();
  const target = params.requestHint
    ? resolveRequestedDateTime({ text: params.requestHint, timezone: clinic.timezone, now })
    : null;

  let daysAhead = params.daysAhead ?? DEFAULT_LOOKAHEAD_DAYS;
  if (target) {
    // Make sure the search window actually reaches the requested day —
    // otherwise a target a few days out would never even be considered.
    const daysUntilTarget = Math.ceil((target.toMillis() - now.getTime()) / (24 * 60 * 60 * 1000));
    daysAhead = Math.max(daysAhead, daysUntilTarget + 1);
  }
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
    workingHours: clinic.opening_hours,
    slotDurationMinutes: clinic.slot_duration_minutes,
    timezone: clinic.timezone,
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

  if (target) {
    const targetIso = target.toUTC().toISO();
    const exactMatch = available.find((slot) => slot.startsAt === targetIso);
    console.log("listAvailableSlots: resolved a specific requested date/time", {
      requestHint: params.requestHint,
      parsedTarget: targetIso,
      exactMatchFound: Boolean(exactMatch),
    });
    if (exactMatch) {
      // The exact requested slot is free — this is the ONLY slot that
      // should ever be offered/booked for this request. Never substitute a
      // different one just because it's earlier or more convenient.
      return [exactMatch];
    }
    // Not available — return the slots NEAREST to what was actually
    // requested (by absolute time distance), never the earliest-globally
    // slots, so "tomorrow 5pm unavailable" offers times near 5pm tomorrow,
    // not 11am today.
    const targetMillis = target.toMillis();
    const sorted = [...available].sort(
      (a, b) =>
        Math.abs(new Date(a.startsAt).getTime() - targetMillis) -
        Math.abs(new Date(b.startsAt).getTime() - targetMillis),
    );
    return sorted.slice(0, MAX_OFFERED_SLOTS);
  }

  return available.slice(0, MAX_OFFERED_SLOTS);
}
