import { readFileSync } from "node:fs";
import path from "node:path";
import type { MessageRow } from "@/lib/supabase/types";
import type { CollectedSlots } from "@/lib/types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const MAX_HISTORY_TURNS = 12;

let cachedTemplate: string | null = null;

function loadStaticTemplate(): string {
  if (cachedTemplate) return cachedTemplate;
  const templatePath = path.join(process.cwd(), "prompts", "system_prompt.md");
  cachedTemplate = readFileSync(templatePath, "utf-8");
  return cachedTemplate;
}

const COLLECTED_FIELD_LABELS: Record<keyof CollectedSlots, string> = {
  name: "Name",
  child_name: "Child's name",
  age: "Child's age",
  gender: "Gender",
  grade_applying_for: "Grade applying for",
  previous_school: "Previous school",
  preferred_time: "Preferred time",
  preferred_date: "Preferred date",
  reason: "Reason for enquiry",
  enquiry_details: "Enquiry details",
};

/**
 * Renders what's already been captured about this parent across the whole
 * conversation so far — persisted in conversations.collected_slots. Injected
 * as its own block so the model never has to re-derive it from raw history
 * text, and so already-known facts survive even once the message history
 * window (last 12 turns) has scrolled past where they were first mentioned.
 */
export function renderCollectedInfoBlock(collected: CollectedSlots): string {
  const lines = (Object.keys(COLLECTED_FIELD_LABELS) as Array<keyof CollectedSlots>)
    .filter((key) => {
      const value = collected[key];
      return value !== undefined && value !== null && value !== "";
    })
    .map((key) => `- ${COLLECTED_FIELD_LABELS[key]}: ${collected[key]}`);

  return lines.length > 0
    ? lines.join("\n")
    : "Nothing collected yet — this is a new parent in this conversation.";
}

/**
 * Builds the system message: static behavioural template + school knowledge,
 * in that order, so the stable prefix stays first for OpenAI's automatic
 * prompt caching (see /docs/03-engineering/SYSTEM_PROMPT.md "Caching note").
 * <parent_info> and the optional <available_slots> block both vary per-turn,
 * so they're appended after the cached prefix rather than folded into it.
 */
export function buildSystemMessage(
  schoolName: string,
  knowledgeBlock: string,
  collectedInfoBlock: string,
  availableSlotsBlock?: string,
): ChatMessage {
  const staticBlock = loadStaticTemplate().replaceAll("{{SCHOOL_NAME}}", schoolName);
  const slotsSection = availableSlotsBlock
    ? `\n\n<available_slots>\n${availableSlotsBlock}\n</available_slots>`
    : "";
  return {
    role: "system",
    content: `<static>\n${staticBlock}\n</static>\n\n<school_knowledge>\n${knowledgeBlock}\n</school_knowledge>\n\n<parent_info>\n${collectedInfoBlock}\n</parent_info>${slotsSection}`,
  };
}

/** Converts persisted message rows into chat turns, trimmed to the last N. */
export function buildHistoryMessages(history: MessageRow[]): ChatMessage[] {
  return history.slice(-MAX_HISTORY_TURNS).map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.body,
  }));
}

export function buildMessages(params: {
  schoolName: string;
  knowledgeBlock: string;
  collectedInfoBlock: string;
  availableSlotsBlock?: string;
  history: MessageRow[];
  newMessage: string;
}): ChatMessage[] {
  return [
    buildSystemMessage(
      params.schoolName,
      params.knowledgeBlock,
      params.collectedInfoBlock,
      params.availableSlotsBlock,
    ),
    ...buildHistoryMessages(params.history),
    { role: "user", content: params.newMessage },
  ];
}
