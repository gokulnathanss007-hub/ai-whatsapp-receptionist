// Hand-written row types mirroring /supabase/migrations/0001_init.sql.
// Regenerate/replace with `supabase gen types typescript` once a live project exists.
import type {
  AppointmentRequestStatus,
  BookingStatus,
  ConversationStage,
  HandoffReason,
} from "@/lib/types";

export interface ClinicRow {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  maps_url: string | null;
  timings: string | null;
  parking_info: string | null;
  languages: string[];
  consultation_fee: number | null;
  payment_methods: string[];
  follow_up_policy: string | null;
  cancellation_policy: string | null;
  rescheduling_policy: string | null;
  auto_confirm_enabled: boolean;
  /** Single source of truth for the clinic's real hours — drives both the AI's stated hours and Google Calendar slot generation. Empty ({}) means "not configured yet." */
  opening_hours: WorkingHours;
  slot_duration_minutes: number;
  timezone: string;
  knowledge_version: number;
  created_at: string;
  updated_at: string;
}

export interface ClinicWhatsappNumberRow {
  id: string;
  clinic_id: string;
  phone_number_id: string;
  display_number: string | null;
  created_at: string;
}

export interface ClinicDoctorRow {
  id: string;
  clinic_id: string;
  name: string;
  role: string | null;
  is_active: boolean;
}

export interface ClinicServiceRow {
  id: string;
  clinic_id: string;
  service_key: string;
  display_name: string;
  high_level_info: string | null;
  is_active: boolean;
}

export interface ClinicFaqRow {
  id: string;
  clinic_id: string;
  faq_id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  requires_staff: boolean;
}

export interface PatientRow {
  id: string;
  clinic_id: string;
  wa_phone: string;
  name: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface ConversationRow {
  id: string;
  clinic_id: string;
  patient_id: string;
  stage: ConversationStage;
  collected_slots: Record<string, unknown>;
  human_handoff: boolean;
  handoff_reason: HandoffReason | null;
  booking_status: BookingStatus;
  booking_status_updated_at: string;
  booking_in_progress_message_id: string | null;
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

export interface AppointmentRequestRow {
  id: string;
  clinic_id: string;
  patient_id: string;
  conversation_id: string;
  name: string | null;
  mobile: string | null;
  preferred_doctor: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  reason: string | null;
  status: AppointmentRequestStatus;
  created_at: string;
}

export interface ProcessedEventRow {
  wa_message_id: string;
  processed_at: string;
}

export type ClinicGoogleAccountSyncStatus = "connected" | "error" | "disconnected";

/** { mon: [["10:00","20:00"]], tue: [...], ... } — 24h "HH:mm", clinic-local time. */
export type WorkingHours = Partial<
  Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", Array<[string, string]>>
>;

export interface ClinicGoogleAccountRow {
  id: string;
  clinic_id: string;
  google_email: string;
  calendar_id: string;
  /** AES-256-GCM ciphertext — decrypt with lib/google/tokenCrypto.ts before use. */
  access_token: string;
  /** AES-256-GCM ciphertext — decrypt with lib/google/tokenCrypto.ts before use. */
  refresh_token: string;
  token_expiry: string;
  scope: string;
  sync_status: ClinicGoogleAccountSyncStatus;
  last_sync_error: string | null;
  connected_at: string;
  updated_at: string;
}

export type AppointmentStatus = "confirmed" | "cancelled";
export type AppointmentSyncStatus = "pending" | "synced" | "failed";

export interface AppointmentRow {
  id: string;
  clinic_id: string;
  patient_id: string;
  conversation_id: string;
  clinic_google_account_id: string;
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
