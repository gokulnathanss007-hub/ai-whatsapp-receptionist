import type { Action } from "@/lib/decision-engine/types";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/sendMessage";
import { sendWhatsAppButtons, sendWhatsAppSlotList } from "@/lib/whatsapp/sendInteractive";

/**
 * WhatsApp renderer for the Decision Engine action union — channel adapters
 * render, never decide (DECISION_ENGINE.md §4 invariant 4). Executes the
 * turn's actions in order and returns the LAST outbound message id (the one
 * recorded as this turn's reply row).
 *
 * If an interactive send fails (e.g. a Meta policy hiccup), falls back to
 * plain text with the same content — a patient must always receive
 * SOMETHING readable, and every tap has a typed equivalent anyway
 * (INTERACTIVE_WHATSAPP.md §4.2).
 */
export async function executeActionsOnWhatsApp(params: {
  phoneNumberId: string;
  to: string;
  actions: Action[];
  /** Plain-text rendering of the whole turn — the interactive-failure fallback. */
  textFallback: string;
}): Promise<string> {
  let lastOutboundId: string | null = null;

  for (const action of params.actions) {
    switch (action.type) {
      case "reply_text":
      case "handoff":
        lastOutboundId = await sendWhatsAppTextMessage({
          phoneNumberId: params.phoneNumberId,
          to: params.to,
          body: action.type === "reply_text" ? action.text : params.textFallback,
        });
        break;
      case "show_calendar_slots":
        try {
          lastOutboundId = await sendWhatsAppSlotList({
            phoneNumberId: params.phoneNumberId,
            to: params.to,
            bodyText: action.leadIn,
            slots: action.slots,
          });
        } catch (error) {
          console.error("Interactive list send failed — falling back to text", {
            error: error instanceof Error ? error.message : String(error),
          });
          lastOutboundId = await sendWhatsAppTextMessage({
            phoneNumberId: params.phoneNumberId,
            to: params.to,
            body: params.textFallback,
          });
        }
        break;
      case "show_buttons":
        try {
          lastOutboundId = await sendWhatsAppButtons({
            phoneNumberId: params.phoneNumberId,
            to: params.to,
            bodyText: action.text,
            buttons: action.buttons,
          });
        } catch (error) {
          console.error("Interactive buttons send failed — falling back to text", {
            error: error instanceof Error ? error.message : String(error),
          });
          lastOutboundId = await sendWhatsAppTextMessage({
            phoneNumberId: params.phoneNumberId,
            to: params.to,
            body: params.textFallback,
          });
        }
        break;
    }
  }

  if (!lastOutboundId) {
    throw new Error("executeActionsOnWhatsApp called with no actions");
  }
  return lastOutboundId;
}
