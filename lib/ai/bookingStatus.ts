import type { BookingStatus } from "@/lib/types";

const DEFAULT_BOOKING_IN_PROGRESS_TIMEOUT_MS = 90_000;

/**
 * How long booking_in_progress may sit before it's treated as a crashed/hung
 * run rather than a genuinely active booking attempt. Booking normally
 * completes within one task run in a few seconds (an OpenAI call plus one or
 * two Google Calendar HTTP calls) — configurable via env so this margin can
 * be tuned without a code change if Calendar API latency or OpenAI latency
 * shifts in production. Parsed once at module load; invalid/unset falls back
 * to the default rather than producing NaN.
 */
export const BOOKING_IN_PROGRESS_TIMEOUT_MS = (() => {
  const raw = process.env.BOOKING_IN_PROGRESS_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BOOKING_IN_PROGRESS_TIMEOUT_MS;
})();

const VALID_SUCCESSORS_OF_IN_PROGRESS: ReadonlySet<BookingStatus> = new Set([
  "booking_in_progress",
  "confirmed",
  "failed",
  "timeout",
]);

/**
 * Enforces the one-way booking state machine: once booking_in_progress
 * starts, the only legal next states are confirmed / failed / timeout — never
 * back to waiting_for_confirmation or none. This is what stops the
 * "booked... actually checking... maybe booked... still checking" sequence
 * observed in production — a booking attempt can never be talked back out of
 * once it's real. Returns the safe status to persist; logs and refuses
 * (keeping `current`) rather than applying an illegal backward transition.
 */
export function transitionBookingStatus(current: BookingStatus, next: BookingStatus): BookingStatus {
  if (current === "booking_in_progress" && !VALID_SUCCESSORS_OF_IN_PROGRESS.has(next)) {
    console.error("Booking State Changed — refused illegal backward transition", { current, attemptedNext: next });
    return current;
  }
  return next;
}
