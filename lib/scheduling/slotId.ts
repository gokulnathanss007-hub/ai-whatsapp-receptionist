import type { SchedulingSlot } from "@/lib/scheduling/types";

// A slot id IS its UTC start instant (base64url-encoded ISO string) — there
// is deliberately no lookup table that could drift out of sync. That makes
// end-to-end integrity mechanically checkable: at booking time, the id the
// AI selected can be decoded and compared against the slot about to be sent
// to Google Calendar. See verifySlotIntegrity() below and
// /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7.

export function encodeSlotId(startsAtUtcIso: string): string {
  return Buffer.from(startsAtUtcIso).toString("base64url");
}

export function decodeSlotId(slotId: string): string | null {
  try {
    const decoded = Buffer.from(slotId, "base64url").toString("utf-8");
    // A valid id decodes to an ISO instant; anything else is tampered/garbage.
    return Number.isNaN(Date.parse(decoded)) ? null : decoded;
  } catch {
    return null;
  }
}

export class SlotIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlotIntegrityError";
  }
}

/**
 * Runtime assertion that the slot about to be booked is EXACTLY the one the
 * selected id refers to — the booking layer consuming a resolved slot, never
 * choosing one. Throws (aborting the booking) rather than ever letting a
 * substituted time reach Postgres or Google Calendar. This must hold by
 * construction (`matched` is found by this very id), so a failure here means
 * genuine corruption somewhere upstream — fail loudly, never book.
 */
export function verifySlotIntegrity(slotId: string, slot: SchedulingSlot): void {
  const decodedStart = decodeSlotId(slotId);
  if (decodedStart === null) {
    throw new SlotIntegrityError(`Slot id does not decode to a valid instant: ${slotId}`);
  }
  if (decodedStart !== slot.startsAt) {
    throw new SlotIntegrityError(
      `Slot id decodes to ${decodedStart} but the slot being booked starts at ${slot.startsAt} — refusing to book a substituted time`,
    );
  }
  if (!slot.startsAt || !slot.endsAt) {
    throw new SlotIntegrityError("Slot is missing start or end — refusing to book");
  }
  if (new Date(slot.endsAt).getTime() <= new Date(slot.startsAt).getTime()) {
    throw new SlotIntegrityError(
      `Slot end (${slot.endsAt}) is not after start (${slot.startsAt}) — refusing to book`,
    );
  }
}
