// Shared domain types. The AI output parser (/lib/ai) and the DB layer
// (/lib/supabase) agree on this single schema — see CLAUDE.md §6.
import { z } from "zod";

// Mirrors /docs/INTENTS.md
export const INTENTS = [
  "book_appointment",
  "reschedule",
  "cancel",
  "consultation_fee",
  "clinic_timings",
  "location",
  "parking",
  "insurance",
  "doctors",
  "payment_methods",
  "follow_up_policy",
  "acne",
  "hair_fall",
  "pigmentation",
  "laser",
  "botox",
  "chemical_peel",
  "hydrafacial",
  "general_treatment_enquiry",
  "greeting",
  "talk_to_human",
  "complaint",
  "billing_issue",
  "refund",
  "emergency",
  "medical_advice",
  "unknown",
  "out_of_scope",
] as const;
export type Intent = (typeof INTENTS)[number];

// Mirrors /docs/INTENTS.md "Handoff reason codes"
export const HANDOFF_REASONS = [
  "medical_advice",
  "complaint",
  "billing_issue",
  "refund",
  "emergency",
  "legal",
  "unknown",
  "explicit_request",
] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

// Safety precedence order per /docs/INTENTS.md §"Notes on intent precedence"
export const SAFETY_INTENT_PRECEDENCE: readonly Intent[] = [
  "emergency",
  "medical_advice",
  "complaint",
  "billing_issue",
  "refund",
];

export const conversationStages = [
  "greeting",
  "qualifying",
  "booking",
  "faq",
  "followup",
  "handoff",
  "closed",
] as const;
export type ConversationStage = (typeof conversationStages)[number];

export const appointmentRequestStatuses = [
  "requested",
  "confirmed",
  "cancelled",
  "rescheduled",
] as const;
export type AppointmentRequestStatus = (typeof appointmentRequestStatuses)[number];

// Slots the model may capture across a conversation. All optional — collected
// incrementally over turns per /docs/AI_RECEPTIONIST_SPEC.md §6.
const nullableStringField = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => (v === null ? undefined : v));

// Note: no "mobile" slot — the patient's WhatsApp number is already known
// from the inbound webhook (see patients.wa_phone) and must never be asked for.
export const collectedSlotsSchema = z.object({
  name: nullableStringField,
  age: nullableStringField,
  gender: nullableStringField,
  duration: nullableStringField,
  previous_treatment: nullableStringField,
  current_medications: nullableStringField,
  affected_area: nullableStringField,
  preferred_time: nullableStringField,
  preferred_date: nullableStringField,
  preferred_doctor: nullableStringField,
  reason: nullableStringField,
  concern: nullableStringField,
});
export type CollectedSlots = z.infer<typeof collectedSlotsSchema>;

// Note: no "mobile" field here either — the pipeline fills it in from
// patients.wa_phone when persisting, never from the model.
export const appointmentRequestPayloadSchema = z.object({
  name: z.string(),
  preferred_doctor: z.string().nullable().optional(),
  preferred_date: z.string(),
  preferred_time: z.string(),
  reason: z.string(),
});
export type AppointmentRequestPayload = z.infer<typeof appointmentRequestPayloadSchema>;

// Populated only when a <available_slots> block was offered this turn (see
// lib/scheduling/renderSlotsBlock.ts) and the patient picked one. Mutually
// exclusive with appointment_request in practice — a turn either offers real
// calendar slots or falls back to the legacy free-text flow, never both.
export const bookingSelectionSchema = z.object({
  name: z.string(),
  reason: z.string(),
  /** Must be one of the ids given in <available_slots> — never invented. */
  selected_slot_id: z.string(),
});
export type BookingSelection = z.infer<typeof bookingSelectionSchema>;

// The exact JSON output contract from /docs/SYSTEM_PROMPT.md "OUTPUT FORMAT".
export const aiOutputSchema = z.object({
  reply: z.string().min(1),
  intent: z.enum(INTENTS),
  collected: collectedSlotsSchema.default({}),
  appointment_request: appointmentRequestPayloadSchema.nullable(),
  booking_selection: bookingSelectionSchema.nullable(),
  // True whenever `reply` is presenting the patient a list of available
  // times. The model has, in production, fabricated an entire fake slot
  // list (including a past time and a day the clinic is closed) rather than
  // faithfully relaying <available_slots> — this flag lets the pipeline
  // discard whatever list the model wrote and always render the real one
  // from actual data instead. See /docs/GOOGLE_CALENDAR_INTEGRATION.md §6.
  presenting_slots: z.boolean(),
  human_handoff: z.boolean(),
  handoff_reason: z.enum(HANDOFF_REASONS).nullable(),
});
export type AiOutput = z.infer<typeof aiOutputSchema>;
