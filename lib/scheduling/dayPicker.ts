import { DateTime } from "luxon";
import { getClinic } from "@/lib/supabase/queries";
import { listAvailableSlots } from "@/lib/scheduling/listAvailableSlots";
import type { SchedulingSlot } from "@/lib/scheduling/types";

// Day-first booking (PATIENT_EXPERIENCE.md §5): patients pick a DAY, then a
// time. Day options are derived from real availability — a closed day
// (e.g. Sunday) has no free slots, so it can never appear; no separate
// "which days are we open" bookkeeping to drift out of sync.

const DAY_PICKER_WINDOW_DAYS = 7;
const DAY_ROW_ID_PATTERN = /^day_(\d{4}-\d{2}-\d{2})$/;

export interface DayOption {
  /** Clinic-local ISO date, e.g. "2026-07-19". */
  dayKey: string;
  /** Patient-facing label: "Today", "Tomorrow", "Sat, Jul 19". */
  title: string;
  /** How many free times that day (shown as the list row description). */
  freeCount: number;
}

export function dayRowId(dayKey: string): string {
  return `day_${dayKey}`;
}

/** Returns the clinic-local ISO date a day row id refers to, or null if the id isn't a day row. */
export function parseDayRowId(id: string): string | null {
  const match = DAY_ROW_ID_PATTERN.exec(id);
  return match ? match[1]! : null;
}

const TYPED_DAY_PATTERN =
  /\b(today|tomorrow|sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat)\b/i;
const WEEKDAY_TO_LUXON: Record<string, number> = {
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
  sun: 7, sunday: 7,
};

/**
 * Resolves a typed day-only reply to the day picker ("Saturday", "today",
 * "Tomorrow") into a clinic-local ISO date — every tap has a typed
 * equivalent (PATIENT_EXPERIENCE.md §6.2). Returns null when no day is
 * mentioned; time-of-day is NOT required (that's resolveRequestedDateTime's
 * job for full day+time messages).
 */
export function resolveTypedDay(params: { text: string; timezone: string; now: Date }): string | null {
  const match = TYPED_DAY_PATTERN.exec(params.text.toLowerCase());
  if (!match) return null;
  const base = DateTime.fromJSDate(params.now, { zone: params.timezone }).startOf("day");
  const word = match[1]!;
  if (word === "today") return base.toISODate();
  if (word === "tomorrow") return base.plus({ days: 1 }).toISODate();
  const wanted = WEEKDAY_TO_LUXON[word]!;
  let daysAhead = (wanted - base.weekday + 7) % 7;
  if (daysAhead === 0 && params.text.toLowerCase().includes("next")) daysAhead = 7;
  return base.plus({ days: daysAhead }).toISODate();
}

/**
 * Pure: groups free slots into per-day options, in chronological order.
 * Exported separately from the I/O wrapper so labelling and closed-day
 * exclusion are unit-testable without a calendar.
 */
export function groupSlotsIntoDayOptions(params: {
  slots: SchedulingSlot[];
  timezone: string;
  now: Date;
}): DayOption[] {
  const nowLocal = DateTime.fromJSDate(params.now, { zone: params.timezone });
  const byDay = new Map<string, { first: DateTime; count: number }>();

  for (const slot of params.slots) {
    const local = DateTime.fromISO(slot.startsAt).setZone(params.timezone);
    const dayKey = local.toISODate()!;
    const entry = byDay.get(dayKey);
    if (entry) {
      entry.count += 1;
    } else {
      byDay.set(dayKey, { first: local, count: 1 });
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dayKey, { first, count }]) => {
      const title = first.hasSame(nowLocal, "day")
        ? "Today"
        : first.hasSame(nowLocal.plus({ days: 1 }), "day")
          ? "Tomorrow"
          : first.toFormat("EEE, MMM d");
      return { dayKey, title, freeCount: count };
    });
}

/**
 * Days in the next week that actually have free times — the rows of the
 * day-picker list. Null mirrors listAvailableSlots' "no working calendar"
 * contract.
 */
export async function listOpenDays(clinicId: string): Promise<DayOption[] | null> {
  const clinic = await getClinic(clinicId);
  if (!clinic) return null;
  const slots = await listAvailableSlots({
    clinicId,
    daysAhead: DAY_PICKER_WINDOW_DAYS,
    limit: 1000,
  });
  if (slots === null) return null;
  return groupSlotsIntoDayOptions({ slots, timezone: clinic.timezone, now: new Date() });
}
