# PROMPT_ENGINEERING.md — Prompt Engineering Philosophy & Rules

> Owns *how and why* prompts are built. The production prompt itself: `SYSTEM_PROMPT.md`
> (documented) / `prompts/system_prompt.md` (source of truth). Behaviour it must encode:
> `AI_RECEPTIONIST_SPEC.md`. Output execution: `DECISION_ENGINE.md`. Summary rules:
> `/CLAUDE.md` §6.

---

## 1. Philosophy

The system prompt **is** the product's personality, and the prompt architecture **is**
the cost model. Three commitments follow:

1. **Prompts are engineered artifacts** — versioned, reviewed like code, changed with
   changelog entries, and validated against a staff-reviewed conversation sample.
2. **The prompt persuades; code enforces.** Every safety-critical instruction in the
   prompt has a deterministic code twin (`safetyOverride.ts`, output backstops). We
   write prompts as if the model will occasionally ignore them — because it will.
3. **Token order is a cost decision.** The prompt is laid out for OpenAI automatic
   prompt caching first, readability second.

## 2. Prompt anatomy (the layered stack)

Order is load-bearing — stable content first, volatile content last:

```
┌──────────────────────────────────────────────┐
│ 1. <static>  behavioural system prompt       │  identical for ALL clinics
│    role, tone, hard rules, flows, contract   │  ← cached
├──────────────────────────────────────────────┤
│ 2. <clinic_knowledge>  knowledge block       │  stable per clinic
│    profile, doctors, services, fees, FAQs    │  ← cached (key: clinic_id +
│    (KNOWLEDGE_STRUCTURE.md)                  │     knowledge_version)
├──────────────────────────────────────────────┤
│ 3. <patient_info>  durable collected state   │  varies per turn — NEVER in
│    every slot ever captured this convo       │  the cached prefix
├──────────────────────────────────────────────┤
│ 4. <available_slots>  real availability      │  only on booking turns for
│    (id + label per slot)                     │  auto-confirm clinics
├──────────────────────────────────────────────┤
│ 5. Conversation history (trimmed, last 12)   │  varies per turn
├──────────────────────────────────────────────┤
│ 6. New inbound patient message               │
└──────────────────────────────────────────────┘
```

### System Prompt (layer 1)
One static behavioural prompt for the whole fleet. Adding a clinic never edits it.
Identity ("you are the receptionist, not an AI"), tone laws, hard prohibitions,
qualification and booking flows, handoff rules, output contract. Kept identical across
clinics deliberately: the bigger the shared prefix, the better the cache economics.

### Knowledge Block (layer 2)
Clinic facts rendered compactly by `lib/knowledge/loader.ts` from records
(`KNOWLEDGE_STRUCTURE.md`). Rules: factual and compact (injected on every message);
`requires_staff` FAQs marked so the model defers; nothing the receptionist isn't
allowed to say. The model may only state facts present here — everything else is
"let me check with our clinic staff."

### Conversation History (layer 5)
Trimmed to the last 12 messages for cost and relevance. History is for *flow*, not
*facts* — durable facts live in `<patient_info>`.

### Dynamic Context (layers 3–4)
- `<patient_info>` — renders `conversations.collected_slots` in full, every turn. This
  is the actual fix for "never ask the same thing twice": raw history breaks once turns
  scroll past the trim window; this block is durable regardless of length.
- `<available_slots>` — real availability, injected only on booking-relevant turns.
  The model may only reference ids given **this turn** (lists refresh).
Both sit *after* the cached layers because they vary per turn.

## 3. Prompt caching

- OpenAI caching is **automatic** for prompts over ~1K tokens matching a previous
  prefix — no explicit breakpoints (unlike some providers). **Order is the mechanism.**
- Cached input tokens bill at ~10% of the input rate — the single highest-leverage cost
  lever in the system (`../01-company/REVENUE_MODEL.md` §2 depends on it).
- Invalidation: knowledge edits bump `knowledge_version` → new prefix → clean re-cache.
- Rule: never interpolate per-turn values into layers 1–2. A timestamp in the static
  block would silently destroy the cache and multiply cost ~10×.

## 4. Structured Outputs

- OpenAI Structured Outputs (JSON schema, `lib/ai/jsonSchema.ts`) guarantee the output
  contract shape; the schema mirrors `lib/types.ts` exactly — one contract, two encodings.
- The prompt *also* states the contract ("return a single JSON object and nothing
  else") — belt and suspenders.
- Parsing is strict (`lib/ai/outputParser.ts`): malformed/off-contract → fail closed to
  handoff, counted in metrics.
- Contract evolution is additive-only within a version (nullable new fields —
  `booking_selection` is the precedent). See `DECISION_ENGINE.md` for the V2 action
  contract.

## 5. Reasoning & temperature

- `gpt-5-nano` is a reasoning model; we run **low/minimal reasoning effort** — a
  receptionist answering "what's the fee?" doesn't need chain-of-thought, and latency
  is a product feature (seconds-to-first-reply).
- Sampling settings live in one place (`lib/ai/openaiClient.ts`). Keep effective
  randomness low: the receptionist should be *warm*, not *creative* — novelty is where
  invented fees come from. Any setting change requires re-running the staff-reviewed
  sample evaluation.
- If a future feature genuinely needs deeper reasoning (complex rescheduling
  negotiation), raise effort **per-call**, never globally.

## 6. Safety & guardrails (prompt-level view)

Defense in depth — four layers, each assuming the previous failed:

1. **Prompt prohibitions** — the nine HARD RULES (never diagnose/prescribe/promise/
   invent/leave context/reveal AI/ask for mobile…), phrased as identity, not policy
   ("you are the receptionist") because models hold identities better than rule lists.
2. **Structured Outputs** — the model physically can't return an unparseable shape.
3. **Code overrides** — `safetyOverride.ts` detects emergency/medical/complaint/
   billing/refund independently and forces handoff; mutual-exclusion backstops drop
   contradictory fields; slot-integrity checks reject unknown ids.
4. **Fail-closed default** — any error anywhere in generation → handoff message +
   staff flag (never an unreviewed guess).

Prompt-writing rules that fall out of the incident history (see
`GOOGLE_CALENDAR_INTEGRATION.md` implementation notes — every one of these earned its
place from a real observed failure):
- **State mutual exclusions explicitly** (the model once populated both
  `appointment_request` and `booking_selection`).
- **Forbid invented progress updates** ("just checking on that…") — enumerate the legal
  moves per state instead ("every reply must do exactly one of: present slots, select,
  or hand off").
- **Never let the model author facts the system owns** (times, availability,
  confirmations) — it writes lead-ins; the system attaches the data.
- **Positive instruction beats prohibition**: "ask ONE thing at a time" outperforms
  "don't ask multiple questions"; worked examples outperform both.

## 7. Change management for prompts

1. Source of truth: `prompts/system_prompt.md`. Mirror: `SYSTEM_PROMPT.md` (docs).
   Registry & versioning: `../06-prompts/README.md`.
2. Every change: PR-reviewed, mirrored, changelog entry
   (`../09-changelog/CHANGELOG.md`), and validated against the regression conversation
   sample (staff-reviewed transcripts covering FAQ/qualification/booking/handoff/
   ambiguity cases).
3. Prompt changes and code-contract changes that depend on each other ship in the same
   PR — a prompt referencing a field the parser doesn't know (or vice versa) is a
   production incident, not a docs bug.
