import type { Action } from "@/lib/decision-engine/types";
import type { SchedulingSlot } from "@/lib/scheduling/types";

/**
 * Translates the pipeline's final v1-shaped turn outcome into the ordered
 * action list of DECISION_ENGINE.md §3 — migration step 1 (§6): a pure
 * mapping, no behaviour change for text-only clinics.
 *
 * `finalReply` is the already-guardrailed text the v1 pipeline would send.
 * When the turn is presenting a slot list AND the clinic has interactive
 * rendering enabled, the bullet list is lifted out of the text and becomes a
 * show_calendar_slots action (a tappable WhatsApp list); the surrounding
 * sentences stay as the list body. Every tap has a typed equivalent — the
 * same slots resolve from free text via recoverSelectedSlot
 * (INTERACTIVE_WHATSAPP.md §4.2).
 */
export function translateTurnToActions(params: {
  finalReply: string;
  presentedSlots: SchedulingSlot[] | null;
  interactiveEnabled: boolean;
}): Action[] {
  const { finalReply, presentedSlots, interactiveEnabled } = params;

  if (
    interactiveEnabled &&
    presentedSlots !== null &&
    presentedSlots.length > 0 &&
    // Meta hard limit: a list message holds at most 10 rows. The pipeline
    // offers at most 5, but never trust that invariant from a distance.
    presentedSlots.length <= 10 &&
    finalReply.includes("•")
  ) {
    // All slot-list renderers in lib/scheduling/renderSlotsBlock.ts write
    // one "• <label>" line per slot — the non-bullet lines are the lead-in
    // and closing question, which become the list message body.
    const leadIn = finalReply
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("•"))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return [{ type: "show_calendar_slots", leadIn, slots: presentedSlots }];
  }

  return [{ type: "reply_text", text: finalReply }];
}
