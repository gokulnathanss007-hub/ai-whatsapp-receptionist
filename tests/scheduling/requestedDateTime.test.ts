import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { resolveRequestedDateTime } from "@/lib/scheduling/requestedDateTime";

const TZ = "Asia/Kolkata";
// Thursday, 2026-07-02, 3:07 PM IST — mirrors the P0 incident report's
// "current real time 3:07 PM" framing.
const THURSDAY_1507 = DateTime.fromISO("2026-07-02T15:07:00", { zone: TZ }).toJSDate();
// Monday, 2026-07-06.
const MONDAY_1507 = DateTime.fromISO("2026-07-06T15:07:00", { zone: TZ }).toJSDate();

function resolve(text: string, now: Date) {
  return resolveRequestedDateTime({ text, timezone: TZ, now });
}

describe("resolveRequestedDateTime — P0 regression: parent's stated day+time must resolve exactly", () => {
  it("Case 1: 'Book Monday 5 PM' at Thursday 3:07 PM resolves to the coming Monday 5 PM — never today", () => {
    const target = resolve("Book me on Monday at 5:00 PM.", THURSDAY_1507);
    expect(target).not.toBeNull();
    expect(target!.toISO()).toBe(DateTime.fromISO("2026-07-06T17:00:00", { zone: TZ }).toISO());
    expect(target!.weekday).toBe(1);
    expect(target!.hasSame(DateTime.fromJSDate(THURSDAY_1507, { zone: TZ }), "day")).toBe(false);
  });

  it("Case 2: 'Book today 7 PM' at 3:07 PM resolves to today 7 PM — never a rounded current time", () => {
    const target = resolve("I want today's 7 PM slot.", THURSDAY_1507);
    expect(target).not.toBeNull();
    expect(target!.toISO()).toBe(DateTime.fromISO("2026-07-02T19:00:00", { zone: TZ }).toISO());
  });

  it("'tomorrow 6pm' resolves to the next calendar day", () => {
    const target = resolve("tomorrow at 6pm please", THURSDAY_1507);
    expect(target!.toISO()).toBe(DateTime.fromISO("2026-07-03T18:00:00", { zone: TZ }).toISO());
  });

  it("bare time with no day means today", () => {
    const target = resolve("is 5pm free?", THURSDAY_1507);
    expect(target!.toISO()).toBe(DateTime.fromISO("2026-07-02T17:00:00", { zone: TZ }).toISO());
  });

  it("'Monday 5 PM' asked ON a Monday before 5 PM means today", () => {
    const target = resolve("monday 5pm", MONDAY_1507);
    expect(target!.toISO()).toBe(DateTime.fromISO("2026-07-06T17:00:00", { zone: TZ }).toISO());
  });

  it("'Monday 2 PM' asked ON a Monday at 3:07 PM rolls to next week — the time has passed", () => {
    const target = resolve("monday 2pm", MONDAY_1507);
    expect(target!.toISO()).toBe(DateTime.fromISO("2026-07-13T14:00:00", { zone: TZ }).toISO());
  });

  it("'next Monday 5 PM' asked ON a Monday always skips to next week", () => {
    const target = resolve("next monday 5pm", MONDAY_1507);
    expect(target!.toISO()).toBe(DateTime.fromISO("2026-07-13T17:00:00", { zone: TZ }).toISO());
  });

  it("full weekday names resolve the same as abbreviations", () => {
    const target = resolve("Saturday at 11am", THURSDAY_1507);
    expect(target!.toISO()).toBe(DateTime.fromISO("2026-07-04T11:00:00", { zone: TZ }).toISO());
  });

  it("ambiguous numeric dates stay unresolved (never guessed)", () => {
    expect(resolve("12/8 at 5pm", THURSDAY_1507)).toBeNull();
  });

  it("no AM/PM marker stays unresolved (never guessed)", () => {
    expect(resolve("book me at 5", THURSDAY_1507)).toBeNull();
  });
});
