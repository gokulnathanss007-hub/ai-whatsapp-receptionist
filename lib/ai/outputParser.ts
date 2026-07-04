import { aiOutputSchema, type AiOutput } from "@/lib/types";

export class AiOutputParseError extends Error {
  constructor(reason: string, readonly raw: string) {
    super(`AI output failed to parse: ${reason}`);
    this.name = "AiOutputParseError";
  }
}

/**
 * Strictly parses the model's JSON output against the contract in
 * /docs/SYSTEM_PROMPT.md "OUTPUT FORMAT". Throws AiOutputParseError on any
 * malformed output — callers must fail closed (handoff) rather than guess.
 */
export function parseAiOutput(raw: string): AiOutput {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AiOutputParseError("not valid JSON", raw);
  }

  const result = aiOutputSchema.safeParse(json);
  if (!result.success) {
    throw new AiOutputParseError(result.error.message, raw);
  }
  return result.data;
}
