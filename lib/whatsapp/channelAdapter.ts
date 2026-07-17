import type { Action } from "@/lib/decision-engine/types";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/sendMessage";
import {
  sendWhatsAppButtons,
  sendWhatsAppListMessage,
  sendWhatsAppSlotList,
} from "@/lib/whatsapp/sendInteractive";

/**
 * WhatsApp renderer for the Decision Engine action union — channel adapters
 * render, never decide (DECISION_ENGINE.md §4 invariant 4). Executes the
 * turn's actions in order and returns the LAST outbound message id (the one
 * recorded as this turn's reply row).
 *
 * Every interactive send is wrapped: if Meta rejects it (policy hiccup,
 * limit edge), the SAME turn falls back to plain text — a patient must
 * always receive something readable, and every tap has a typed equivalent
 * anyway (PATIENT_EXPERIENCE.md §6.2).
 */
export async function executeActionsOnWhatsApp(params: {
  phoneNumberId: string;
  to: string;
  actions: Action[];
  /** Plain-text rendering of the whole turn — the interactive-failure fallback. */
  textFallback: string;
}): Promise<string> {
  let lastOutboundId: string | null = null;

  const sendText = (body: string) =>
    sendWhatsAppTextMessage({ phoneNumberId: params.phoneNumberId, to: params.to, body });

  const withTextFallback = async (interactiveSend: () => Promise<string>, envelope: Action) => {
    try {
      return await interactiveSend();
    } catch (error) {
      console.error("Interactive send failed — falling back to text", {
        action: envelope.action,
        screen: envelope.screen,
        error: error instanceof Error ? error.message : String(error),
      });
      return sendText(params.textFallback);
    }
  };

  for (const envelope of params.actions) {
    const t0 = Date.now();

    switch (envelope.action) {
      case "reply_text":
        lastOutboundId = await sendText(envelope.data.text);
        break;
      case "handoff":
        lastOutboundId = await sendText(params.textFallback);
        break;
      case "show_calendar_slots":
        lastOutboundId = await withTextFallback(
          () =>
            sendWhatsAppSlotList({
              phoneNumberId: params.phoneNumberId,
              to: params.to,
              bodyText: envelope.data.leadIn,
              slots: envelope.data.slots,
            }),
          envelope,
        );
        break;
      case "show_buttons":
        lastOutboundId = await withTextFallback(
          () =>
            sendWhatsAppButtons({
              phoneNumberId: params.phoneNumberId,
              to: params.to,
              bodyText: envelope.data.text,
              buttons: envelope.data.buttons,
            }),
          envelope,
        );
        break;
      case "show_main_menu":
        lastOutboundId = await withTextFallback(
          () =>
            sendWhatsAppListMessage({
              phoneNumberId: params.phoneNumberId,
              to: params.to,
              bodyText: envelope.data.welcomeText,
              buttonLabel: "Main Menu",
              sections: [{ title: "Clinic Services", rows: envelope.data.items }],
            }),
          envelope,
        );
        break;
      case "show_list":
        lastOutboundId = await withTextFallback(
          () =>
            sendWhatsAppListMessage({
              phoneNumberId: params.phoneNumberId,
              to: params.to,
              bodyText: envelope.data.text,
              buttonLabel: envelope.data.buttonLabel,
              sections: envelope.data.sections,
            }),
          envelope,
        );
        break;
      case "show_location": {
        // No per-clinic coordinates yet — the maps link + address text IS
        // the location experience for now; a native location message slots
        // in here once lat/long land in clinic knowledge.
        const lines = [
          `📍 ${envelope.data.clinicName}`,
          envelope.data.address,
          envelope.data.mapsUrl,
        ].filter((line): line is string => Boolean(line));
        lastOutboundId = await sendText(lines.join("\n"));
        break;
      }
      case "send_pdf":
      case "send_image":
        // Designed (PATIENT_EXPERIENCE.md §8) — no clinic asset registry
        // yet. Never drop a turn on an unrenderable action: send the text.
        console.error("Media action not yet renderable — falling back to text", {
          action: envelope.action,
          assetKey: envelope.data.assetKey,
        });
        lastOutboundId = await sendText(envelope.data.fallbackText);
        break;
    }

    // Structured render log per action (PATIENT_EXPERIENCE.md observability):
    // screens are the unit of analytics.
    console.log("Rendered action", {
      action: envelope.action,
      screen: envelope.screen,
      renderMs: Date.now() - t0,
      outboundMessageId: lastOutboundId,
    });
  }

  if (!lastOutboundId) {
    throw new Error("executeActionsOnWhatsApp called with no actions");
  }
  return lastOutboundId;
}
