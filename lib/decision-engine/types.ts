import type { HandoffReason } from "@/lib/types";
import type { SchedulingSlot } from "@/lib/scheduling/types";

// The generalised action contract from /docs/03-engineering/DECISION_ENGINE.md §3.
// Every action is an ENVELOPE — { action, screen, data } — never a bare verb:
// `action` is the interaction mechanic, `screen` names the semantic journey
// moment (PATIENT_EXPERIENCE.md §2 registry) so voice/dashboard/app renderers
// consume the SAME decision, and `data` carries channel-agnostic payloads
// (keys and structured values, never raw channel JSON).
//
// V2 migration step 1 (DECISION_ENGINE.md §6): the model still emits the v1
// fixed-field output; the pipeline translates it into envelopes and the
// channel adapter renders them. Interactive actions render only for clinics
// with clinics.interactive_enabled (PATIENT_EXPERIENCE.md §3 rollout flag).

/** Semantic journey moments — grows additively; never repurpose a name. See PATIENT_EXPERIENCE.md §2. */
export type Screen =
  | "main_menu"
  | "faq_answer"
  | "qualifying_question"
  | "doctor_selection"
  | "day_picker"
  | "slot_picker"
  | "booking_confirmation"
  | "booking_failed"
  | "treatment_info"
  | "clinic_location"
  | "handoff"
  | "free_text";

export interface ButtonSpec {
  /** Backend key echoed back by Meta in interactive.button_reply.id — never shown to the patient. */
  id: string;
  /** Human label; Meta hard limit 20 chars (enforced by the channel adapter). */
  title: string;
}

export interface ListRow {
  /** Backend key echoed back by Meta in interactive.list_reply.id. */
  id: string;
  /** Human label; Meta hard limit 24 chars (enforced by the channel adapter). */
  title: string;
  /** Optional sub-text; Meta hard limit 72 chars. */
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

export interface ActionEnvelope<A extends string, D> {
  action: A;
  screen: Screen;
  data: D;
}

export type Action =
  | ActionEnvelope<"reply_text", { text: string }>
  | ActionEnvelope<"show_buttons", { text: string; buttons: ButtonSpec[] }>
  | ActionEnvelope<
      "show_list",
      { text: string; buttonLabel: string; sections: ListSection[] }
    >
  | ActionEnvelope<
      "show_main_menu",
      { welcomeText: string; items: ListRow[] }
    >
  | ActionEnvelope<
      "show_calendar_slots",
      {
        /** Patient-facing lead-in rendered as the list message body. */
        leadIn: string;
        /** Real slots hydrated by the executor from the SchedulingProvider — never model-authored. */
        slots: SchedulingSlot[];
      }
    >
  | ActionEnvelope<
      "show_location",
      { clinicName: string; address: string | null; mapsUrl: string | null }
    >
  /** Designed (PATIENT_EXPERIENCE.md §8) — requires the clinic asset registry; the adapter falls back to text until then. */
  | ActionEnvelope<"send_pdf", { assetKey: string; fallbackText: string }>
  | ActionEnvelope<"send_image", { assetKey: string; fallbackText: string }>
  | ActionEnvelope<"handoff", { reason: HandoffReason }>;

export interface Decision {
  actions: Action[];
}
