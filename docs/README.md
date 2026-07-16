# Medixum AI — Documentation Index

> Documentation architecture v2 (Clinic Growth System era). Engineering constitution:
> [`/CLAUDE.md`](../CLAUDE.md) — read it first if you're writing code.
> Change log: [`09-changelog/CHANGELOG.md`](09-changelog/CHANGELOG.md).

## Structure

### 01-company — founders (business strategy; never engineering input)
| Doc | Owns |
|---|---|
| [BUSINESS.md](01-company/BUSINESS.md) | Business master doc: UVP, competitive advantage, GTM, sales, CS, marketing |
| [COMPANY_VISION.md](01-company/COMPANY_VISION.md) | Vision, mission, values, platform arc |
| [ICP.md](01-company/ICP.md) | Ideal customer profile + expansion ICPs |
| [PRICING.md](01-company/PRICING.md) | All pricing (⚠️ PROPOSED — founder approval pending) |
| [REVENUE_MODEL.md](01-company/REVENUE_MODEL.md) | Business model, unit economics |
| [GOALS.md](01-company/GOALS.md) | 2y/5y goals, MRR targets, KPI definitions |

### 02-product — what we build and how it behaves
| Doc | Owns |
|---|---|
| [PRODUCT.md](02-product/PRODUCT.md) | **Product bible** — problem, vision, features by version, personas, principles, flows |
| [PRODUCT_ROADMAP.md](02-product/PRODUCT_ROADMAP.md) | V1 Receptionist → V2 Growth System → V3 Voice → V4 Platform (+ preserved V1 phase plan) |
| [USER_JOURNEY.md](02-product/USER_JOURNEY.md) | Patient & clinic journeys |
| [FEATURES.md](02-product/FEATURES.md) | Feature catalog with status |
| [CONVERSATION_FLOWS.md](02-product/CONVERSATION_FLOWS.md) | Every conversation flow, incl. calendar booking |
| [INTENTS.md](02-product/INTENTS.md) | Supported intents, slots, handoff reason codes |
| [UI_FLOWS.md](02-product/UI_FLOWS.md) | Thread / interactive / voice / dashboard surfaces |
| [ACCEPTANCE_CRITERIA.md](02-product/ACCEPTANCE_CRITERIA.md) | Definition of Done + per-version shipping bars |
| [PRODUCT_REQUIREMENTS.md](02-product/PRODUCT_REQUIREMENTS.md) | Historical V1 PRD (preserved) |

### 03-engineering — how it's built
| Doc | Owns |
|---|---|
| [CLAUDE.md](03-engineering/CLAUDE.md) | Pointer → root constitution |
| [PROJECT_ARCHITECTURE.md](03-engineering/PROJECT_ARCHITECTURE.md) | End-to-end backend architecture |
| [DECISION_ENGINE.md](03-engineering/DECISION_ENGINE.md) | AI returns actions; Node executes (v1 live, V2 target) |
| [PATIENT_EXPERIENCE.md](03-engineering/PATIENT_EXPERIENCE.md) | Patient Experience Layer: main menu, decision matrix, component library, resume strategy, rich media, branding, Meta limits |
| [AI_RECEPTIONIST_SPEC.md](03-engineering/AI_RECEPTIONIST_SPEC.md) | Behavioural contract (binds all channels) |
| [SYSTEM_PROMPT.md](03-engineering/SYSTEM_PROMPT.md) | Production prompt (mirror of `prompts/system_prompt.md`) |
| [PROMPT_ENGINEERING.md](03-engineering/PROMPT_ENGINEERING.md) | Prompt philosophy: caching, structured outputs, guardrails |
| [KNOWLEDGE_STRUCTURE.md](03-engineering/KNOWLEDGE_STRUCTURE.md) | Per-clinic knowledge model (no-code onboarding) |
| [GOOGLE_CALENDAR_INTEGRATION.md](03-engineering/GOOGLE_CALENDAR_INTEGRATION.md) | Scheduling design + implementation record |
| [CODING_STANDARDS.md](03-engineering/CODING_STANDARDS.md) | TypeScript, architecture, reliability standards |
| [SECURITY.md](03-engineering/SECURITY.md) | Threat model, secrets, tenancy, PII, OAuth |

### 04–09 — reference & operations
| Doc | Owns |
|---|---|
| [04-api/API_REFERENCE.md](04-api/API_REFERENCE.md) | Every HTTP route + API conventions |
| [05-database/DATABASE_SCHEMA.md](05-database/DATABASE_SCHEMA.md) | Schema map + migration register |
| [06-prompts/README.md](06-prompts/README.md) | Prompt asset registry + change process |
| [07-testing/TESTING_STRATEGY.md](07-testing/TESTING_STRATEGY.md) | Test layers, current suite, gates |
| [08-deployment/DEPLOYMENT.md](08-deployment/DEPLOYMENT.md) | Topology, env matrix, clinic onboarding runbook |
| [09-changelog/CHANGELOG.md](09-changelog/CHANGELOG.md) | Doc/prompt/contract/schema change history |

### Shared data files
- [FAQ_SCHEMA.json](FAQ_SCHEMA.json) — per-clinic FAQ JSON schema (unchanged location).

## Legacy paths

The original flat files (`docs/PROJECT_ARCHITECTURE.md`, `docs/INTENTS.md`, …) are
**redirect stubs** kept for backwards compatibility with older links and code comments.
Content lives only in the numbered tree — never edit a stub.

## Rules of this tree

1. **One source of truth per topic** — other docs link, never copy.
2. Docs update in the same PR as the change that invalidates them (`/CLAUDE.md` §2.9).
3. Contract/prompt/schema/KPI-definition changes get a changelog entry.
