import type { HandoffReason } from "@/lib/types";
import type { SchedulingSlot } from "@/lib/scheduling/types";

// The generalised action contract from /docs/03-engineering/DECISION_ENGINE.md §3.
// V2 migration step 1 (§6): this union + the v1 translator exist first as a
// pure refactor — the model still emits the v1 fixed-field output; the
// pipeline translates it into actions and the channel adapter renders them.
// Interactive actions are rendered only for clinics with
// clinics.interactive_enabled (INTERACTIVE_WHATSAPP.md §7).

export interface ButtonSpec {
  /** Backend key echoed back by Meta in interactive.button_reply.id — never shown to the patient. */
  id: string;
  /** Human label; Meta hard limit 20 chars (enforced by the channel adapter). */
  title: string;
}

export type Action =
  | { type: "reply_text"; text: string }
  | { type: "show_buttons"; text: string; buttons: ButtonSpec[] }
  | {
      type: "show_calendar_slots";
      /** Patient-facing lead-in rendered as the list message body. */
      leadIn: string;
      /** Real slots hydrated by the executor from the SchedulingProvider — never model-authored. */
      slots: SchedulingSlot[];
    }
  | { type: "handoff"; reason: HandoffReason };

export interface Decision {
  actions: Action[];
}
