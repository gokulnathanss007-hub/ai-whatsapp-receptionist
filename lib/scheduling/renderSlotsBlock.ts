import type { SchedulingSlot } from "@/lib/scheduling/types";

/**
 * Renders the <available_slots> block injected into the system prompt. Each
 * line gives the model both the id (to echo back verbatim in
 * booking_selection.selected_slot_id — never invent one) and the label (the
 * only part that should ever be shown to the patient).
 */
export function renderAvailableSlotsBlock(slots: SchedulingSlot[]): string {
  if (slots.length === 0) {
    return "No slots are currently available. Apologize briefly and say a staff member will follow up with timing.";
  }
  return slots.map((slot) => `- id: ${slot.id} | label: "${slot.label}"`).join("\n");
}

/**
 * Deterministic, templated reply for when a booking attempt lost the race
 * (or the picked slot id was stale) — built directly from freshly re-fetched
 * alternatives, no second LLM call. See /docs/GOOGLE_CALENDAR_INTEGRATION.md §6.
 */
export function renderSlotConflictReply(alternatives: SchedulingSlot[]): string {
  if (alternatives.length === 0) {
    return "That time has already been booked, and nothing else is open right now. Our staff will follow up with timing shortly.";
  }
  const lines = alternatives.map((slot) => `• ${slot.label}`).join("\n");
  return `That time has already been booked.\n\nThe nearest available times are:\n\n${lines}\n\nWhich would you prefer?`;
}

/**
 * Deterministic confirmation reply for a successful booking — built directly
 * from the actually-booked slot, never from the model's own free-text claim.
 * A model that resolves the wrong id from <available_slots> (e.g. losing
 * track of which day a time referred to) would otherwise state a confident
 * but wrong date/time; this guarantees the patient always sees the real
 * booked slot, so any mismatch is immediately visible in-conversation rather
 * than silently wrong. See /docs/GOOGLE_CALENDAR_INTEGRATION.md §6.
 */
export function renderBookingConfirmation(params: {
  slot: SchedulingSlot;
  clinicName: string;
  doctorName?: string;
}): string {
  const [datePart, timePart] = params.slot.label.split(" – ");
  const doctorLine = params.doctorName ? `\n👩‍⚕️ Doctor: ${params.doctorName}` : "";
  return `✅ Your appointment has been confirmed.\n\n📅 Date: ${datePart}\n🕒 Time: ${timePart}${doctorLine}\n\nWe look forward to seeing you at ${params.clinicName}.`;
}

/**
 * Deterministic rendering of "here are the available times" — used whenever
 * output.presenting_slots is true, REPLACING whatever list the model wrote
 * itself. In production the model fabricated an entire fake slot list
 * (including a past time and a day the clinic was closed) rather than
 * faithfully relaying <available_slots> — the model's own free-text slot
 * list can never be trusted, only the real data can. See
 * /docs/GOOGLE_CALENDAR_INTEGRATION.md §6.
 */
export function renderSlotsPresentation(slots: SchedulingSlot[], doctorName?: string): string {
  if (slots.length === 0) {
    return "I don't see any open times right now — I'll have our staff follow up with timing.";
  }
  const lines = slots.map((slot) => `• ${slot.label}`).join("\n");
  const doctorPart = doctorName ? ` with ${doctorName}` : "";
  return `Here's what's available${doctorPart}:\n\n${lines}\n\nWhich would you prefer?`;
}

/**
 * Deterministic reply for when the patient asked for a specific date/time
 * that turned out NOT to be free — e.g. "tomorrow 5pm" but that exact slot
 * is booked. Distinct from renderSlotConflictReply (which fires after an
 * actual booking attempt loses a race): this fires before any booking is
 * ever attempted, whenever the requested exact slot simply isn't available.
 * Never silently substitutes a different slot — always says so explicitly
 * and asks the patient to choose. See
 * /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7.
 */
export function renderRequestedSlotUnavailable(
  requestedLabel: string,
  alternatives: SchedulingSlot[],
): string {
  if (alternatives.length === 0) {
    return `${requestedLabel} is no longer available, and nothing else is open right now. Our staff will follow up with timing shortly.`;
  }
  const lines = alternatives.map((slot) => `• ${slot.label}`).join("\n");
  return `${requestedLabel} is no longer available.\n\nThe nearest available times are:\n\n${lines}\n\nWhich would you prefer?`;
}
