/* Reproduces the exact "Monday 10am" turn that failed closed to handoff in
 * production (run_cmr6kuenl6dyv0ioofmbuh2jc) — same clinic knowledge, same
 * slots block shape, same message — several times in a row, to distinguish
 * a deterministic failure (prompt/schema bug) from a flaky one (transient
 * API/proxy error that needs retries). Run: npx tsx scripts/reproReplyFailure.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

// Load .env.local BEFORE importing modules that read process.env at call time.
const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of raw.split(/\r?\n/)) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]!]) process.env[match[1]!] = match[2]!;
}

async function main() {
  const { buildMessages, renderCollectedInfoBlock } = await import("@/lib/ai/promptBuilder");
  const { generateReceptionistReply } = await import("@/lib/ai/openaiClient");
  const { parseAiOutput } = await import("@/lib/ai/outputParser");
  const { loadClinicKnowledge, renderClinicKnowledgeBlock } = await import("@/lib/knowledge/loader");
  const { renderAvailableSlotsBlock } = await import("@/lib/scheduling/renderSlotsBlock");

  const clinicId = "ff605796-fc70-42cb-b10d-ef67c5b5d092";
  const knowledge = await loadClinicKnowledge(clinicId);
  const knowledgeBlock = renderClinicKnowledgeBlock(knowledge);

  // Mirrors the failed run: exact match found for Monday 10:00 IST.
  const slotsBlock = renderAvailableSlotsBlock([
    {
      id: "MjAyNi0wNy0wNlQwNDozMDowMC4wMDBa",
      startsAt: "2026-07-06T04:30:00.000Z",
      endsAt: "2026-07-06T05:00:00.000Z",
      label: "Mon, Jul 6 – 10:00 AM",
    },
  ]);

  const messages = buildMessages({
    clinicName: knowledge.profile.name,
    knowledgeBlock,
    collectedInfoBlock: renderCollectedInfoBlock({}),
    availableSlotsBlock: slotsBlock,
    history: [
      { direction: "inbound", body: "Hii" },
      { direction: "outbound", body: "Hi there! Welcome back to Glow Skin Clinic. How can I help you today?" },
    ].map((m, i) => ({
      id: String(i),
      conversation_id: "x",
      wa_message_id: String(i),
      direction: m.direction as "inbound" | "outbound",
      body: m.body,
      intent: null,
      created_at: new Date().toISOString(),
    })),
    newMessage: "I want to book appointment for Monday 10am",
  });

  for (let attempt = 1; attempt <= 4; attempt++) {
    const t0 = Date.now();
    try {
      const rawReply = await generateReceptionistReply(messages);
      const parsed = parseAiOutput(rawReply);
      console.log(`attempt ${attempt}: OK in ${Date.now() - t0}ms`, {
        intent: parsed.intent,
        presenting_slots: parsed.presenting_slots,
        booking_selection: parsed.booking_selection,
        human_handoff: parsed.human_handoff,
        reply: parsed.reply.slice(0, 80),
      });
    } catch (err) {
      console.error(`attempt ${attempt}: FAILED in ${Date.now() - t0}ms`);
      console.error("  name:", (err as Error).name);
      console.error("  message:", (err as Error).message.slice(0, 600));
      const rawOut = (err as { raw?: string }).raw;
      if (rawOut) console.error("  raw model output:", rawOut.slice(0, 400));
    }
  }
}

main().catch((e) => { console.error("SCRIPT FAILED:", e); process.exit(1); });
