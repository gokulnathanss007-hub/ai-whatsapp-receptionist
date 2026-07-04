-- Medixum AI WhatsApp Receptionist — Phase 1 schema
-- See /docs/PROJECT_ARCHITECTURE.md §3 and /docs/KNOWLEDGE_STRUCTURE.md §2 for the design.

create extension if not exists "pgcrypto";

-- ── Clinic profile ──────────────────────────────────────────────────────────

create table clinics (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  city                  text,
  address               text,
  maps_url              text,
  timings               text,
  parking_info          text,
  languages             text[] not null default '{en}',
  consultation_fee      numeric,
  payment_methods       text[] not null default '{}',
  follow_up_policy      text,
  cancellation_policy   text,
  rescheduling_policy   text,
  auto_confirm_enabled  boolean not null default false,
  knowledge_version     integer not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table clinic_whatsapp_numbers (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  phone_number_id   text not null unique,
  display_number    text,
  created_at        timestamptz not null default now()
);

create table clinic_doctors (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  name        text not null,
  role        text,
  is_active   boolean not null default true
);

create table clinic_services (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  service_key       text not null,
  display_name      text not null,
  high_level_info   text,
  is_active         boolean not null default true,
  unique (clinic_id, service_key)
);

create table clinic_faqs (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  faq_id          text not null,
  category        text not null check (category in (
                    'consultation_fee', 'clinic_timings', 'parking', 'insurance',
                    'location', 'doctors', 'treatments', 'payment_methods',
                    'follow_up_policy', 'appointment_cancellation', 'rescheduling', 'other'
                  )),
  question        text not null,
  answer          text not null,
  keywords        text[] not null default '{}',
  requires_staff  boolean not null default false,
  unique (clinic_id, faq_id)
);

-- ── Patients & conversations ────────────────────────────────────────────────

create table patients (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  wa_phone       text not null,
  name           text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  unique (clinic_id, wa_phone)
);

create table conversations (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  patient_id        uuid not null references patients(id) on delete cascade,
  stage             text not null default 'greeting' check (stage in (
                      'greeting', 'qualifying', 'booking', 'faq', 'followup', 'handoff', 'closed'
                    )),
  collected_slots   jsonb not null default '{}'::jsonb,
  human_handoff     boolean not null default false,
  handoff_reason    text check (handoff_reason in (
                      'medical_advice', 'complaint', 'billing_issue', 'refund',
                      'emergency', 'legal', 'unknown', 'explicit_request'
                    )),
  last_message_at   timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index conversations_clinic_patient_idx on conversations (clinic_id, patient_id);

create table messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  wa_message_id     text not null unique,
  direction         text not null check (direction in ('inbound', 'outbound')),
  body              text not null,
  intent            text,
  created_at        timestamptz not null default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at);

create table appointment_requests (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  patient_id        uuid not null references patients(id) on delete cascade,
  conversation_id   uuid not null references conversations(id) on delete cascade,
  name              text,
  mobile            text,
  preferred_doctor  text,
  preferred_date    text,
  preferred_time    text,
  reason            text,
  status            text not null default 'requested' check (status in (
                      'requested', 'confirmed', 'cancelled', 'rescheduled'
                    )),
  created_at        timestamptz not null default now()
);

create index appointment_requests_clinic_idx on appointment_requests (clinic_id, status);

-- ── Idempotency guard ───────────────────────────────────────────────────────

create table processed_events (
  wa_message_id  text primary key,
  processed_at   timestamptz not null default now()
);

-- ── Row-level security ──────────────────────────────────────────────────────
-- The app talks to Supabase via the service-role key from trusted server code
-- only (Trigger.dev tasks, the webhook route), which bypasses RLS by design.
-- RLS is enabled here as defense-in-depth for any future client-side or
-- dashboard access (Phase 2+), which must authenticate and scope to one clinic.

alter table clinics enable row level security;
alter table clinic_whatsapp_numbers enable row level security;
alter table clinic_doctors enable row level security;
alter table clinic_services enable row level security;
alter table clinic_faqs enable row level security;
alter table patients enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table appointment_requests enable row level security;
alter table processed_events enable row level security;

-- No policies are defined for anon/authenticated roles yet — every table is
-- deny-by-default until Phase 2 introduces a scoped clinic-dashboard role.
