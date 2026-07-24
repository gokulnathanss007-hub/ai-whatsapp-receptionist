import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  AdmissionEnquiryRow,
  AppointmentRow,
  SchoolAssetRow,
  SchoolStaffRow,
  SchoolFaqRow,
  SchoolGoogleAccountRow,
  SchoolRow,
  SchoolServiceRow,
  ConversationRow,
  MessageRow,
  ParentRow,
} from "@/lib/supabase/types";
import type {
  AdmissionEnquiryPayload,
  BookingStatus,
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

// ── School resolution & knowledge ───────────────────────────────────────────

export async function resolveSchoolIdByPhoneNumberId(
  phoneNumberId: string,
): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("school_whatsapp_numbers")
    .select("school_id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (error) throw error;
  return data?.school_id ?? null;
}

export async function getSchool(schoolId: string): Promise<SchoolRow | null> {
  const { data, error } = await getSupabaseClient()
    .from("schools")
    .select("*")
    .eq("id", schoolId)
    .maybeSingle();
  if (error) throw error;
  return data as SchoolRow | null;
}

export async function getSchoolStaff(schoolId: string): Promise<SchoolStaffRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("school_staff")
    .select("*")
    .eq("school_id", schoolId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as SchoolStaffRow[];
}

export async function getSchoolServices(schoolId: string): Promise<SchoolServiceRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("school_services")
    .select("*")
    .eq("school_id", schoolId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as SchoolServiceRow[];
}

export async function getSchoolFaqs(schoolId: string): Promise<SchoolFaqRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("school_faqs")
    .select("*")
    .eq("school_id", schoolId);
  if (error) throw error;
  return (data ?? []) as SchoolFaqRow[];
}

/** Looks up a configured file for this school (e.g. a transport routes PDF) — see 0014_school_assets.sql. Null when not configured yet. */
export async function getSchoolAsset(schoolId: string, assetKey: string): Promise<SchoolAssetRow | null> {
  const { data, error } = await getSupabaseClient()
    .from("school_assets")
    .select("*")
    .eq("school_id", schoolId)
    .eq("asset_key", assetKey)
    .maybeSingle();
  if (error) throw error;
  return data as SchoolAssetRow | null;
}

// ── Parents & conversations ─────────────────────────────────────────────────

export async function getOrCreateParent(
  schoolId: string,
  waPhone: string,
): Promise<ParentRow> {
  const client = getSupabaseClient();
  const existing = await client
    .from("parents")
    .select("*")
    .eq("school_id", schoolId)
    .eq("wa_phone", waPhone)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const { data, error } = await client
      .from("parents")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.data.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as ParentRow;
  }

  const { data, error } = await client
    .from("parents")
    .insert({ school_id: schoolId, wa_phone: waPhone })
    .select("*")
    .single();
  if (error) throw error;
  return data as ParentRow;
}

/** Finds the parent's most recent open conversation, or starts a new one. */
export async function getOrCreateOpenConversation(
  schoolId: string,
  parentId: string,
): Promise<ConversationRow> {
  const client = getSupabaseClient();
  const existing = await client
    .from("conversations")
    .select("*")
    .eq("school_id", schoolId)
    .eq("parent_id", parentId)
    .neq("stage", "closed")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as ConversationRow;

  const { data, error } = await client
    .from("conversations")
    .insert({ school_id: schoolId, parent_id: parentId })
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
  /** Omit to leave booking_status untouched — most turns (FAQ, qualifying, etc.) aren't booking-related. */
  bookingStatus?: BookingStatus;
  /** Semantic screen last shown this turn (docs/03-engineering/PATIENT_EXPERIENCE.md §2). Omit to leave unchanged. */
  currentScreen?: string;
}): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("conversations")
    .update({
      stage: params.stage,
      collected_slots: params.mergedSlots,
      human_handoff: params.humanHandoff,
      handoff_reason: params.handoffReason,
      last_message_at: new Date().toISOString(),
      ...(params.bookingStatus !== undefined
        ? { booking_status: params.bookingStatus, booking_status_updated_at: new Date().toISOString() }
        : {}),
      ...(params.currentScreen !== undefined ? { current_screen: params.currentScreen } : {}),
    })
    .eq("id", params.conversationId);
  if (error) throw error;
}

