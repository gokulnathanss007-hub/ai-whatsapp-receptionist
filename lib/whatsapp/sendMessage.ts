const GRAPH_API_VERSION = "v20.0";

/**
 * Sends a free-form WhatsApp session message via the Meta Cloud API. Only
 * valid inside the 24-hour customer-service window — see
 * /docs/PROJECT_ARCHITECTURE.md §4. No template is used or needed here.
 */
/** Sends the message and returns the Meta-assigned outbound message id. */
export async function sendWhatsAppTextMessage(params: {
  phoneNumberId: string;
  to: string;
  body: string;
}): Promise<string> {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) throw new Error("META_WHATSAPP_TOKEN must be set");

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${params.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "text",
        text: { body: params.body },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp send failed (${response.status}): ${errorBody}`);
  }

  const json = (await response.json()) as { messages?: Array<{ id: string }> };
  const outboundId = json.messages?.[0]?.id;
  if (!outboundId) throw new Error("WhatsApp send response contained no message id");
  return outboundId;
}
