import { z } from "zod";

// Meta WhatsApp Business Cloud API webhook payload — only the fields this
// pipeline reads. See https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks

const webhookMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
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
}

/** Flattens a webhook payload into the inbound text messages it carries (ignores status callbacks and non-text types). */
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
        if (message.type !== "text" || !message.text) continue;
        results.push({
          phoneNumberId: value.metadata.phone_number_id,
          waMessageId: message.id,
          fromWaId: message.from,
          contactName: contactByWaId.get(message.from) ?? null,
          body: message.text.body,
        });
      }
    }
  }

  return results;
}
