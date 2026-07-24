import { DateTime } from "luxon";
import { google } from "googleapis";
import { getValidGoogleClient } from "@/lib/google/tokenManager";
import { listAvailableSlots } from "@/lib/scheduling/listAvailableSlots";
import { formatLabel } from "@/lib/scheduling/slotGenerator";
import { decodeSlotId, SlotIntegrityError, verifySlotIntegrity } from "@/lib/scheduling/slotId";
import type { BookSlotParams, BookSlotResult } from "@/lib/scheduling/types";
import type { AppointmentRow } from "@/lib/supabase/types";
import {
  getAppointmentByWaMessageId,
  getSchool,
  getSchoolGoogleAccount,
  insertAppointment,
  markAppointmentSyncFailed,
  markAppointmentSynced,
} from "@/lib/supabase/queries";

/**
 * Reconstructs a BookSlotResult from an already-confirmed appointment row —
 * used for idempotent-retry recovery (see the wa_message_id check below)
 * instead of re-deriving a fresh SchedulingSlot, since the original
 * candidate slot no longer appears in fresh availability (it's booked).
 */
function toIdempotentBookSlotResult(existing: AppointmentRow, timezone: string): BookSlotResult {
  const slotStart = DateTime.fromISO(existing.slot_start).setZone(timezone);
  const now = DateTime.now().setZone(timezone);
  return {
    ok: true,
    appointmentId: existing.id,
    slot: {
      id: existing.id,
      startsAt: existing.slot_start,
      endsAt: existing.slot_end,
      label: formatLabel(slotStart, now),
    },
    calendarSynced: existing.sync_status === "synced",
  };
}

