export interface SchedulingSlot {
  /** Opaque, stable id (base64url of the UTC start instant). */
  id: string;
  /** ISO 8601, UTC. */
  startsAt: string;
  /** ISO 8601, UTC. */
  endsAt: string;
  /** Human-readable, clinic-local time — e.g. "Today – 4:30 PM". */
  label: string;
}

export interface BookSlotParams {
  slotId: string;
  patientId: string;
  conversationId: string;
  name: string;
  mobile: string;
  reason: string;
}

export type BookSlotResult =
  | { ok: true; appointmentId: string; slot: SchedulingSlot; calendarSynced: boolean }
  | {
      ok: false;
      /** slot_unavailable: the id was stale/tampered/no longer valid. slot_taken: lost the race to another booking. provider_unavailable: clinic has no working Google connection. */
      reason: "slot_unavailable" | "slot_taken" | "provider_unavailable";
      alternatives: SchedulingSlot[];
    };

/**
 * The seam a future provider (Outlook, Practo, MocDoc, ...) implements —
 * conversation/AI logic should only ever depend on this interface, never on
 * a specific provider's API client. See /docs/GOOGLE_CALENDAR_INTEGRATION.md §5.
 */
export interface SchedulingProvider {
  /**
   * `requestHint` is raw text that may state a specific date/time (e.g. the
   * patient's current message). When it resolves to a real target, the
   * exact requested slot is checked first — see
   * /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7.
   */
  listAvailableSlots(params?: { daysAhead?: number; requestHint?: string }): Promise<SchedulingSlot[]>;
  bookSlot(params: BookSlotParams): Promise<BookSlotResult>;
}
