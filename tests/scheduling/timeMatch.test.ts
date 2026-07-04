import { describe, expect, it } from "vitest";
import { extractTimeMentions, slotMatchesTimeMention } from "@/lib/scheduling/timeMatch";
import type { SchedulingSlot } from "@/lib/scheduling/types";

function slotWithLabel(label: string): SchedulingSlot {
  return { id: "x", startsAt: "2026-07-06T11:30:00.000Z", endsAt: "2026-07-06T12:00:00.000Z", label };
}

describe("mismatch guard — a stated time must match the slot about to be booked", () => {
  it("extracts '7 PM' from a booking message", () => {
    expect(extractTimeMentions("I want today's 7 PM slot.")).toEqual(["19:00"]);
  });

  it("a 3:30 PM slot does NOT match a message asking for 7 PM (the incident's exact wrong pairing)", () => {
    expect(slotMatchesTimeMention(slotWithLabel("Today – 3:30 PM"), extractTimeMentions("I want today's 7 PM slot."))).toBe(
      false,
    );
  });

  it("a 7:00 PM slot matches a message asking for 7 PM", () => {
    expect(slotMatchesTimeMention(slotWithLabel("Today – 7:00 PM"), extractTimeMentions("I want today's 7 PM slot."))).toBe(
      true,
    );
  });

  it("no stated time this turn means nothing to contradict", () => {
    expect(slotMatchesTimeMention(slotWithLabel("Today – 3:30 PM"), extractTimeMentions("yes confirm it"))).toBe(true);
  });
});