/**
 * Atomically claims the right to attempt a booking for this conversation —
 * backed by the claim_booking_attempt() Postgres function (see
 * 0007_claim_booking_attempt.sql) so two near-simultaneous inbound messages
 * (e.g. a parent double-tapping "Confirm") can never both proceed to call
 * Google Calendar. Returns false if another attempt already holds the claim
 * (in flight or already confirmed) — callers must NOT attempt the booking in
 * that case, and must not touch booking_status further (the run that holds
 * the claim owns the next transition). Returns true if this call is either
 * the first claim or a retry of the exact same wa_message_id.
 */
export async function beginBookingAttempt(conversationId: string, waMessageId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc("claim_booking_attempt", {
    p_conversation_id: conversationId,
    p_wa_message_id: waMessageId,
  });
  if (error) throw error;
  return data === true;
}

/** Marks a stale booking_in_progress as timed out — see the staleness check in trigger/replyPipeline.ts. */
export async function markBookingTimeout(conversationId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("conversations")
    .update({
      booking_status: "timeout" satisfies BookingStatus,
      booking_status_updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
  if (error) throw error;
}

/**
 * Sweeps every conversation still stuck at booking_in_progress older than
 * `staleBeforeIso` into a terminal timeout state. Backstop for the case the
 * reactive check in replyPipeline.ts can't cover: if the parent never sends
 * another message after a run crashes mid-booking, nothing would otherwise
 * ever move that conversation out of booking_in_progress. Called from the
 * scheduled trigger/bookingTimeoutSweep.ts task. Returns the ids that were
 * flipped, for logging.
 */
export async function markStaleBookingsTimedOut(staleBeforeIso: string): Promise<string[]> {
  const { data, error } = await getSupabaseClient()
    .from("conversations")
    .update({
      booking_status: "timeout" satisfies BookingStatus,
      booking_status_updated_at: new Date().toISOString(),
    })
    .eq("booking_status", "booking_in_progress")
    .lt("booking_status_updated_at", staleBeforeIso)
    .select("id");
  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
}

export async function insertAdmissionEnquiry(params: {
  schoolId: string;
  parentId: string;
  conversationId: string;
  /** Always the parent's real WhatsApp number (parents.wa_phone) — never asked for, never taken from the model. */
  mobile: string;
  payload: AdmissionEnquiryPayload;
}): Promise<AdmissionEnquiryRow> {
  const { data, error } = await getSupabaseClient()
    .from("admission_enquiries")
    .insert({
      school_id: params.schoolId,
      parent_id: params.parentId,
      conversation_id: params.conversationId,
      name: params.payload.name,
      mobile: params.mobile,
      grade_applying_for: params.payload.grade_applying_for ?? null,
      preferred_date: params.payload.preferred_date,
      preferred_time: params.payload.preferred_time,
      reason: params.payload.reason,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AdmissionEnquiryRow;
}

/**
 * Records an enquiry from the deterministic "Talk to Admission Office" step
 * (lib/decision-engine/admissionMenu.ts) — a separate, simpler insert path
 * from insertAdmissionEnquiry() above, which backs the AI-driven visit-
 * booking flow and requires preferred_date/preferred_time. This step never
 * collects a date/time (no calendar booking involved, just an office
 * hand-off), so those columns are left null rather than forced into the
 * stricter AdmissionEnquiryPayload contract.
 */
export async function insertAdmissionOfficeEnquiry(params: {
  schoolId: string;
  parentId: string;
  conversationId: string;
  name: string;
  childName: string;
  gradeApplyingFor: string | null;
  /** Always the parent's real WhatsApp number (parents.wa_phone) — never asked for, never taken from the model. */
  mobile: string;
  message: string | null;
}): Promise<AdmissionEnquiryRow> {
  const { data, error } = await getSupabaseClient()
    .from("admission_enquiries")
    .insert({
      school_id: params.schoolId,
      parent_id: params.parentId,
      conversation_id: params.conversationId,
      name: params.name,
      child_name: params.childName,
      mobile: params.mobile,
      grade_applying_for: params.gradeApplyingFor,
      reason: params.message,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AdmissionEnquiryRow;
}

// ── Google Calendar accounts ────────────────────────────────────────────────

export async function getSchoolGoogleAccount(
  schoolId: string,
): Promise<SchoolGoogleAccountRow | null> {
  const { data, error } = await getSupabaseClient()
    .from("school_google_accounts")
    .select("*")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw error;
  return data as SchoolGoogleAccountRow | null;
}

/** Inserts or replaces the stored Google connection for a school (one row per school_id). */
export async function upsertSchoolGoogleAccount(params: {
  schoolId: string;
  googleEmail: string;
  calendarId: string;
  /** Already AES-256-GCM encrypted — see lib/google/tokenCrypto.ts. */
  encryptedAccessToken: string;
  /** Already AES-256-GCM encrypted — see lib/google/tokenCrypto.ts. */
  encryptedRefreshToken: string;
  tokenExpiry: string;
  scope: string;
}): Promise<SchoolGoogleAccountRow> {
  const { data, error } = await getSupabaseClient()
    .from("school_google_accounts")
    .upsert(
      {
        school_id: params.schoolId,
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
      { onConflict: "school_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as SchoolGoogleAccountRow;
}

/** Persists a rotated access token (and refresh token, if Google issued a new one). */
export async function updateSchoolGoogleAccountTokens(params: {
  schoolId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken?: string;
  tokenExpiry: string;
}): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("school_google_accounts")
    .update({
      access_token: params.encryptedAccessToken,
      ...(params.encryptedRefreshToken ? { refresh_token: params.encryptedRefreshToken } : {}),
      token_expiry: params.tokenExpiry,
      sync_status: "connected",
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("school_id", params.schoolId);
  if (error) throw error;
}

/** Marks a school's Google connection as broken (e.g. refresh_token revoked). */
export async function markSchoolGoogleAccountError(
  schoolId: string,
  message: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("school_google_accounts")
    .update({
      sync_status: "error",
      last_sync_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("school_id", schoolId);
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
  schoolId: string;
  schoolGoogleAccountId: string;
  parentId: string;
  conversationId: string;
  name: string;
  mobile: string;
  reason: string;
  slotStart: string;
  slotEnd: string;
  timezone: string;
  /** The inbound message that triggered this booking — see getAppointmentByWaMessageId(). */
  waMessageId: string;
}): Promise<AppointmentRow> {
  const { data, error } = await getSupabaseClient()
    .from("appointments")
    .insert({
      school_id: params.schoolId,
      school_google_account_id: params.schoolGoogleAccountId,
      parent_id: params.parentId,
      conversation_id: params.conversationId,
      name: params.name,
      mobile: params.mobile,
      reason: params.reason,
      slot_start: params.slotStart,
      slot_end: params.slotEnd,
      timezone: params.timezone,
      wa_message_id: params.waMessageId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AppointmentRow;
}

/**
 * Idempotent-retry recovery for bookSlot(): if a task run crashes after this
 * exact message already created a confirmed appointment, but before the
 * reply was sent, a Trigger.dev retry must recognize that and resend the
 * same confirmation — never report the (now correctly unavailable) slot as
 * a conflict to the parent who just booked it.
 */
export async function getAppointmentByWaMessageId(waMessageId: string): Promise<AppointmentRow | null> {
  const { data, error } = await getSupabaseClient()
    .from("appointments")
    .select("*")
    .eq("wa_message_id", waMessageId)
    .maybeSingle();
  if (error) throw error;
  return data as AppointmentRow | null;
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
 * Confirmed appointment windows for a school's connected calendar, in range —
 * used as a belt-and-suspenders filter on top of Google Calendar freebusy,
 * since Postgres is instantly consistent but Calendar sync can briefly lag
 * (see lib/scheduling/listAvailableSlots.ts).
 */
export async function getBookedSlotWindows(
  schoolGoogleAccountId: string,
  fromIso: string,
  toIso: string,
): Promise<Array<{ slot_start: string; slot_end: string }>> {
  const { data, error } = await getSupabaseClient()
    .from("appointments")
    .select("slot_start, slot_end")
    .eq("school_google_account_id", schoolGoogleAccountId)
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
