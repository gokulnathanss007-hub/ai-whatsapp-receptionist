import type { ButtonSpec } from "@/lib/decision-engine/types";
import type { SchedulingSlot } from "@/lib/scheduling/types";

const GRAPH_API_VERSION = "v20.0";

// Meta Cloud API hard limits — INTERACTIVE_WHATSAPP.md §2. Enforced here in
// the executor, never assumed from the model (DECISION_ENGINE.md §4 invariant
// 1: the model cannot make the executor exceed a Meta limit).
const MAX_BUTTONS = 3;
const MAX_LIST_ROWS = 10;
const BUTTON_TITLE_MAX = 20;
const LIST_ROW_TITLE_MAX = 24;
const LIST_BUTTON_LABEL_MAX = 20;
const BODY_MAX = 1024;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Pure payload builder — exported for limit-enforcement unit tests. */
export function buildSlotListPayload(params: {
  to: string;
  bodyText: string;
  slots: SchedulingSlot[];
}): Record<string, unknown> {
  if (params.slots.length === 0 || params.slots.length > MAX_LIST_ROWS) {
    throw new Error(`List message requires 1-${MAX_LIST_ROWS} rows, got ${params.slots.length}`);
  }
  return {
    messaging_product: "whatsapp",
    to: params.to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: truncate(params.bodyText, BODY_MAX) },
      action: {
        button: truncate("Pick a time", LIST_BUTTON_LABEL_MAX),
        sections: [
          {
            title: truncate("Open times", LIST_ROW_TITLE_MAX),
            rows: params.slots.map((slot) => ({
              // The row id IS the slot id — the webhook hands it back
              // verbatim in interactive.list_reply.id, giving a
              // deterministic tap→slot binding with no model echo involved.
              id: slot.id,
              title: truncate(slot.label, LIST_ROW_TITLE_MAX),
            })),
          },
        ],
      },
    },
  };
}

/** Pure payload builder — exported for limit-enforcement unit tests. */
export function buildButtonsPayload(params: {
  to: string;
  bodyText: string;
  buttons: ButtonSpec[];
}): Record<string, unknown> {
  if (params.buttons.length === 0 || params.buttons.length > MAX_BUTTONS) {
    throw new Error(`Buttons message requires 1-${MAX_BUTTONS} buttons, got ${params.buttons.length}`);
  }
  return {
    messaging_product: "whatsapp",
    to: params.to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: truncate(params.bodyText, BODY_MAX) },
      action: {
        buttons: params.buttons.map((button) => ({
          type: "reply",
          reply: { id: button.id, title: truncate(button.title, BUTTON_TITLE_MAX) },
        })),
      },
    },
  };
}

async function postToMeta(phoneNumberId: string, payload: Record<string, unknown>): Promise<string> {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) throw new Error("META_WHATSAPP_TOKEN must be set");

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp interactive send failed (${response.status}): ${errorBody}`);
  }
  const json = (await response.json()) as { messages?: Array<{ id: string }> };
  const outboundId = json.messages?.[0]?.id;
  if (!outboundId) throw new Error("WhatsApp send response contained no message id");
  return outboundId;
}

/** Sends a tappable slot-picker list. Session message — 24h window only, same as text. */
export async function sendWhatsAppSlotList(params: {
  phoneNumberId: string;
  to: string;
  bodyText: string;
  slots: SchedulingSlot[];
}): Promise<string> {
  return postToMeta(
    params.phoneNumberId,
    buildSlotListPayload({ to: params.to, bodyText: params.bodyText, slots: params.slots }),
  );
}

/** Sends up to 3 reply buttons. Session message — 24h window only, same as text. */
export async function sendWhatsAppButtons(params: {
  phoneNumberId: string;
  to: string;
  bodyText: string;
  buttons: ButtonSpec[];
}): Promise<string> {
  return postToMeta(
    params.phoneNumberId,
    buildButtonsPayload({ to: params.to, bodyText: params.bodyText, buttons: params.buttons }),
  );
}
