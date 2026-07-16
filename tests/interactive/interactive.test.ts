import { describe, expect, it } from "vitest";
import { buildButtonsPayload, buildSlotListPayload } from "@/lib/whatsapp/sendInteractive";
import { extractInboundTextMessages, whatsappWebhookPayloadSchema } from "@/lib/whatsapp/types";
import { resolveSelectedSlot } from "@/lib/scheduling/recoverSelectedSlot";
import { translateTurnToActions } from "@/lib/decision-engine/translateV1";
import { encodeSlotId } from "@/lib/scheduling/slotId";
import type { SchedulingSlot } from "@/lib/scheduling/types";

function slot(startUtcIso: string, label: string): SchedulingSlot {
  const end = new Date(new Date(startUtcIso).getTime() + 30 * 60 * 1000).toISOString();
  return { id: encodeSlotId(startUtcIso), startsAt: startUtcIso, endsAt: end, label };
}

const SEVEN_PM = slot("2026-07-04T13:30:00.000Z", "Today – 7:00 PM");
const FIVE_PM = slot("2026-07-04T11:30:00.000Z", "Today – 5:00 PM");

describe("interactive payload builders enforce Meta hard limits (INTERACTIVE_WHATSAPP.md §2)", () => {
  it("builds a list with one row per slot, row id = slot id", () => {
    const payload = buildSlotListPayload({ to: "919999999999", bodyText: "Here are the open times:", slots: [FIVE_PM, SEVEN_PM] }) as any;
    expect(payload.interactive.type).toBe("list");
    expect(payload.interactive.action.sections[0].rows).toHaveLength(2);
    expect(payload.interactive.action.sections[0].rows[1].id).toBe(SEVEN_PM.id);
  });

  it("rejects more than 10 rows", () => {
    const eleven = Array.from({ length: 11 }, (_, i) =>
      slot(new Date(Date.UTC(2026, 6, 6, 5, i * 30)).toISOString(), `Slot ${i}`),
    );
    expect(() => buildSlotListPayload({ to: "x", bodyText: "b", slots: eleven })).toThrow();
  });

  it("truncates row titles to 24 chars", () => {
    const long = slot("2026-07-06T04:30:00.000Z", "Monday, July the 6th – 10:00 AM sharp");
    const payload = buildSlotListPayload({ to: "x", bodyText: "b", slots: [long] }) as any;
    expect(payload.interactive.action.sections[0].rows[0].title.length).toBeLessThanOrEqual(24);
  });

  it("rejects more than 3 buttons and truncates button titles to 20 chars", () => {
    expect(() =>
      buildButtonsPayload({
        to: "x",
        bodyText: "b",
        buttons: [1, 2, 3, 4].map((i) => ({ id: String(i), title: `B${i}` })),
      }),
    ).toThrow();
    const payload = buildButtonsPayload({
      to: "x",
      bodyText: "b",
      buttons: [{ id: "confirm", title: "Confirm this exact appointment now" }],
    }) as any;
    expect(payload.interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20);
  });
});

describe("webhook parsing of tap replies (same internal shape as text)", () => {
  it("parses interactive.list_reply into body=title + interactiveReplyId=id", () => {
    const payload = whatsappWebhookPayloadSchema.parse({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "e",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "123" },
                contacts: [{ wa_id: "919", profile: { name: "Gokul" } }],
                messages: [
                  {
                    from: "919",
                    id: "wamid.tap1",
                    timestamp: "0",
                    type: "interactive",
                    interactive: { type: "list_reply", list_reply: { id: SEVEN_PM.id, title: SEVEN_PM.label } },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const messages = extractInboundTextMessages(payload);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.body).toBe("Today – 7:00 PM");
    expect(messages[0]!.interactiveReplyId).toBe(SEVEN_PM.id);
  });

  it("typed text messages carry interactiveReplyId null", () => {
    const payload = whatsappWebhookPayloadSchema.parse({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "e",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "123" },
                messages: [{ from: "919", id: "wamid.t1", timestamp: "0", type: "text", text: { body: "hi" } }],
              },
            },
          ],
        },
      ],
    });
    expect(extractInboundTextMessages(payload)[0]!.interactiveReplyId).toBeNull();
  });
});

describe("tapped slot outranks everything in selection resolution", () => {
  it("a tap wins even when the model echoed a different (valid) id", () => {
    const res = resolveSelectedSlot({
      selectedSlotId: FIVE_PM.id,
      availableSlots: [FIVE_PM, SEVEN_PM],
      requestedTargetUtcIso: null,
      messageText: SEVEN_PM.label,
      tappedSlotId: SEVEN_PM.id,
    });
    expect(res).toEqual({ kind: "tapped", slot: SEVEN_PM });
  });

  it("an unknown tapped id falls through to normal resolution", () => {
    const res = resolveSelectedSlot({
      selectedSlotId: FIVE_PM.id,
      availableSlots: [FIVE_PM, SEVEN_PM],
      requestedTargetUtcIso: null,
      messageText: "anything",
      tappedSlotId: "stale-or-foreign-id",
    });
    expect(res).toEqual({ kind: "matched", slot: FIVE_PM });
  });
});

describe("translateTurnToActions (Decision Engine step 1)", () => {
  const listReply = `Here are the open times with Dr. Meera:\n\n• ${FIVE_PM.label}\n• ${SEVEN_PM.label}\n\nWhich time works for you?`;

  it("interactive clinic + slot list → show_calendar_slots with the bullets lifted out", () => {
    const actions = translateTurnToActions({
      finalReply: listReply,
      presentedSlots: [FIVE_PM, SEVEN_PM],
      interactiveEnabled: true,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe("show_calendar_slots");
    const action = actions[0]! as Extract<(typeof actions)[number], { type: "show_calendar_slots" }>;
    expect(action.leadIn).toBe("Here are the open times with Dr. Meera:\n\nWhich time works for you?");
    expect(action.slots).toHaveLength(2);
  });

  it("text-only clinic → plain reply_text, byte-identical to v1 behaviour", () => {
    const actions = translateTurnToActions({
      finalReply: listReply,
      presentedSlots: [FIVE_PM, SEVEN_PM],
      interactiveEnabled: false,
    });
    expect(actions).toEqual([{ type: "reply_text", text: listReply }]);
  });

  it("interactive clinic but no slots this turn → plain text", () => {
    const actions = translateTurnToActions({
      finalReply: "✅ Your appointment is booked.",
      presentedSlots: null,
      interactiveEnabled: true,
    });
    expect(actions).toEqual([{ type: "reply_text", text: "✅ Your appointment is booked." }]);
  });
});
