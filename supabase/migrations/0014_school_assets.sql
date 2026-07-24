-- School asset registry (2026-07-23) — additive only. Backs the "send_pdf" /
-- "send_image" Decision Engine actions (lib/decision-engine/types.ts), which
-- were designed but never wired up (see the old fallback-to-text comment in
-- lib/whatsapp/channelAdapter.ts). Generic by design — one small table for
-- any per-school file (transport routes PDF today; a fee-structure brochure,
-- admission form, etc. later), not a transport-specific column.

create table school_assets (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  -- Stable key the app code references (e.g. "transport_bus_routes") —
  -- never a display label, never school-specific naming.
  asset_key   text not null,
  -- Publicly reachable HTTPS URL Meta can fetch when sending the document
  -- (WhatsApp Cloud API document messages support `link`, avoiding the need
  -- for a separate media-upload step). Hosted under this app's own /public
  -- directory for now (see /public/assets).
  file_url    text not null,
  filename    text not null,
  -- Optional message sent alongside the file; falls back to the matching
  -- school_faqs answer when not set (see trigger/replyPipeline.ts).
  caption     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, asset_key)
);

alter table school_assets enable row level security;
