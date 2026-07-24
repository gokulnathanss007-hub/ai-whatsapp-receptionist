import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { resolveRequestedDateTime } from "@/lib/scheduling/requestedDateTime";
import { extractTimeMentions } from "@/lib/scheduling/timeMatch";

const TZ = "Asia/Kolkata";
const NOW = DateTime.fromISO("2026-07-02T15:07:00", { zone: TZ }).toJSDate();

function resolve(text: string) {
  return resolveRequestedDateTime({ text, timezone: TZ, now: NOW });
}

// Contract for vague phrasings (documented in
// /docs/GOOGLE_CALENDAR_INTEGRATION.md "Supported date/time expressions"):
// anything without BOTH an explicit clock time AND an am/pm marker must
// resolve to null — never to a guessed instant. A null target means the
// pipeline presents the real availability list and lets the parent pick,
// which is always safe; a wrong guessed target could drive a wrong booking.
describe("ambiguous requests never resolve to a guessed time", () => {
  const vagueExpressions = [
    "Book tomorrow evening",
    "Book after lunch",
    "Book Monday",
    "Book next week",
    "Book in the morning",
    "Book after 5",
    "Book anytime tomorrow",
  ];

  for (const text of vagueExpressions) {
    it(`'${text}' → null (falls back to presenting the real list)`, () => {
      expect(resolve(text)).toBeNull();
    });
  }

  it("vague phrasings also produce no time-mentions, so the mismatch guard stays neutral (parent's explicit list pick decides)", () => {
    for (const text of vagueExpressions) {
      expect(extractTimeMentions(text)).toEqual([]);
    }
  });

  it("adding a concrete am/pm time to a vague phrase makes it resolvable", () => {
    const target = resolve("Book tomorrow evening, maybe 6 pm");
    expect(target).not.toBeNull();
    expect(target!.toISO()).toBe(DateTime.fromISO("2026-07-03T18:00:00", { zone: TZ }).toISO());
  });
});
