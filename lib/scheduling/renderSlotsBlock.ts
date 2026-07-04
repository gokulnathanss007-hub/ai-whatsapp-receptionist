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
