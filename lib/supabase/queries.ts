import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  AppointmentRequestRow,
  AppointmentRow,
  ClinicDoctorRow,
  ClinicFaqRow,
  ClinicGoogleAccountRow,
  ClinicRow,
  ClinicServiceRow,
  ConversationRow,
  MessageRow,
  PatientRow,
} from "@/lib/supabase/types";
import type {
  AppointmentRequestPayload,
  CollectedSlots,
  ConversationStage,
  HandoffReason,
} from "@/lib/types";

// ── Idempotency ──────────────────────────────────────────────────────────────

/** True if this WhatsApp message id has already been processed (dedupe guard). */
export async function isEventProcessed(waMessageId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from("processed_events")
    .select("wa_message_id")
    .eq("wa_message_id", waMessageId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Marks a message id as processed. Relies on the primary key to reject races. */
export async function markEventProcessed(waMessageId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("processed_events")
    .insert({ wa_message_id: waMessageId });
  // 23505 = unique_violation: another concurrent worker already claimed it.
  if (error && error.code !== "23505") throw error;
}

// ── Clinic resolution & knowledge ───────────────────────────────────────────

export async function resolveClinicIdByPhoneNumberId(
  phoneNumberId: string,
): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("clinic_whatsapp_numbers")
    .select("clinic_id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (error) throw error;
  return data?.clinic_id ?? null;
}

export async function getClinic(clinicId: string): Promise<ClinicRow | null> {
  const { data, error } = await getSupabaseClient()
    .from("clinics")
    .select("*")
    .eq("id", clinicId)
    .maybeSingle();
  if (error) throw error;
  return data as ClinicRow | null;
}

export async function getClinicDoctors(clinicId: string): Promise<ClinicDoctorRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("clinic_doctors")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as ClinicDoctorRow[];
}

export async function getClinicServices(clinicId: string): Promise<ClinicServiceRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("clinic_services")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as ClinicServiceRow[];
}

export async function getClinicFaqs(clinicId: string): Promise<ClinicFaqRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("clinic_faqs")
    .select("*")
    .eq("clinic_id", clinicId);
  if (error) throw error;
  return (data ?? []) as ClinicFaqRow[];
}

// ── Patients & conversations ─────────────────────────────────────────────────

export async function getOrCreatePatient(
  clinicId: string,
  waPhone: string,
): Promise<PatientRow> {
  const client = getSupabaseClient();
  const existing = await client
    .from("patients")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("wa_phone", waPhone)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const { data, error } = await client
      .from("patients")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.data.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as PatientRow;
  }

  const { data, error } = await client
    .from("patients")
    .insert({ clinic_id: clinicId, wa_phone: waPhone })
    .select("*")
    .single();
  if (error) throw error;
  return data as PatientRow;
}

/** Finds the patient's most recent open conversation, or starts a new one. */
export async function getOrCreateOpenConversation(
  clinicId: string,
  patientId: string,
): Promise<ConversationRow> {
  const client = getSupabaseClient();
  const existing = await client
    .from("conversations")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .neq("stage", "closed")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as ConversationRow;

  const { data, error } = await client
    .from("conversations")
    .insert({ clinic_id: clinicId, patient_id: patientId })
    .select("*")
    .single();
  if (error) throw error;
  return data as ConversationRow;
}

export async function getRecentMessages(
  conversationId: string,
  limit: number,
): Promise<MessageRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as MessageRow[]).reverse();
}

