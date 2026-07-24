import type { AiOutput, ConversationStage, Intent } from "@/lib/types";

const QUALIFYING_INTENTS: readonly Intent[] = [
  "admission_enquiry",
  "curriculum",
  "extracurriculars",
  "general_enquiry",
];

const FAQ_INTENTS: readonly Intent[] = [
  "fee_structure",
  "school_timings",
  "location",
  "parking",
  "transport",
  "holidays_events",
  "facilities",
  "certificates",
  "staff",
  "payment_methods",
  "follow_up_policy",
];

/** Derives the conversation's next stage from this turn's AI output. */
export function nextConversationStage(
  output: Pick<AiOutput, "intent" | "enquiry_request" | "booking_selection" | "human_handoff">,
  currentStage: ConversationStage,
): ConversationStage {
  if (output.human_handoff) return "handoff";
  if (output.enquiry_request || output.booking_selection || output.intent === "book_visit") {
    return "booking";
  }
  // "booking" is sticky once entered: intent classification is unreliable
  // turn-to-turn — a reply that mentions a fee or school hours in passing
  // while still mid-booking can get misclassified as fee_structure or
  // school_timings, which would otherwise kick the conversation out of the
  // booking flow (and stop offering calendar slots) even though nothing
  // about the actual conversation changed. Only an explicit reschedule/
  // cancel or a fresh greeting should exit it.
  if (currentStage === "booking") {
    if (output.intent === "reschedule" || output.intent === "cancel") return "followup";
    if (output.intent === "greeting") return "greeting";
    return "booking";
  }
  if (output.intent === "greeting") return "greeting";
  if (QUALIFYING_INTENTS.includes(output.intent)) return "qualifying";
  if (FAQ_INTENTS.includes(output.intent)) return "faq";
  if (output.intent === "reschedule" || output.intent === "cancel") return "followup";
  return currentStage;
}
