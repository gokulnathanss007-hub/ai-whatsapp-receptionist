import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { resolveRequestedDateTime } from "@/lib/scheduling/requestedDateTime";
import { generateCandidateSlots } from "@/lib/scheduling/slotGenerator";
import { decodeSlotId } from "@/lib/scheduling/slotId";

const TZ = "Asia/Kolkata"; // UTC+05:30 — a half-hour offset catches more bugs than whole-hour zones.
// Thursday, 2026-07-02, 3:07 PM IST.
const THURSDAY_1507 = DateTime.fromISO("2026-07-02T15:07:00", { zone: TZ }).toJSDate();

describe("timezone correctness — clinic-local times must never be silently reinterpreted as UTC", () => {
  it("'Monday 5 PM' resolves to 17:00 in Asia/Kolkata (11:30 UTC) — not 17:00 UTC", () => {
    const target = resolveRequestedDateTime({
      text: "Book me on Monday at 5 PM",
      timezone: TZ,
      now: THURSDAY_1507,
    })!;
    expect(target.toISO()).toBe("2026-07-06T17:00:00.000+05:30");
    expect(target.toUTC().toISO()).toBe("2026-07-06T11:30:00.000Z");
    // 17:00 UTC would be 10:30 PM IST — a 5.5 hour error a patient would definitely notice.
    expect(target.toUTC().toISO()).not.toBe("2026-07-06T17:00:00.000Z");
  });

  it("a late-night local time lands on the PREVIOUS UTC calendar day without shifting the local day", () => {
    // 12:30 AM IST tomorrow = 7:00 PM UTC *today* — the UTC date is one day
    // behind the local date. Both views must describe the same instant.
    const target = resolveRequestedDateTime({
      text: "tomorrow 12:30 am",
      timezone: TZ,
      now: THURSDAY_1507,
    })!;
    expect(target.toISO()).toBe("2026-07-03T00:30:00.000+05:30");
    expect(target.toUTC().toISO()).toBe("2026-07-02T19:00:00.000Z");
  });

  it("a 23:30–00:00 slot crosses local midnight with a consistent UTC id", () => {
    const slots = generateCandidateSlots({
      workingHours: { thu: [["23:00", "24:00"]] },
      slotDurationMinutes: 30,
      timezone: TZ,
      fromDate: THURSDAY_1507,
      daysAhead: 1,
    });
    const lastSlot = slots[slots.length - 1]!;
    // 11:30 PM IST Thursday = 6:00 PM UTC Thursday; ends 00:00 IST Friday = 6:30 PM UTC Thursday.
    expect(lastSlot.startsAt).toBe("2026-07-02T18:00:00.000Z");
    expect(lastSlot.endsAt).toBe("2026-07-02T18:30:00.000Z");
    expect(DateTime.fromISO(lastSlot.startsAt).setZone(TZ).toFormat("HH:mm")).toBe("23:30");
    expect(DateTime.fromISO(lastSlot.endsAt).setZone(TZ).toFormat("HH:mm")).toBe("00:00");
    expect(DateTime.fromISO(lastSlot.endsAt).setZone(TZ).day).toBe(3); // next local day
    expect(decodeSlotId(lastSlot.id)).toBe(lastSlot.startsAt);
  });

  it("an exact-match comparison works across the UTC boundary (target instant === slot instant)", () => {
    const target = resolveRequestedDateTime({
      text: "today 11:30 pm",
      timezone: TZ,
      now: THURSDAY_1507,
    })!;
    const slots = generateCandidateSlots({
      workingHours: { thu: [["23:00", "24:00"]] },
      slotDurationMinutes: 30,
      timezone: TZ,
      fromDate: THURSDAY_1507,
      daysAhead: 1,
    });
    // This is the identical comparison listAvailableSlots uses for its
    // exact-match path — proven to line up across the midnight/UTC boundary.
    const exact = slots.find((slot) => slot.startsAt === target.toUTC().toISO());
    expect(exact).toBeDefined();
  });

  it("the same wall-clock request in a different timezone is a different instant", () => {
    const kolkata = resolveRequestedDateTime({ text: "Monday 5 pm", timezone: TZ, now: THURSDAY_1507 })!;
    const dubai = resolveRequestedDateTime({ text: "Monday 5 pm", timezone: "Asia/Dubai", now: THURSDAY_1507 })!;
    expect(kolkata.toUTC().toISO()).toBe("2026-07-06T11:30:00.000Z");
    expect(dubai.toUTC().toISO()).toBe("2026-07-06T13:00:00.000Z");
  });
});
