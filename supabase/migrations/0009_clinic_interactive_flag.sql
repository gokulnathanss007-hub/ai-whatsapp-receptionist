-- Medixum AI — Interactive WhatsApp Experience (V2 phase 1)
-- Per-clinic rollout flag per /docs/03-engineering/INTERACTIVE_WHATSAPP.md §7:
-- interactive rendering (slot list pickers, reply buttons) ships behind this
-- flag so text-only clinics are untouched (additive evolution, CLAUDE.md).

alter table clinics
  add column interactive_enabled boolean not null default false;
