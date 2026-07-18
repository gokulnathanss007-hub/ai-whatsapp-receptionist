import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { dayRowId, groupSlotsIntoDayOptions, parseDayRowId } from "@/lib/scheduling/dayPicker";
import { renderDayPickerText } from "@/lib/scheduling/renderSlotsBlock";
import { translateTurnToActions } from "@/lib/decision-engine/translateV1";
import { encodeSlotId } from "@/lib/scheduling/slotId";
import type { SchedulingSlot } from "@/lib/scheduling/types";

const TZ = "Asia/Kolkata";
// Friday, 2026-07-17, 9:00 AM IST.
const NOW = DateTime.fromISO("2026-07-17T09:00:00", { zone: TZ }).toJSDate();

function slotAt(localIso: string): SchedulingSlot {
  const start = DateTime.fromISO(localIso, { zone: TZ });
  const startUtc = start.toUTC().toISO()!;
  return {
    id: encodeSlotId(startUtc),
    startsAt: startUtc,
    endsAt: start.plus({ minutes: 30 }).toUTC().toISO()!,
    label: `${start.toFormat("EEE, MMM d")} – ${start.toFormat("h:mm a")}`,
  };
}

describe("day-first booking: grouping free slots into day options", () => {
  // Fri (2 slots), Sat (1 slot), SUNDAY CLOSED (no slots), Mon (1 slot).
  const slots = [
    slotAt("2026-07-17T10:00:00"),
    slotAt("2026-07-17T17:00:00"),
    slotAt("2026-07-18T11:00:00"),
    slotAt("2026-07-20T10:00:00"),
  ];
  const days = groupSlotsIntoDayOptions({ slots, timezone: TZ, now: NOW });

  it("labels days as Today / Tomorrow / weekday, in order", () => {
    expect(days.map((d) => d.title)).toEqual(["Today", "Tomorrow", "Mon, Jul 20"]);
  });

  it("closed days (no free slots) never appear — Sunday is absent", () => {
    expect(days.some((d) => d.dayKey === "2026-07-19")).toBe(false);
  });

  it("counts free times per day", () => {
    expect(days[0]!.freeCount).toBe(2);
    expect(days[1]!.freeCount).toBe(1);
  });

  it("day row ids round-trip", () => {
    expect(parseDayRowId(dayRowId("2026-07-20"))).toBe("2026-07-20");
    expect(parseDayRowId("menu_book_appointment")).toBeNull();
    expect(parseDayRowId("day_garbage")).toBeNull();
  });
});

describe("day picker rendering", () => {
  const days = [
    { dayKey: "2026-07-17", title: "Today", freeCount: 8 },
    { dayKey: "2026-07-18", title: "Tomorrow", freeCount: 12 },
  ];

  it("text fallback lists each open day", () => {
    const text = renderDayPickerText(days);
    expect(text).toContain("Which day works for you?");
    expect(text).toContain("• Today (8 times open)");
    expect(text).toContain("• Tomorrow (12 times open)");
  });

  it("interactive clinics get a show_list envelope on the day_picker screen", () => {
    const actions = translateTurnToActions({
      finalReply: renderDayPickerText(days),
      presentedSlots: null,
      interactiveEnabled: true,
      presentedDays: days,
    });
    expect(actions).toHaveLength(1);
    const envelope = actions[0]!;
    expect(envelope.action).toBe("show_list");
    expect(envelope.screen).toBe("day_picker");
    const data = (envelope as Extract<typeof envelope, { action: "show_list" }>).data;
    expect(data.buttonLabel).toBe("Pick a day");
    expect(data.sections[0]!.rows.map((r) => r.id)).toEqual(["day_2026-07-17", "day_2026-07-18"]);
    expect(data.sections[0]!.rows[0]!.description).toBe("8 times open");
    expect(data.text).toBe("Which day works for you?\n\nJust reply with the day.");
  });

  it("text-only clinics keep the plain text (no day list envelope)", () => {
    const actions = translateTurnToActions({
      finalReply: renderDayPickerText(days),
      presentedSlots: null,
      interactiveEnabled: false,
      presentedDays: days,
    });
    expect(actions[0]!.action).toBe("reply_text");
  });
});
