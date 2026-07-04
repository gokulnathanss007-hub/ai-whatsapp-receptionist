import { DateTime } from "luxon";
import type { WorkingHours } from "@/lib/supabase/types";
import type { SchedulingSlot } from "@/lib/scheduling/types";

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export interface BusyInterval {
  start: string; // ISO 8601
  end: string; // ISO 8601
}

/** Pure: working hours → every bookable slot in the window, no calendar I/O. */
export function generateCandidateSlots(params: {
  workingHours: WorkingHours;
  slotDurationMinutes: number;
  timezone: string;
  fromDate: Date;
  daysAhead: number;
}): SchedulingSlot[] {
  const { workingHours, slotDurationMinutes, timezone, fromDate, daysAhead } = params;
  const now = DateTime.fromJSDate(fromDate, { zone: timezone });
  const slots: SchedulingSlot[] = [];

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const day = now.plus({ days: dayOffset }).startOf("day");
    const weekdayKey = WEEKDAY_KEYS[day.weekday - 1]; // luxon: Monday = 1 ... Sunday = 7
    const ranges = (weekdayKey && workingHours[weekdayKey]) || [];

    for (const [startStr, endStr] of ranges) {
      let cursor = setTimeOfDay(day, startStr);
      const rangeEnd = setTimeOfDay(day, endStr);

      while (cursor.plus({ minutes: slotDurationMinutes }) <= rangeEnd) {
        if (cursor > now) {
          const slotEnd = cursor.plus({ minutes: slotDurationMinutes });
          slots.push({
            id: Buffer.from(cursor.toUTC().toISO()!).toString("base64url"),
            startsAt: cursor.toUTC().toISO()!,
            endsAt: slotEnd.toUTC().toISO()!,
            label: formatLabel(cursor, now),
          });
        }
        cursor = cursor.plus({ minutes: slotDurationMinutes });
      }
    }
  }

  return slots;
}

/** Pure: drops any candidate slot that overlaps a busy interval. */
export function filterOutBusy(
  slots: SchedulingSlot[],
  busy: BusyInterval[],
): SchedulingSlot[] {
  return slots.filter((slot) => {
    const slotStart = new Date(slot.startsAt).getTime();
    const slotEnd = new Date(slot.endsAt).getTime();
    return !busy.some((interval) => {
      const busyStart = new Date(interval.start).getTime();
      const busyEnd = new Date(interval.end).getTime();
      return slotStart < busyEnd && slotEnd > busyStart;
    });
  });
}

function setTimeOfDay(day: DateTime, hhmm: string): DateTime {
  const [hour, minute] = hhmm.split(":").map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

function formatLabel(slot: DateTime, now: DateTime): string {
  const dayLabel = slot.hasSame(now, "day")
    ? "Today"
    : slot.hasSame(now.plus({ days: 1 }), "day")
      ? "Tomorrow"
      : slot.toFormat("EEE, MMM d");
  return `${dayLabel} – ${slot.toFormat("h:mm a")}`;
}
