import { tasks } from "@trigger.dev/sdk";
import type { ReplyPipelinePayload, replyPipelineTask } from "@/trigger/replyPipeline";
import { verifyMetaSignature, verifyWebhookHandshake } from "@/lib/whatsapp/verifySignature";
import { extractInboundTextMessages, whatsappWebhookPayloadSchema } from "@/lib/whatsapp/types";
import { isEventProcessed } from "@/lib/supabase/queries";

// Meta's verification handshake — see /docs/PROJECT_ARCHITECTURE.md §2.1.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const challenge = verifyWebhookHandshake(
    url.searchParams.get("hub.mode"),
    url.searchParams.get("hub.verify_token"),
    url.searchParams.get("hub.challenge"),
  );

  if (!challenge) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200 });
}

// Receives inbound messages. Does no AI work inline — verifies, dedupes,
// enqueues a Trigger.dev task per message, and acks fast (CLAUDE.md §7).
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  const signatureValid = verifyMetaSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
  );
  if (!signatureValid) return new Response("Invalid signature", { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = whatsappWebhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    // Not a shape we understand (e.g. a status callback) — ack so Meta stops retrying.
    return new Response("OK", { status: 200 });
  }

  const inboundMessages = extractInboundTextMessages(parsed.data);

  await Promise.all(
    inboundMessages.map(async (message) => {
      if (await isEventProcessed(message.waMessageId)) return;

      const payload: ReplyPipelinePayload = {
        phoneNumberId: message.phoneNumberId,
        waMessageId: message.waMessageId,
        fromWaId: message.fromWaId,
        contactName: message.contactName,
        body: message.body,
      };

      await tasks.trigger<typeof replyPipelineTask>("whatsapp-reply-pipeline", payload, {
        idempotencyKey: message.waMessageId,
      });
    }),
  );

  return new Response("OK", { status: 200 });
}
