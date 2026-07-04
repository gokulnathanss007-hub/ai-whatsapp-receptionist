import { google } from "googleapis";
import { getValidGoogleClient } from "@/lib/google/tokenManager";
import { listAvailableSlots } from "@/lib/scheduling/listAvailableSlots";
import type { BookSlotParams, BookSlotResult } from "@/lib/scheduling/types";
import {
  getClinicGoogleAccount,
  insertAppointment,
  markAppointmentSyncFailed,
  markAppointmentSynced,
} from "@/lib/supabase/queries";

/**
 * Books a previously-offered slot for a clinic. Two layers of protection
 * against double-booking:
 *  1. Re-fetches live availability and requires the slotId to still be in
 *     it — catches stale/tampered ids and slots taken slightly earlier.
 *  2. The `appointments` unique constraint on (clinic_google_account_id,
 *     slot_start) — the actual mutex for a true concurrent race, since two
 *     requests can both pass check #1 in the same instant. See
 *     /docs/GOOGLE_CALENDAR_INTEGRATION.md §7.
 *
 * Google Calendar is written to *after* the Postgres insert succeeds. If
 * that write fails, the booking is not rolled back — Postgres is the source
 * of truth for "who got the slot," Calendar is a downstream view that may
 * briefly lag (sync_status: 'failed').
 */
export async function bookSlot(
  clinicId: string,
  params: BookSlotParams,
): Promise<BookSlotResult> {
  const account = await getClinicGoogleAccount(clinicId);
  if (!account || account.sync_status !== "connected") {
    return { ok: false, reason: "provider_unavailable", alternatives: [] };
  }

  const freshSlots = await listAvailableSlots({ clinicId });
  const matched = freshSlots?.find((slot) => slot.id === params.slotId);
  if (!matched) {
    return { ok: false, reason: "slot_unavailable", alternatives: freshSlots ?? [] };
  }

  let appointmentId: string;
  try {
    const appointment = await insertAppointment({
      clinicId,
      clinicGoogleAccountId: account.id,
      patientId: params.patientId,
      conversationId: params.conversationId,
      name: params.name,
      mobile: params.mobile,
      reason: params.reason,
      slotStart: matched.startsAt,
      slotEnd: matched.endsAt,
      timezone: account.timezone,
    });
    appointmentId = appointment.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const alternatives = (await listAvailableSlots({ clinicId })) ?? [];
      return { ok: false, reason: "slot_taken", alternatives };
    }
    throw err;
  }

  const client = await getValidGoogleClient(clinicId);
  if (!client) {
    await markAppointmentSyncFailed(appointmentId, "No valid Google client at booking time");
    return { ok: true, appointmentId, slot: matched, calendarSynced: false };
  }

  try {
    const calendar = google.calendar({ version: "v3", auth: client });
    const event = await calendar.events.insert({
      calendarId: account.calendar_id,
      requestBody: {
        summary: `${params.name} — ${params.reason}`,
        description: `Booked via Medixum AI WhatsApp Receptionist. Patient mobile: ${params.mobile}`,
        start: { dateTime: matched.startsAt },
        end: { dateTime: matched.endsAt },
      },
    });
    if (event.data.id) {
      await markAppointmentSynced(appointmentId, event.data.id);
    }
    return { ok: true, appointmentId, slot: matched, calendarSynced: Boolean(event.data.id) };
  } catch (err) {
    console.error("Google Calendar event creation failed after booking", err);
    const message = err instanceof Error ? err.message : "Unknown calendar sync error";
    await markAppointmentSyncFailed(appointmentId, message);
    return { ok: true, appointmentId, slot: matched, calendarSynced: false };
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}
