import { DateTime } from "luxon";

const TIME_PATTERN = /(\d{1,2})[:.]?(\d{2})?\s*(am|pm)/i;

/**
 * Resolves free text into an exact target DateTime, ONLY for the
 * unambiguous cases we can confidently parse: "today"/"tomorrow" (or no day
 * mentioned, defaulting to today) combined with a clear AM/PM time. Returns
 * null for anything else (specific calendar dates, weekday names, times
 * with no AM/PM marker) rather than guessing — callers must fall back to
 * the generic nearest-slots flow in that case. This is deliberately narrow:
 * a wrong exact-match check is worse than no exact-match check, since it
 * drives which single slot gets treated as authoritative.
 *
 * Root cause this exists to fix: lib/scheduling/listAvailableSlots.ts used
 * to always return the chronologically-earliest slots with zero awareness
 * of what the patient actually asked for — see
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

  const base = DateTime.fromJSDate(now, { zone: timezone }).startOf("day");
  const lower = text.toLowerCase();
  let targetDay: DateTime;
  if (lower.includes("tomorrow")) {
    targetDay = base.plus({ days: 1 });
  } else if (lower.includes("today") || lower.includes("now")) {
    targetDay = base;
  } else if (/\b(mon|tue|wed|thu|fri|sat|sun)/.test(lower) || /\d{1,2}[/\-]\d{1,2}/.test(lower)) {
    // Weekday names and explicit calendar dates are exactly the ambiguous
    // cases we don't try to resolve here — bail rather than guess.
    return null;
  } else {
    // No day mentioned at all — default to today, same as a walk-in patient
    // asking "is 5pm free?" would mean.
    targetDay = base;
  }

  return targetDay.set({ hour, minute, second: 0, millisecond: 0 });
}

/** Formats a resolved target for patient-facing text, e.g. "Tomorrow at 5:00 PM". */
export function formatRequestedLabel(target: DateTime, timezone: string, now: Date): string {
  const nowInZone = DateTime.fromJSDate(now, { zone: timezone });
  const dayLabel = target.hasSame(nowInZone, "day")
    ? "Today"
    : target.hasSame(nowInZone.plus({ days: 1 }), "day")
      ? "Tomorrow"
      : target.toFormat("EEE, MMM d");
  return `${dayLabel} at ${target.toFormat("h:mm a")}`;
}
