import { extractTimeMentions, slotMatchesTimeMention } from "@/lib/scheduling/timeMatch";
import type { SchedulingSlot } from "@/lib/scheduling/types";

export type SelectedSlotResolution =
  | { kind: "matched"; slot: SchedulingSlot }
  | { kind: "recovered"; slot: SchedulingSlot }
  | { kind: "unresolved" };

/**
 * Resolves the model's booking_selection.selected_slot_id against the slots
 * actually offered this turn.
 *
 * Production incident this fixes (2026-07-04, "Today 7.pm"): the parser
 * resolved the patient's time perfectly and the exact slot was free, but the
 * model echoed a corrupted slot id — so the booking failed and the patient
 * was told the time was "just taken" when it never was. The model's id echo
 * is the ONLY fragile link in the chain; the patient's own words are not.
 * When the id is unknown but the patient's stated time identifies EXACTLY
 * one offered slot, recover to that slot deterministically. Anything
 * ambiguous stays unresolved — the caller must re-present the list, never
 * guess (same "never substitute" rule as everywhere else in scheduling).
 */
export function resolveSelectedSlot(params: {
  selectedSlotId: string;
  availableSlots: SchedulingSlot[];
  /** requestedTarget?.toUTC().toISO() — the parsed exact instant, when one resolved this turn. */
  requestedTargetUtcIso: string | null;
  /** The patient's raw message this turn. */
  messageText: string;
}): SelectedSlotResolution {
  const { selectedSlotId, availableSlots, requestedTargetUtcIso, messageText } = params;

  const matched = availableSlots.find((slot) => slot.id === selectedSlotId);
  if (matched) return { kind: "matched", slot: matched };

  // Unknown id. Recover only on an unambiguous, patient-stated signal.
  if (requestedTargetUtcIso) {
    const byTarget = availableSlots.filter((slot) => slot.startsAt === requestedTargetUtcIso);
    if (byTarget.length === 1) return { kind: "recovered", slot: byTarget[0]! };
  }

  const mentions = extractTimeMentions(messageText);
  if (mentions.length > 0) {
    const byMention = availableSlots.filter((slot) => slotMatchesTimeMention(slot, mentions));
    if (byMention.length === 1) return { kind: "recovered", slot: byMention[0]! };
  }

  return { kind: "unresolved" };
}
