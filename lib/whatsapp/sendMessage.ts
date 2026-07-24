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

/**
 * Sends a document (e.g. a PDF) via the Meta Cloud API, referenced by a
 * public HTTPS URL — Meta fetches and forwards it, no separate media-upload
 * step needed. See lib/decision-engine/types.ts "send_pdf" and
 * /supabase/migrations/0014_school_assets.sql for where `link` comes from.
 */
export async function sendWhatsAppDocument(params: {
  phoneNumberId: string;
  to: string;
  link: string;
  filename: string;
  caption?: string;
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
        type: "document",
        document: {
          link: params.link,
          filename: params.filename,
          ...(params.caption ? { caption: params.caption } : {}),
        },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp document send failed (${response.status}): ${errorBody}`);
  }

  const json = (await response.json()) as { messages?: Array<{ id: string }> };
  const outboundId = json.messages?.[0]?.id;
  if (!outboundId) throw new Error("WhatsApp document send response contained no message id");
  return outboundId;
}

/**
 * Sends an image via the Meta Cloud API, referenced by a public HTTPS URL —
 * same `link`-based pattern as sendWhatsAppDocument above, no media-upload
 * step needed. See lib/decision-engine/types.ts "send_image" and
 * /supabase/migrations/0014_school_assets.sql for where `link` comes from.
 */
export async function sendWhatsAppImage(params: {
  phoneNumberId: string;
  to: string;
  link: string;
  caption?: string;
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
        type: "image",
        image: {
          link: params.link,
          ...(params.caption ? { caption: params.caption } : {}),
        },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp image send failed (${response.status}): ${errorBody}`);
  }

  const json = (await response.json()) as { messages?: Array<{ id: string }> };
  const outboundId = json.messages?.[0]?.id;
  if (!outboundId) throw new Error("WhatsApp image send response contained no message id");
  return outboundId;
}
