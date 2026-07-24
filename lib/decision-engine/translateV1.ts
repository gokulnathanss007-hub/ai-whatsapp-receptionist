import type { Action } from "@/lib/decision-engine/types";
import type { SchedulingSlot } from "@/lib/scheduling/types";
import { dayRowId, type DayOption } from "@/lib/scheduling/dayPicker";

/**
 * Translates the pipeline's final v1-shaped turn outcome into the ordered
 * action list of DECISION_ENGINE.md §3 — migration step 1 (§6): a pure
 * mapping, no behaviour change for text-only schools.
 *
 * `finalReply` is the already-guardrailed text the v1 pipeline would send.
 * When the turn is presenting a slot list AND the school has interactive
 * rendering enabled, the bullet list is lifted out of the text and becomes a
 * show_calendar_slots action (a tappable WhatsApp list); the surrounding
 * sentences stay as the list body. Every tap has a typed equivalent — the
 * same slots resolve from free text via recoverSelectedSlot
 * (PATIENT_EXPERIENCE.md §4.2).
 */
export function translateTurnToActions(params: {
  finalReply: string;
  presentedSlots: SchedulingSlot[] | null;
  interactiveEnabled: boolean;
  /** True when this turn's slot list follows a failed/lost booking — the screen is booking_failed, not a first offer. */
  bookingFailed?: boolean;
  /** Day options when this turn asks "which day?" (day-first booking, PATIENT_EXPERIENCE.md §5) — takes precedence over slots. */
  presentedDays?: DayOption[] | null;
}): Action[] {
  const { finalReply, presentedSlots, interactiveEnabled, bookingFailed, presentedDays } = params;

  if (interactiveEnabled && presentedDays && presentedDays.length > 0 && presentedDays.length <= 10) {
    const leadIn = finalReply
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("•"))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return [
      {
        action: "show_list",
        screen: "day_picker",
        data: {
          text: leadIn,
          buttonLabel: "Pick a day",
          sections: [
            {
              title: "Open days",
              // Just the day — no free-slot counts; "20 times open" confused
              // parents (product decision 2026-07-18).
              rows: presentedDays.map((day) => ({
                id: dayRowId(day.dayKey),
                title: day.title,
              })),
            },
          ],
        },
      },
    ];
  }

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
    return [
      {
        action: "show_calendar_slots",
        screen: bookingFailed ? "booking_failed" : "slot_picker",
        data: { leadIn, slots: presentedSlots },
      },
    ];
  }

  return [{ action: "reply_text", screen: "free_text", data: { text: finalReply } }];
}
