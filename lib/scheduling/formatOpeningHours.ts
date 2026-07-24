import { DateTime } from "luxon";
import type { WorkingHours } from "@/lib/supabase/types";

const WEEKDAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type WeekdayKey = (typeof WEEKDAY_ORDER)[number];
const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function formatTime(hhmm: string): string {
  return DateTime.fromFormat(hhmm, "H:mm").toFormat("h:mm a");
}

function rangesKey(ranges: Array<[string, string]>): string {
  return JSON.stringify(ranges);
}

/**
 * Renders schools.opening_hours as parent-facing text, e.g.
 * "Monday–Saturday: 10:00 AM–8:00 PM. Sunday: Closed." This is what the school office
 * tells parents, generated from the exact same structured value the
 * scheduler uses to generate bookable slots — see
 * /docs/GOOGLE_CALENDAR_INTEGRATION.md §3. Returns null when no hours are
 * configured yet, so callers can fall back to a manually-written string.
 */
export function formatOpeningHours(hours: WorkingHours): string | null {
  const days = WEEKDAY_ORDER.map((key) => ({ key, ranges: hours[key] ?? [] }));
  if (days.every((d) => d.ranges.length === 0)) return null;

  const groups: Array<{ keys: WeekdayKey[]; ranges: Array<[string, string]> }> = [];
  for (const day of days) {
    const last = groups[groups.length - 1];
    if (last && rangesKey(last.ranges) === rangesKey(day.ranges)) {
      last.keys.push(day.key);
    } else {
      groups.push({ keys: [day.key], ranges: day.ranges });
    }
  }

  return groups
    .map((group) => {
      // Non-null: every group is seeded with at least one key when created above.
      const first = group.keys[0]!;
      const last = group.keys[group.keys.length - 1]!;
      const dayLabel = first === last ? WEEKDAY_LABEL[first] : `${WEEKDAY_LABEL[first]}–${WEEKDAY_LABEL[last]}`;
      if (group.ranges.length === 0) return `${dayLabel}: Closed`;
      const hoursLabel = group.ranges.map(([start, end]) => `${formatTime(start)}–${formatTime(end)}`).join(", ");
      return `${dayLabel}: ${hoursLabel}`;
    })
    .join(". ");
}
