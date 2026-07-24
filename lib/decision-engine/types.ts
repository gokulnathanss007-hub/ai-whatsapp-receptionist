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
// channel adapter renders them. Interactive actions render only for schools
// with schools.interactive_enabled (PATIENT_EXPERIENCE.md §3 rollout flag).

/** Semantic journey moments — grows additively; never repurpose a name. See PATIENT_EXPERIENCE.md §2. */
export type Screen =
  | "main_menu"
  | "faq_answer"
  | "qualifying_question"
  | "day_picker"
  | "slot_picker"
  | "booking_confirmation"
  | "booking_failed"
  | "school_service_info"
  | "school_location"
  | "facilities_menu"
  | "handoff"
  | "free_text"
  // Admission Desk sub-flow (lib/decision-engine/admissionMenu.ts) — isolated
  // from every other menu item, added 2026-07-23.
  | "admission_menu"
  | "admission_open_result"
  | "admission_process"
  | "admission_documents"
  | "admission_collect_parent_name"
  | "admission_collect_student_name"
  | "admission_collect_class"
  | "admission_collect_message"
  | "admission_enquiry_confirmation";

export interface ButtonSpec {
  /** Backend key echoed back by Meta in interactive.button_reply.id — never shown to the parent. */
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
        /** Parent-facing lead-in rendered as the list message body. */
        leadIn: string;
        /** Real slots hydrated by the executor from the SchedulingProvider — never model-authored. */
        slots: SchedulingSlot[];
      }
    >
  | ActionEnvelope<
      "show_location",
      { schoolName: string; address: string | null; mapsUrl: string | null }
    >
  /**
   * A file already resolved from the school asset registry (0014_school_assets.sql)
   * before this action was built — the channel adapter only ever renders,
   * never looks up which file to send (DECISION_ENGINE.md §4 invariant 4).
   * `fallbackText` covers both "the send itself failed" and "no asset is
   * configured for this school yet" (the caller decides which applies).
   */
  | ActionEnvelope<"send_pdf", { assetKey: string; fileUrl: string; filename: string; caption?: string; fallbackText: string }>
  | ActionEnvelope<"send_image", { assetKey: string; fileUrl: string; caption?: string; fallbackText: string }>
  | ActionEnvelope<"handoff", { reason: HandoffReason }>;

export interface Decision {
  actions: Action[];
}
