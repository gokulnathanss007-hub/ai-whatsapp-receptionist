import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { resolveSelectedSlot } from "@/lib/scheduling/recoverSelectedSlot";
import { resolveRequestedDateTime } from "@/lib/scheduling/requestedDateTime";
import { encodeSlotId } from "@/lib/scheduling/slotId";
import type { SchedulingSlot } from "@/lib/scheduling/types";

const TZ = "Asia/Kolkata";

function slot(startUtcIso: string, label: string): SchedulingSlot {
  const end = new Date(new Date(startUtcIso).getTime() + 30 * 60 * 1000).toISOString();
  return { id: encodeSlotId(startUtcIso), startsAt: startUtcIso, endsAt: end, label };
}

// 7:00 PM IST on 2026-07-04 = 13:30 UTC.
const SEVEN_PM = slot("2026-07-04T13:30:00.000Z", "Today – 7:00 PM");
const FIVE_PM = slot("2026-07-04T11:30:00.000Z", "Today – 5:00 PM");
const NOW = DateTime.fromISO("2026-07-04T16:44:00", { zone: TZ }).toJSDate();

function targetIso(text: string): string | null {
  return resolveRequestedDateTime({ text, timezone: TZ, now: NOW })?.toUTC().toISO() ?? null;
}

describe("resolveSelectedSlot — 2026-07-04 'Today 7.pm' incident regression", () => {
  it("a correctly echoed id matches directly", () => {
    const res = resolveSelectedSlot({
      selectedSlotId: SEVEN_PM.id,
      availableSlots: [FIVE_PM, SEVEN_PM],
      requestedTargetUtcIso: targetIso("Today 7.pm"),
      messageText: "Today 7.pm",
    });
    expect(res).toEqual({ kind: "matched", slot: SEVEN_PM });
  });

  it("the incident: corrupted id + 'Today 7.pm' recovers the exact 7 PM slot from the patient's words", () => {
    const res = resolveSelectedSlot({
      selectedSlotId: "garbled-by-the-model",
      availableSlots: [FIVE_PM, SEVEN_PM],
      requestedTargetUtcIso: targetIso("Today 7.pm"),
      messageText: "Today 7.pm",
    });
    expect(res.kind).toBe("recovered");
    expect(res.kind === "recovered" && res.slot.startsAt).toBe(SEVEN_PM.startsAt);
  });

  it("recovers via time-of-day mention when no full target parsed ('7.00 Pm' with no day)", () => {
    const res = resolveSelectedSlot({
      selectedSlotId: "garbled",
      availableSlots: [FIVE_PM, SEVEN_PM],
      requestedTargetUtcIso: null,
      messageText: "7.00 Pm please",
    });
    expect(res.kind).toBe("recovered");
    expect(res.kind === "recovered" && res.slot.label).toBe("Today – 7:00 PM");
  });

  it("stays unresolved when the patient's words match nothing offered", () => {
    const res = resolveSelectedSlot({
      selectedSlotId: "garbled",
      availableSlots: [FIVE_PM, SEVEN_PM],
      requestedTargetUtcIso: null,
      messageText: "confirm it",
    });
    expect(res.kind).toBe("unresolved");
  });

  it("stays unresolved when the stated time matches more than one offered slot (never guesses between days)", () => {
    const mondaySevenPm = slot("2026-07-06T13:30:00.000Z", "Mon, Jul 6 – 7:00 PM");
    const res = resolveSelectedSlot({
      selectedSlotId: "garbled",
      availableSlots: [SEVEN_PM, mondaySevenPm],
      requestedTargetUtcIso: null,
      messageText: "7 pm",
    });
    expect(res.kind).toBe("unresolved");
  });
});
