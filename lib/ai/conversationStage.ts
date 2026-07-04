import type { AiOutput, ConversationStage, Intent } from "@/lib/types";

const QUALIFYING_INTENTS: readonly Intent[] = [
  "acne",
  "hair_fall",
  "pigmentation",
  "laser",
  "botox",
  "chemical_peel",
  "hydrafacial",
  "general_treatment_enquiry",
];

const FAQ_INTENTS: readonly Intent[] = [
  "consultation_fee",
  "clinic_timings",
  "location",
  "parking",
  "insurance",
  "doctors",
  "payment_methods",
  "follow_up_policy",
];

/** Derives the conversation's next stage from this turn's AI output. */
export function nextConversationStage(
  output: Pick<AiOutput, "intent" | "appointment_request" | "booking_selection" | "human_handoff">,
  currentStage: ConversationStage,
): ConversationStage {
  if (output.human_handoff) return "handoff";
  if (output.appointment_request || output.booking_selection || output.intent === "book_appointment") {
    return "booking";
  }
  if (output.intent === "greeting") return "greeting";
  if (QUALIFYING_INTENTS.includes(output.intent)) return "qualifying";
  if (FAQ_INTENTS.includes(output.intent)) return "faq";
  if (output.intent === "reschedule" || output.intent === "cancel") return "followup";
  return currentStage;
}
