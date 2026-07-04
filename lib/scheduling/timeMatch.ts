import type { SchedulingSlot } from "@/lib/scheduling/types";

const TIME_PATTERN = /(\d{1,2})[:.]?(\d{2})?\s*(am|pm)/gi;

/** Normalizes a time-of-day mention ("1.00pm", "1:00 PM", "1pm") to 24h "H:MM". */
function normalizeTime(raw: string): string | null {
  const match = TIME_PATTERN.exec(raw.toLowerCase());
  TIME_PATTERN.lastIndex = 0;
  if (!match) return null;
  let hour = parseInt(match[1]!, 10);
  const minute = match[2] ? parseInt(match[2]!, 10) : 0;
  const meridiem = match[3]!.toLowerCase();
  if (hour === 12) hour = 0;
  if (meridiem === "pm") hour += 12;
  return `${hour}:${minute.toString().padStart(2, "0")}`;
}

/** Extracts every time-of-day mention in free text, normalized to 24h "H:MM". */
export function extractTimeMentions(text: string): string[] {
  const matches = [...text.toLowerCase().matchAll(TIME_PATTERN)];
  return matches.map((m) => normalizeTime(m[0])).filter((t): t is string => t !== null);
}

/**
 * True if the slot's own time-of-day appears among the patient's stated
 * mentions. Used as a last-line sanity check before committing a booking:
 * in production, the model has resolved a patient's clearly-stated time
 * (e.g. "1:00pm") to the WRONG id from a valid <available_slots> list (e.g.
 * "11:00 AM"'s id) — despite the correct slot being available. This catches
 * that specific mismatch before the booking is made, not after.
 */
export function slotMatchesTimeMention(slot: SchedulingSlot, mentions: string[]): boolean {
  if (mentions.length === 0) return true; // nothing stated this turn to check against
  const timePart = slot.label.split(" – ")[1] ?? slot.label;
  const slotTime = normalizeTime(timePart);
  return slotTime !== null && mentions.includes(slotTime);
}