/**
 * Books a previously-offered slot for a school. Two layers of protection
 * against double-booking:
 *  1. Re-fetches live availability and requires the slotId to still be in
 *     it — catches stale/tampered ids and slots taken slightly earlier.
 *  2. The `appointments` unique constraint on (school_google_account_id,
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
  schoolId: string,
  params: BookSlotParams,
): Promise<BookSlotResult> {
  const account = await getSchoolGoogleAccount(schoolId);
  if (!account || account.sync_status !== "connected") {
    return { ok: false, reason: "provider_unavailable", alternatives: [] };
  }

  const school = await getSchool(schoolId);
  if (!school) {
    return { ok: false, reason: "provider_unavailable", alternatives: [] };
  }

  // Idempotent-retry recovery: a Trigger.dev retry of this same message can
  // arrive after a PRIOR run already booked this exact slot but crashed
  // before replying (e.g. between the Postgres insert below and the
  // WhatsApp send). Without this check, the retry would find the slot
  // correctly filtered out of fresh availability and wrongly tell the
  // parent who just booked it that the time is unavailable. Checked before
  // the availability lookup — that lookup is exactly what would otherwise
  // mask a prior success.
  const priorAttempt = await getAppointmentByWaMessageId(params.waMessageId);
  if (priorAttempt) {
    return toIdempotentBookSlotResult(priorAttempt, school.timezone);
  }

  // Re-verify the EXACT instant the selected id encodes — never just the
  // earliest-N list, which wouldn't even contain a slot a few days out
  // ("Monday 5 PM" booked on a Saturday) and would wrongly bounce the
  // parent to today's times. A tampered/undecodable id fails here before
  // any lookup.
  const decodedStart = decodeSlotId(params.slotId);
  if (!decodedStart) {
    const alternatives = (await listAvailableSlots({ schoolId })) ?? [];
    return { ok: false, reason: "slot_unavailable", alternatives };
  }
  const freshSlots = await listAvailableSlots({ schoolId, exactStartUtcIso: decodedStart });
  const matched = freshSlots?.find((slot) => slot.id === params.slotId);
  if (!matched) {
    // freshSlots here are already the nearest alternatives to the requested
    // instant (exact-target mode sorts by distance), not today's earliest.
    return { ok: false, reason: "slot_unavailable", alternatives: freshSlots ?? [] };
  }

  // Architecture rule: this layer only CONSUMES a fully-resolved slot — it
  // never computes, rounds, or substitutes a time. The id itself encodes the
  // UTC start instant, so this assertion mechanically proves the slot going
  // into Postgres + Google Calendar is exactly the one that was selected.
  // Throws (booking fails loudly) rather than ever booking a different time.
  verifySlotIntegrity(params.slotId, matched);
  if (!school.timezone) {
    throw new Error(`School ${schoolId} has no timezone configured — refusing to book`);
  }
  console.log("Resolved slot verified for booking", {
    conversationId: params.conversationId,
    parentId: params.parentId,
    slotId: params.slotId,
    slotStart: matched.startsAt,
    slotEnd: matched.endsAt,
    timezone: school.timezone,
    label: matched.label,
  });

  let appointmentId: string;
  try {
    const appointment = await insertAppointment({
      schoolId,
      schoolGoogleAccountId: account.id,
      parentId: params.parentId,
      conversationId: params.conversationId,
      name: params.name,
      mobile: params.mobile,
      reason: params.reason,
      slotStart: matched.startsAt,
      slotEnd: matched.endsAt,
      timezone: school.timezone,
      waMessageId: params.waMessageId,
    });
    appointmentId = appointment.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Two possible causes of the SAME error code: (a) a genuine conflict —
      // a different parent/message took this slot_start first, or (b) this
      // exact message raced itself (e.g. two retries in flight at once) and
      // both reached this insert — the wa_message_id unique index rejects
      // the second. Only (b) is idempotent recovery; re-check by
      // wa_message_id rather than assuming which one happened.
      const ownAttempt = await getAppointmentByWaMessageId(params.waMessageId);
      if (ownAttempt) {
        return toIdempotentBookSlotResult(ownAttempt, school.timezone);
      }
      const alternatives = (await listAvailableSlots({ schoolId })) ?? [];
      return { ok: false, reason: "slot_taken", alternatives };
    }
    throw err;
  }

  const client = await getValidGoogleClient(schoolId);
  if (!client) {
    await markAppointmentSyncFailed(appointmentId, "No valid Google client at booking time");
    return { ok: true, appointmentId, slot: matched, calendarSynced: false };
  }

  try {
    // Runtime assertion immediately before the Calendar call: the event
    // payload is built from `matched` and nothing else — re-verify the
    // id ↔ slot binding one last time so a mismatched booking can never
    // reach Google Calendar even if intermediate code changes someday.
    verifySlotIntegrity(params.slotId, matched);
    const eventBody = {
      summary: `${params.name} — ${params.reason}`,
      description: `Booked via School Parent Enquiry AI. Parent mobile: ${params.mobile}`,
      start: { dateTime: matched.startsAt },
      end: { dateTime: matched.endsAt },
    };
    console.log("Google Calendar Request", {
      appointmentId,
      conversationId: params.conversationId,
      parentId: params.parentId,
      calendarId: account.calendar_id,
      slotStart: eventBody.start.dateTime,
      slotEnd: eventBody.end.dateTime,
      timezone: school.timezone,
    });
    const calendar = google.calendar({ version: "v3", auth: client });
    const event = await calendar.events.insert({
      calendarId: account.calendar_id,
      requestBody: eventBody,
    });
    if (event.data.id) {
      await markAppointmentSynced(appointmentId, event.data.id);
      console.log("Google Calendar Success", { appointmentId, googleEventId: event.data.id });
    }
    return { ok: true, appointmentId, slot: matched, calendarSynced: Boolean(event.data.id) };
  } catch (err) {
    // An integrity failure is NOT a sync hiccup — it means a wrong time was
    // about to reach the calendar. Rethrow so the whole booking fails loudly
    // instead of being reported to the parent as a successful booking.
    if (err instanceof SlotIntegrityError) throw err;
    console.error("Google Calendar Failure", { appointmentId, error: err });
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
