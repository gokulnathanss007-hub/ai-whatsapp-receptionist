import type { AiOutput, HandoffReason } from "@/lib/types";

// Independent, deterministic backstop for the model's own handoff judgement —
// see /docs/03-engineering/AI_RECEPTIONIST_SPEC.md §12 "Fail Closed" and
// /docs/03-engineering/PROJECT_ARCHITECTURE.md §5 step 5. Never rely on the
// model alone for safety-critical routing (CLAUDE.md §5.3). Keyword lists are
// a best-effort net, not exhaustive NLU — they only ever add a handoff, never
// remove one.

const SAFETY_PATTERNS: Array<{ reason: HandoffReason; pattern: RegExp }> = [
  {
    reason: "urgent_safety_concern",
    pattern:
      /\b(emergency|severe pain|can'?t breathe|bleeding heavily|allergic reaction|anaphyla|passed out|unconscious|child is missing|can'?t find my child)\b/i,
  },
  {
    reason: "sensitive_matter",
    pattern:
      /\b(custody|bullying|being bullied|harass|abuse|expelled|suspension|suspended|legal guardian|restraining order|court order)\b/i,
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

// Matches SAFETY_PATTERNS order, which follows /docs/02-product/INTENTS.md
// precedence: urgent_safety_concern > sensitive_matter > complaint >
// billing_issue > refund.

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
