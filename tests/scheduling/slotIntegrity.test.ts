import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { decodeSlotId, encodeSlotId, SlotIntegrityError, verifySlotIntegrity } from "@/lib/scheduling/slotId";
import { generateCandidateSlots } from "@/lib/scheduling/slotGenerator";
import type { SchedulingSlot } from "@/lib/scheduling/types";

const TZ = "Asia/Kolkata";

function makeSlot(startIso: string, endIso: string): SchedulingSlot {
  return { id: encodeSlotId(startIso), startsAt: startIso, endsAt: endIso, label: "test" };
}

describe("slot id integrity — the booking layer can never book a different time than the selected id", () => {
  it("Case 3: a slot id round-trips to the exact same UTC instant", () => {
    const start = "2026-07-06T11:30:00.000Z";
    expect(decodeSlotId(encodeSlotId(start))).toBe(start);
  });

  it("verifySlotIntegrity passes when the id and the slot agree", () => {
    const slot = makeSlot("2026-07-06T11:30:00.000Z", "2026-07-06T12:00:00.000Z");
    expect(() => verifySlotIntegrity(slot.id, slot)).not.toThrow();
  });

  it("Case: a substituted slot (id says 5 PM, slot says 3 PM) is refused, never booked", () => {
    const idForFivePm = encodeSlotId("2026-07-06T11:30:00.000Z"); // 5:00 PM IST
    const substituted = makeSlot("2026-07-06T09:30:00.000Z", "2026-07-06T10:00:00.000Z"); // 3:00 PM IST
    expect(() => verifySlotIntegrity(idForFivePm, substituted)).toThrow(SlotIntegrityError);
  });

  it("Case 4: a garbage/tampered id is refused", () => {
    const slot = makeSlot("2026-07-06T11:30:00.000Z", "2026-07-06T12:00:00.000Z");
    expect(() => verifySlotIntegrity("not-a-real-id", slot)).toThrow(SlotIntegrityError);
  });

  it("a slot whose end is not after its start is refused", () => {
    const start = "2026-07-06T11:30:00.000Z";
    const broken: SchedulingSlot = { id: encodeSlotId(start), startsAt: start, endsAt: start, label: "test" };
    expect(() => verifySlotIntegrity(broken.id, broken)).toThrow(SlotIntegrityError);
  });
});

describe("generateCandidateSlots — the scheduling engine is the only source of times", () => {
  const workingHours = { mon: [["10:00", "20:00"]] as Array<[string, string]> };

  it("every generated slot's id encodes exactly its own start instant", () => {
    const slots = generateCandidateSlots({
      workingHours,
      slotDurationMinutes: 30,
      timezone: TZ,
      fromDate: DateTime.fromISO("2026-07-06T09:00:00", { zone: TZ }).toJSDate(),
      daysAhead: 1,
    });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(decodeSlotId(slot.id)).toBe(slot.startsAt);
    }
  });

  it("never generates a slot in the past (no 3:00 PM slot at 3:07 PM)", () => {
    const now = DateTime.fromISO("2026-07-06T15:07:00", { zone: TZ });
    const slots = generateCandidateSlots({
      workingHours,
      slotDurationMinutes: 30,
      timezone: TZ,
      fromDate: now.toJSDate(),
      daysAhead: 1,
    });
    for (const slot of slots) {
      expect(new Date(slot.startsAt).getTime()).toBeGreaterThan(now.toMillis());
    }
    // The first bookable slot at 3:07 PM is 3:30 PM — on the working-hours
    // grid, not a rounding of "now" (they coincide only because the grid is
    // 30 minutes; a 3:00 PM slot must never appear).
    expect(slots[0]!.startsAt).toBe(now.set({ hour: 15, minute: 30, second: 0, millisecond: 0 }).toUTC().toISO());
  });

  it("all slots stay inside working hours", () => {
    const slots = generateCandidateSlots({
      workingHours,
      slotDurationMinutes: 30,
      timezone: TZ,
      fromDate: DateTime.fromISO("2026-07-06T05:00:00", { zone: TZ }).toJSDate(),
      daysAhead: 1,
    });
    for (const slot of slots) {
      const local = DateTime.fromISO(slot.startsAt).setZone(TZ);
      expect(local.hour).toBeGreaterThanOrEqual(10);
      const end = DateTime.fromISO(slot.endsAt).setZone(TZ);
      expect(end.hour * 60 + end.minute).toBeLessThanOrEqual(20 * 60);
    }
  });
});
