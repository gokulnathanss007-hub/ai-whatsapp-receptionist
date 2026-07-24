import { DateTime } from "luxon";

const TIME_PATTERN = /(\d{1,2})[:.]?(\d{2})?\s*(am|pm)/i;

// Longest alternative first so "tuesday" matches as a whole word, never as
// a bare "tue" prefix leaving "sday" behind. luxon weekday: Mon=1 ... Sun=7.
const WEEKDAY_PATTERN =
  /\b(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat)\b/i;
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
 * Resolves free text into an exact target DateTime, ONLY for the
 * unambiguous cases we can confidently parse: "today"/"tomorrow"/a weekday
 * name (or no day mentioned, defaulting to today) combined with a clear
 * AM/PM time. Returns null for anything else (explicit numeric calendar
 * dates like "12/8", times with no AM/PM marker) rather than guessing —
 * callers must fall back to the generic nearest-slots flow in that case.
 * This is deliberately narrow: a wrong exact-match check is worse than no
 * exact-match check, since it drives which single slot gets treated as
 * authoritative.
 *
 * Weekday names resolve to their NEXT occurrence in the school's timezone
 * ("Monday 5 PM" asked on a Thursday → the coming Monday, never today). If
 * today IS the named weekday, it means today while the time is still ahead,
 * and rolls to next week once it has passed — same as a school office would
 * read it. "next <weekday>" always skips past today.
 *
 * P0 incident this weekday support closes: "Book me on Monday at 5 PM"
 * previously resolved to null, so availability silently degraded to the
 * earliest-slots flow (today's grid slots near the current time), the model
 * picked from that wrong list, and the time-of-day-only mismatch guard in
 * trigger/replyPipeline.ts could approve a same-time-WRONG-DAY slot. The
 * parent ended up booked today for a visit they asked for on
 * Monday. With a real target resolved here, the exact-match path and the
 * full day+time mismatch guard both engage instead.
 *
 * Root cause this file exists to fix: lib/scheduling/listAvailableSlots.ts
 * used to always return the chronologically-earliest slots with zero
 * awareness of what the parent actually asked for — see
 * /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7 for the incident this covers.
 */
export function resolveRequestedDateTime(params: {
  text: string;
  timezone: string;
  now: Date;
}): DateTime | null {
  const { text, timezone, now } = params;
  const match = TIME_PATTERN.exec(text);
  if (!match) return null;

  let hour = parseInt(match[1]!, 10);
  const minute = match[2] ? parseInt(match[2]!, 10) : 0;
  const meridiem = match[3]!.toLowerCase();
  if (hour === 12) hour = 0;
  if (meridiem === "pm") hour += 12;
  if (hour > 23 || minute > 59) return null;

  const nowInZone = DateTime.fromJSDate(now, { zone: timezone });
  const base = nowInZone.startOf("day");
  const lower = text.toLowerCase();
  const weekdayMatch = WEEKDAY_PATTERN.exec(lower);
  let targetDay: DateTime;
  if (lower.includes("tomorrow")) {
    targetDay = base.plus({ days: 1 });
  } else if (lower.includes("today") || lower.includes("now")) {
    targetDay = base;
  } else if (weekdayMatch) {
    const wantedWeekday = WEEKDAY_TO_LUXON[weekdayMatch[1]!.toLowerCase()]!;
    let daysAhead = (wantedWeekday - base.weekday + 7) % 7;
    const candidate = base.plus({ days: daysAhead }).set({ hour, minute, second: 0, millisecond: 0 });
    // "next Monday" always means the following week's Monday; a bare
    // "Monday" said ON a Monday means today only while the time is still
    // ahead — once it's passed, the only sensible reading is next week.
    if (daysAhead === 0 && (lower.includes("next") || candidate <= nowInZone)) {
      daysAhead += 7;
    }
    targetDay = base.plus({ days: daysAhead });
  } else if (/\d{1,2}[/\-]\d{1,2}/.test(lower)) {
    // Explicit numeric calendar dates stay unresolved on purpose — "12/8"
    // is ambiguous (Dec 8 vs Aug 12) and a wrong guess here would drive
    // which slot gets booked. Bail; the nearest-slots flow + the mismatch
    // guard handle it conservatively.
    return null;
  } else {
    // No day mentioned at all — default to today, same as a walk-in parent
    // asking "is 5pm free?" would mean.
    targetDay = base;
  }

  return targetDay.set({ hour, minute, second: 0, millisecond: 0 });
}

/** Formats a resolved target for parent-facing text, e.g. "Tomorrow at 5:00 PM". */
export function formatRequestedLabel(target: DateTime, timezone: string, now: Date): string {
  const nowInZone = DateTime.fromJSDate(now, { zone: timezone });
  const dayLabel = target.hasSame(nowInZone, "day")
    ? "Today"
    : target.hasSame(nowInZone.plus({ days: 1 }), "day")
      ? "Tomorrow"
      : target.toFormat("EEE, MMM d");
  return `${dayLabel} at ${target.toFormat("h:mm a")}`;
}
