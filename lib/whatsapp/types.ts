import { z } from "zod";

// Meta WhatsApp Business Cloud API webhook payload — only the fields this
// pipeline reads. See https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks

const webhookMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  // Tap replies to interactive messages (INTERACTIVE_WHATSAPP.md §2): parsed
  // at this boundary into the same internal shape as text — body carries the
  // human title, interactiveReplyId carries the backend key (e.g. slot id).
  interactive: z
    .object({
      type: z.string(),
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
});

const webhookContactSchema = z.object({
  profile: z.object({ name: z.string() }).optional(),
  wa_id: z.string(),
});

const webhookValueSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  metadata: z.object({
    display_phone_number: z.string().optional(),
    phone_number_id: z.string(),
  }),
  contacts: z.array(webhookContactSchema).optional(),
  messages: z.array(webhookMessageSchema).optional(),
  statuses: z.array(z.unknown()).optional(),
});

const webhookChangeSchema = z.object({
  value: webhookValueSchema,
  field: z.string(),
});

const webhookEntrySchema = z.object({
  id: z.string(),
  changes: z.array(webhookChangeSchema),
});

export const whatsappWebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(webhookEntrySchema),
});
export type WhatsappWebhookPayload = z.infer<typeof whatsappWebhookPayloadSchema>;

export interface InboundTextMessage {
  phoneNumberId: string;
  waMessageId: string;
  fromWaId: string;
  contactName: string | null;
  body: string;
  /** Set when the patient tapped a button/list row: the backend key (e.g. a slot id) Meta echoed back. Null for typed messages. */
  interactiveReplyId: string | null;
}

/** Flattens a webhook payload into the inbound messages it carries — typed text and interactive tap replies (ignores status callbacks and other types). */
export function extractInboundTextMessages(
  payload: WhatsappWebhookPayload,
): InboundTextMessage[] {
  const results: InboundTextMessage[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const { value } = change;
      if (!value.messages) continue;

      const contactByWaId = new Map(
        (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]),
      );

      for (const message of value.messages) {
        const common = {
          phoneNumberId: value.metadata.phone_number_id,
          waMessageId: message.id,
          fromWaId: message.from,
          contactName: contactByWaId.get(message.from) ?? null,
        };

        if (message.type === "text" && message.text) {
          results.push({ ...common, body: message.text.body, interactiveReplyId: null });
          continue;
        }

        if (message.type === "interactive" && message.interactive) {
          const reply = message.interactive.button_reply ?? message.interactive.list_reply;
          if (reply) {
            // The human title becomes the body so the whole downstream
            // pipeline (history, prompt, time parsing) sees a normal
            // message; the id rides alongside for deterministic resolution.
            results.push({ ...common, body: reply.title, interactiveReplyId: reply.id });
          }
        }
      }
    }
  }

  return results;
}
