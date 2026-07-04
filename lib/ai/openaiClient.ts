import OpenAI from "openai";
import { AI_OUTPUT_JSON_SCHEMA } from "@/lib/ai/jsonSchema";
import type { ChatMessage } from "@/lib/ai/promptBuilder";

let cachedClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY must be set");
  cachedClient = new OpenAI({
    apiKey,
    // Unset for direct OpenAI; set to an OpenAI-compatible proxy otherwise
    // (e.g. aicredits.in — a stopgap while direct OpenAI billing isn't
    // available). Verified against aicredits.in: it honors both
    // reasoning_effort and strict json_schema Structured Outputs even
    // though its public docs only advertise json_object mode.
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  return cachedClient;
}

/**
 * Calls gpt-5-nano at minimal reasoning effort with Structured Outputs
 * enforcing the reply contract (see /lib/ai/jsonSchema.ts and
 * /docs/SYSTEM_PROMPT.md "Model" note). Returns the raw JSON string —
 * callers must still run it through parseAiOutput before trusting it.
 */
export async function generateReceptionistReply(messages: ChatMessage[]): Promise<string> {
  const model = process.env.OPENAI_MODEL || "gpt-5-nano";

  const response = await getOpenAiClient().chat.completions.create({
    model,
    messages,
    reasoning_effort: "minimal",
    response_format: {
      type: "json_schema",
      json_schema: AI_OUTPUT_JSON_SCHEMA,
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI response contained no content");
  return content;
}
