import type { ButtonSpec, ListSection } from "@/lib/decision-engine/types";
import type { SchedulingSlot } from "@/lib/scheduling/types";

const GRAPH_API_VERSION = "v20.0";

// Meta Cloud API hard limits — PATIENT_EXPERIENCE.md §2. Enforced here in
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

const LIST_ROW_DESCRIPTION_MAX = 72;

/**
 * Generic list-message builder — the single place Meta list limits are
 * enforced for EVERY list screen (main menu, doctor selection, slot picker).
 * Pure; exported for limit-enforcement unit tests.
 */
export function buildListMessagePayload(params: {
  to: string;
  bodyText: string;
  buttonLabel: string;
  sections: ListSection[];
}): Record<string, unknown> {
  const totalRows = params.sections.reduce((n, s) => n + s.rows.length, 0);
  if (totalRows === 0 || totalRows > MAX_LIST_ROWS) {
    throw new Error(`List message requires 1-${MAX_LIST_ROWS} rows, got ${totalRows}`);
  }
  return {
    messaging_product: "whatsapp",
    to: params.to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: truncate(params.bodyText, BODY_MAX) },
      action: {
        button: truncate(params.buttonLabel, LIST_BUTTON_LABEL_MAX),
        sections: params.sections.map((section) => ({
          title: truncate(section.title, LIST_ROW_TITLE_MAX),
          rows: section.rows.map((row) => ({
            id: row.id,
            title: truncate(row.title, LIST_ROW_TITLE_MAX),
            ...(row.description ? { description: truncate(row.description, LIST_ROW_DESCRIPTION_MAX) } : {}),
          })),
        })),
      },
    },
  };
}

/** Pure payload builder for the slot picker — exported for limit-enforcement unit tests. */
export function buildSlotListPayload(params: {
  to: string;
  bodyText: string;
  slots: SchedulingSlot[];
}): Record<string, unknown> {
  return buildListMessagePayload({
    to: params.to,
    bodyText: params.bodyText,
    buttonLabel: "Pick a time",
    sections: [
      {
        title: "Open times",
        // The row id IS the slot id — the webhook hands it back verbatim in
        // interactive.list_reply.id, giving a deterministic tap→slot binding
        // with no model echo involved.
        rows: params.slots.map((slot) => ({ id: slot.id, title: slot.label })),
      },
    ],
  });
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

/** Sends a generic list message (main menu, doctor selection, …). Session message — 24h window only. */
export async function sendWhatsAppListMessage(params: {
  phoneNumberId: string;
  to: string;
  bodyText: string;
  buttonLabel: string;
  sections: ListSection[];
}): Promise<string> {
  return postToMeta(
    params.phoneNumberId,
    buildListMessagePayload({
      to: params.to,
      bodyText: params.bodyText,
      buttonLabel: params.buttonLabel,
      sections: params.sections,
    }),
  );
}