export async function insertMessage(params: {
  conversationId: string;
  waMessageId: string;
  direction: "inbound" | "outbound";
  body: string;
  intent?: string | null;
}): Promise<MessageRow> {
  const { data, error } = await getSupabaseClient()
    .from("messages")
    .insert({
      conversation_id: params.conversationId,
      wa_message_id: params.waMessageId,
      direction: params.direction,
      body: params.body,
      intent: params.intent ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as MessageRow;
}

export async function updateConversationAfterTurn(params: {
  conversationId: string;
  stage: ConversationStage;
  mergedSlots: CollectedSlots;
  humanHandoff: boolean;
  handoffReason: HandoffReason | null;
}): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("conversations")
    .update({
      stage: params.stage,
      collected_slots: params.mergedSlots,
      human_handoff: params.humanHandoff,
      handoff_reason: params.handoffReason,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", params.conversationId);
  if (error) throw error;
}

export async function insertAppointmentRequest(params: {
  clinicId: string;
  patientId: string;
  conversationId: string;
  /** Always the patient's real WhatsApp number (patients.wa_phone) — never asked for, never taken from the model. */
  mobile: string;
  payload: AppointmentRequestPayload;
}): Promise<AppointmentRequestRow> {
  const { data, error } = await getSupabaseClient()
    .from("appointment_requests")
    .insert({
      clinic_id: params.clinicId,
      patient_id: params.patientId,
      conversation_id: params.conversationId,
      name: params.payload.name,
      mobile: params.mobile,
      preferred_doctor: params.payload.preferred_doctor ?? null,
      preferred_date: params.payload.preferred_date,
      preferred_time: params.payload.preferred_time,
      reason: params.payload.reason,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AppointmentRequestRow;
}

// ── Google Calendar accounts ────────────────────────────────────────────────

export async function getClinicGoogleAccount(
  clinicId: string,
): Promise<ClinicGoogleAccountRow | null> {
  const { data, error } = await getSupabaseClient()
    .from("clinic_google_accounts")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) throw error;
  return data as ClinicGoogleAccountRow | null;
}

/** Inserts or replaces the stored Google connection for a clinic (one row per clinic_id). */
export async function upsertClinicGoogleAccount(params: {
  clinicId: string;
  googleEmail: string;
  calendarId: string;
  /** Already AES-256-GCM encrypted — see lib/google/tokenCrypto.ts. */
  encryptedAccessToken: string;
  /** Already AES-256-GCM encrypted — see lib/google/tokenCrypto.ts. */
  encryptedRefreshToken: string;
  tokenExpiry: string;
  scope: string;
}): Promise<ClinicGoogleAccountRow> {
  const { data, error } = await getSupabaseClient()
    .from("clinic_google_accounts")
    .upsert(
      {
        clinic_id: params.clinicId,
        google_email: params.googleEmail,
        calendar_id: params.calendarId,
        access_token: params.encryptedAccessToken,
        refresh_token: params.encryptedRefreshToken,
        token_expiry: params.tokenExpiry,
        scope: params.scope,
        sync_status: "connected",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as ClinicGoogleAccountRow;
}

/** Persists a rotated access token (and refresh token, if Google issued a new one). */
export async function updateClinicGoogleAccountTokens(params: {
  clinicId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken?: string;
  tokenExpiry: string;
}): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("clinic_google_accounts")
    .update({
      access_token: params.encryptedAccessToken,
      ...(params.encryptedRefreshToken ? { refresh_token: params.encryptedRefreshToken } : {}),
      token_expiry: params.tokenExpiry,
      sync_status: "connected",
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("clinic_id", params.clinicId);
  if (error) throw error;
}

/** Marks a clinic's Google connection as broken (e.g. refresh_token revoked). */
export async function markClinicGoogleAccountError(
  clinicId: string,
  message: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("clinic_google_accounts")
    .update({
      sync_status: "error",
      last_sync_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("clinic_id", clinicId);
  if (error) throw error;
}

// ── Appointments (calendar-confirmed bookings) ──────────────────────────────

/**
 * Throws the raw Postgres error on conflict (code 23505) — callers must
 * inspect it to distinguish "this slot was just taken" from a real failure;
 * unlike processed_events/messages, a duplicate here is not something to
 * silently swallow.
 */
export async function insertAppointment(params: {
  clinicId: string;
  clinicGoogleAccountId: string;
  patientId: string;
  conversationId: string;
  name: string;
  mobile: string;
  reason: string;
  slotStart: string;
  slotEnd: string;
  timezone: string;
}): Promise<AppointmentRow> {
  const { data, error } = await getSupabaseClient()
    .from("appointments")
    .insert({
      clinic_id: params.clinicId,
      clinic_google_account_id: params.clinicGoogleAccountId,
      patient_id: params.patientId,
      conversation_id: params.conversationId,
      name: params.name,
      mobile: params.mobile,
      reason: params.reason,
      slot_start: params.slotStart,
      slot_end: params.slotEnd,
      timezone: params.timezone,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AppointmentRow;
}

export async function markAppointmentSynced(
  appointmentId: string,
  googleEventId: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("appointments")
    .update({
      google_event_id: googleEventId,
      sync_status: "synced",
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);
  if (error) throw error;
}

/**
 * Confirmed appointment windows for a clinic's connected calendar, in range —
 * used as a belt-and-suspenders filter on top of Google Calendar freebusy,
 * since Postgres is instantly consistent but Calendar sync can briefly lag
 * (see lib/scheduling/listAvailableSlots.ts).
 */
export async function getBookedSlotWindows(
  clinicGoogleAccountId: string,
  fromIso: string,
  toIso: string,
): Promise<Array<{ slot_start: string; slot_end: string }>> {
  const { data, error } = await getSupabaseClient()
    .from("appointments")
    .select("slot_start, slot_end")
    .eq("clinic_google_account_id", clinicGoogleAccountId)
    .eq("status", "confirmed")
    .gte("slot_start", fromIso)
    .lt("slot_start", toIso);
  if (error) throw error;
  return (data ?? []) as Array<{ slot_start: string; slot_end: string }>;
}

export async function markAppointmentSyncFailed(
  appointmentId: string,
  message: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("appointments")
    .update({
      sync_status: "failed",
      last_sync_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);
  if (error) throw error;
}
