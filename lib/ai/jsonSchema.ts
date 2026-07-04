import { HANDOFF_REASONS, INTENTS } from "@/lib/types";

// Hand-written JSON Schema for OpenAI Structured Outputs, mirroring
// aiOutputSchema in /lib/types.ts and the OUTPUT FORMAT contract in
// /docs/SYSTEM_PROMPT.md. Structured Outputs strict mode requires every
// property to be listed in "required" and forbids extra properties, so
// optional fields are modelled as nullable rather than omitted.
//
// Nullable fields use `anyOf: [<type>, {type:"null"}]` rather than OpenAI's
// documented `"type": ["string", "null"]` array shorthand — verified against
// the aicredits.in proxy, whose schema validator rejects the array form
// ("cannot unmarshal array into ... jsonschema.DataType") but accepts anyOf.
// anyOf is valid per direct OpenAI too, so this works for both providers.

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;

const collectedSlotsJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: nullableString,
    age: nullableString,
    gender: nullableString,
    duration: nullableString,
    previous_treatment: nullableString,
    current_medications: nullableString,
    affected_area: nullableString,
    preferred_time: nullableString,
    preferred_date: nullableString,
    preferred_doctor: nullableString,
    reason: nullableString,
    concern: nullableString,
  },
  required: [
    "name",
    "age",
    "gender",
    "duration",
    "previous_treatment",
    "current_medications",
    "affected_area",
    "preferred_time",
    "preferred_date",
    "preferred_doctor",
    "reason",
    "concern",
  ],
} as const;

const appointmentRequestJsonSchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        preferred_doctor: nullableString,
        preferred_date: { type: "string" },
        preferred_time: { type: "string" },
        reason: { type: "string" },
      },
      required: [
        "name",
        "preferred_doctor",
        "preferred_date",
        "preferred_time",
        "reason",
      ],
    },
    { type: "null" },
  ],
} as const;

const bookingSelectionJsonSchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        reason: { type: "string" },
        selected_slot_id: { type: "string" },
      },
      required: ["name", "reason", "selected_slot_id"],
    },
    { type: "null" },
  ],
} as const;

export const AI_OUTPUT_JSON_SCHEMA = {
  name: "medixum_receptionist_reply",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: { type: "string" },
      intent: { type: "string", enum: [...INTENTS] },
      collected: collectedSlotsJsonSchema,
      appointment_request: appointmentRequestJsonSchema,
      booking_selection: bookingSelectionJsonSchema,
      presenting_slots: { type: "boolean" },
      human_handoff: { type: "boolean" },
      handoff_reason: {
        anyOf: [{ type: "string", enum: [...HANDOFF_REASONS] }, { type: "null" }],
      },
    },
    required: [
      "reply",
      "intent",
      "collected",
      "appointment_request",
      "booking_selection",
      "presenting_slots",
      "human_handoff",
      "handoff_reason",
    ],
  },
} as const;
