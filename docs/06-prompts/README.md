# 06-prompts — Prompt Asset Registry

> Owns the registry and change process for every prompt asset. Design philosophy:
> `../03-engineering/PROMPT_ENGINEERING.md`. Documented prompt:
> `../03-engineering/SYSTEM_PROMPT.md`.

## Registry

| Asset | Source of truth | Documented at | Used by |
|---|---|---|---|
| Receptionist system prompt (static block) | `prompts/system_prompt.md` | `../03-engineering/SYSTEM_PROMPT.md` | `lib/ai/promptBuilder.ts` |
| Clinic knowledge block (rendered) | DB records via `lib/knowledge/loader.ts` | `../03-engineering/KNOWLEDGE_STRUCTURE.md` §4 | prompt layer 2 |
| `<patient_info>` block (rendered) | `conversations.collected_slots` via `renderCollectedInfoBlock` | `../03-engineering/SYSTEM_PROMPT.md` (injected variables) | prompt layer 3 |
| `<available_slots>` block (rendered) | `lib/scheduling/renderSlotsBlock.ts` | `../03-engineering/GOOGLE_CALENDAR_INTEGRATION.md` §5 | prompt layer 4 |
| AI output JSON schema | `lib/ai/jsonSchema.ts` (mirrors `lib/types.ts`) | `../03-engineering/PROMPT_ENGINEERING.md` §4 | Structured Outputs |

Future assets register here before first use: per-locale prompt variants (V2
Tamil/Tanglish), voice prompt adaptations (V3), template message copy (V2 — also
requires Meta approval tracking).

## Change process (binding)

1. Edit `prompts/system_prompt.md` (source of truth).
2. Mirror the change into `../03-engineering/SYSTEM_PROMPT.md` — same PR.
3. If the output contract changed: update `lib/types.ts` + `lib/ai/jsonSchema.ts` +
   parser — same PR (a prompt/parser mismatch is a production incident).
4. Run the regression conversation sample (staff-reviewed transcripts:
   FAQ / qualification / booking / handoff / ambiguity cases).
5. Add a `../09-changelog/CHANGELOG.md` entry.

## Rules

- No per-turn interpolation into the static block — it destroys prompt caching
  (~10× cost) silently. Per-turn content goes in layers 3–5 only.
- Prompt text never contains clinic-specific facts (multi-tenancy) or secrets.
- Every hard rule added to the prompt gets a code-level twin or an explicit note on why
  none is possible (`/CLAUDE.md` §6.3).
