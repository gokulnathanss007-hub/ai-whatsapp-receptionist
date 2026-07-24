import { extractTimeMentions, slotMatchesTimeMention } from "@/lib/scheduling/timeMatch";
import type { SchedulingSlot } from "@/lib/scheduling/types";

export type SelectedSlotResolution =
  | { kind: "tapped"; slot: SchedulingSlot }
  | { kind: "matched"; slot: SchedulingSlot }
  | { kind: "recovered"; slot: SchedulingSlot }
  | { kind: "unresolved" };

/**
 * Resolves the model's booking_selection.selected_slot_id against the slots
 * actually offered this turn.
 *
 * Production incident this fixes (2026-07-04, "Today 7.pm"): the parser
 * resolved the parent's time perfectly and the exact slot was free, but the
 * model echoed a corrupted slot id — so the booking failed and the parent
 * was told the time was "just taken" when it never was. The model's id echo
 * is the ONLY fragile link in the chain; the parent's own words are not.
 * When the id is unknown but the parent's stated time identifies EXACTLY
 * one offered slot, recover to that slot deterministically. Anything
 * ambiguous stays unresolved — the caller must re-present the list, never
 * guess (same "never substitute" rule as everywhere else in scheduling).
 */
export function resolveSelectedSlot(params: {
  selectedSlotId: string;
  availableSlots: SchedulingSlot[];
  /** requestedTarget?.toUTC().toISO() — the parsed exact instant, when one resolved this turn. */
  requestedTargetUtcIso: string | null;
  /** The parent's raw message this turn. */
  messageText: string;
  /** interactive.list_reply.id when the parent TAPPED a slot row (V2 interactive) — the strongest signal there is: Meta echoes back the exact id we sent, no model involved. */
  tappedSlotId?: string | null;
}): SelectedSlotResolution {
  const { selectedSlotId, availableSlots, requestedTargetUtcIso, messageText, tappedSlotId } = params;

  // A tap outranks everything, including the model's echo — the parent
  // physically selected this row and Meta returned its id verbatim.
  if (tappedSlotId) {
    const tapped = availableSlots.find((slot) => slot.id === tappedSlotId);
    if (tapped) return { kind: "tapped", slot: tapped };
  }

  const matched = availableSlots.find((slot) => slot.id === selectedSlotId);
  if (matched) return { kind: "matched", slot: matched };

  // Unknown id. Recover only on an unambiguous, parent-stated signal.
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
