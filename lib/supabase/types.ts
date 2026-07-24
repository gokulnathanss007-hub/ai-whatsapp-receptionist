// Hand-written row types mirroring /supabase/migrations/0001_init.sql
// through /supabase/migrations/0012_rename_clinic_to_school.sql.
// Regenerate/replace with `supabase gen types typescript` once a live project exists.
import type {
  AdmissionEnquiryStatus,
  BookingStatus,
  ConversationStage,
  HandoffReason,
} from "@/lib/types";

export interface SchoolRow {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  maps_url: string | null;
  timings: string | null;
  parking_info: string | null;
  languages: string[];
  payment_methods: string[];
  follow_up_policy: string | null;
  cancellation_policy: string | null;
  rescheduling_policy: string | null;
  auto_confirm_enabled: boolean;
  /** V2 phase 1 rollout flag: render slot offers as tappable WhatsApp list messages. Text-only schools keep plain text. */
  interactive_enabled: boolean;
  /** Direct contact number surfaced on the "Talk to Receptionist" handoff. Null → generic "office will reply here" message. */
  reception_phone: string | null;
  /** Single source of truth for the school's real hours — drives both the AI's stated hours and Google Calendar slot generation. Empty ({}) means "not configured yet." */
  opening_hours: WorkingHours;
  slot_duration_minutes: number;
  timezone: string;
  knowledge_version: number;
  created_at: string;
  updated_at: string;
}

export interface SchoolWhatsappNumberRow {
  id: string;
  school_id: string;
  phone_number_id: string;
  display_number: string | null;
  created_at: string;
}

export interface SchoolStaffRow {
  id: string;
  school_id: string;
  name: string;
  role: string | null;
  is_active: boolean;
}

export interface SchoolServiceRow {
  id: string;
  school_id: string;
  service_key: string;
  display_name: string;
  high_level_info: string | null;
  is_active: boolean;
}

export interface SchoolFaqRow {
  id: string;
  school_id: string;
  faq_id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  requires_staff: boolean;
}

export interface ParentRow {
  id: string;
  school_id: string;
  wa_phone: string;
  name: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface ConversationRow {
  id: string;
  school_id: string;
  parent_id: string;
  stage: ConversationStage;
  collected_slots: Record<string, unknown>;
  human_handoff: boolean;
  handoff_reason: HandoffReason | null;
  booking_status: BookingStatus;
  booking_status_updated_at: string;
  booking_in_progress_message_id: string | null;
  /** Semantic journey moment last shown (docs/03-engineering/PATIENT_EXPERIENCE.md §2) — e.g. 'main_menu' lets a typed "2" resolve as a menu pick. */
  current_screen: string;
  last_message_at: string;
  created_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  wa_message_id: string;
  direction: "inbound" | "outbound";
  body: string;
  intent: string | null;
  created_at: string;
}

export interface AdmissionEnquiryRow {
  id: string;
  school_id: string;
  parent_id: string;
  conversation_id: string;
  name: string | null;
  mobile: string | null;
  grade_applying_for: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  reason: string | null;
  status: AdmissionEnquiryStatus;
  created_at: string;
  /** Child's name — collected by the "Talk to Admission Office" step (lib/decision-engine/admissionMenu.ts). Null for rows from the older AI-driven flow. */
  child_name: string | null;
}

export interface ProcessedEventRow {
  wa_message_id: string;
  processed_at: string;
}

/** Backs the "send_pdf" / "send_image" Decision Engine actions — see 0014_school_assets.sql. */
export interface SchoolAssetRow {
  id: string;
  school_id: string;
  asset_key: string;
  file_url: string;
  filename: string;
  caption: string | null;
  created_at: string;
  updated_at: string;
}

export type SchoolGoogleAccountSyncStatus = "connected" | "error" | "disconnected";

/** { mon: [["09:00","16:00"]], tue: [...], ... } — 24h "HH:mm", school-local time. */
export type WorkingHours = Partial<
  Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", Array<[string, string]>>
>;

export interface SchoolGoogleAccountRow {
  id: string;
  school_id: string;
  google_email: string;
  calendar_id: string;
  /** AES-256-GCM ciphertext — decrypt with lib/google/tokenCrypto.ts before use. */
  access_token: string;
  /** AES-256-GCM ciphertext — decrypt with lib/google/tokenCrypto.ts before use. */
  refresh_token: string;
  token_expiry: string;
  scope: string;
  sync_status: SchoolGoogleAccountSyncStatus;
  last_sync_error: string | null;
  connected_at: string;
  updated_at: string;
}

export type AppointmentStatus = "confirmed" | "cancelled";
export type AppointmentSyncStatus = "pending" | "synced" | "failed";

export interface AppointmentRow {
  id: string;
  school_id: string;
  parent_id: string;
  conversation_id: string;
  school_google_account_id: string;
  name: string;
  mobile: string;
  reason: string;
  slot_start: string;
  slot_end: string;
  timezone: string;
  google_event_id: string | null;
  status: AppointmentStatus;
  sync_status: AppointmentSyncStatus;
  last_sync_error: string | null;
  /** The inbound wa_message_id whose processing created this row — see 0008_appointments_wa_message_id.sql. */
  wa_message_id: string | null;
  created_at: string;
  updated_at: string;
}
