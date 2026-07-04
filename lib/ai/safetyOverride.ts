import type { AiOutput, HandoffReason } from "@/lib/types";

// Independent, deterministic backstop for the model's own handoff judgement —
// see /docs/AI_RECEPTIONIST_SPEC.md §12 "Fail Closed" and
// /docs/PROJECT_ARCHITECTURE.md §5 step 5. Never rely on the model alone for
// safety-critical routing (CLAUDE.md §5.3). Keyword lists are a best-effort
// net, not exhaustive NLU — they only ever add a handoff, never remove one.

const SAFETY_PATTERNS: Array<{ reason: HandoffReason; pattern: RegExp }> = [
  {
    reason: "emergency",
    pattern:
      /\b(emergency|severe pain|can'?t breathe|bleeding heavily|allergic reaction|anaphyla|swelling (badly|a lot)|face is swelling|passed out|unconscious)\b/i,
  },
  {
    reason: "medical_advice",
    pattern:
      /\b(what medicine|which medicine|is this cancer|is this serious|diagnos|prescri|what'?s wrong with my (skin|hair|face)|dosage|is it dangerous)\b/i,
  },
  {
    reason: "complaint",
    pattern: /\b(complaint|not happy|unhappy|bad experience|terrible service|disappointed)\b/i,
  },
  {
    reason: "billing_issue",
    pattern: /\b(wrong bill|overcharged|billing (issue|problem|mistake)|charged twice)\b/i,
  },
  {
    reason: "refund",
    pattern: /\b(refund|money back|reimburse)\b/i,
  },
];

// Matches SAFETY_PATTERNS order, which follows /docs/INTENTS.md precedence:
// emergency > medical_advice > complaint > billing_issue > refund.

export function detectSafetyOverride(userMessage: string): HandoffReason | null {
  for (const { reason, pattern } of SAFETY_PATTERNS) {
    if (pattern.test(userMessage)) return reason;
  }
  return null;
}

/** Forces human_handoff on if the message trips a deterministic safety signal the model missed. */
export function applySafetyOverride(userMessage: string, output: AiOutput): AiOutput {
  if (output.human_handoff) return output;

  const reason = detectSafetyOverride(userMessage);
  if (!reason) return output;

  return { ...output, human_handoff: true, handoff_reason: reason };
}
