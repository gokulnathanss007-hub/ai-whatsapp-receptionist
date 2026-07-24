# KNOWLEDGE_STRUCTURE.md — School Knowledge Structure

> Location: `docs/03-engineering/`. Related: `SYSTEM_PROMPT.md` (injection target),
> `../05-database/DATABASE_SCHEMA.md` (consolidated schema), `docs/FAQ_SCHEMA.json`
> (FAQ format), `/CLAUDE.md` §6 (multi-tenant rules).

The core multi-tenant principle: **every school has its own data without changing code.**
Onboarding a school = adding rows/records, never editing the prompt or the application.

This document defines what a school's knowledge is, how it's stored, and how it becomes the
`{{SCHOOL_KNOWLEDGE_BLOCK}}` injected into the system prompt (`SYSTEM_PROMPT.md`). The
canonical worked example throughout is Sunrise Public School (Madurai) — see
`supabase/seed/sunrise_public_school.sql`.

---

## 1. What a school's knowledge contains

1. **School profile** — name, city, address, Google Maps link, timings, parking,
   languages. `opening_hours` is the single structured source of truth for the school's
   real open/close times: the AI front office's stated "Timings" (`lib/knowledge/loader.ts`)
   and the actual bookable Google Calendar slots (`lib/scheduling/listAvailableSlots.ts`)
   both read this same field, so they can never drift out of sync — see
   `GOOGLE_CALENDAR_INTEGRATION.md` §3.
2. **Staff** — names and roles (as the front office may reference them, e.g. Principal,
   Admissions Officer). There is no per-staff-member booking — a school visit slot is a
   time only, never assigned to a specific staff member.
3. **Services** — the programs/grades this school offers (e.g. Kindergarten, Primary
   School) with a high-level, non-promissory description each.
4. **Policies** — payment methods, follow-up policy, cancellation and rescheduling
   policy, whether auto-confirmation of school visits is enabled. There is **no**
   single "consultation fee" field — schools have tiered, grade-dependent fee
   structures, so fee information lives only as a `school_faqs` row under category
   `fee_structure` (see §3).
5. **FAQs** — structured per `FAQ_SCHEMA.json`.

All of it is school-specific config. None of it lives in code.

---

## 2. Storage model (Supabase / Postgres)

Knowledge is stored relationally and assembled at request time. Actual schema
(`lib/supabase/types.ts`, `supabase/migrations/0012_rename_clinic_to_school.sql`):

```
schools
  id (uuid, pk)
  name
  city
  address
  maps_url
  timings              -- freeform display fallback, e.g. "Mon-Sat 9:00-16:00; Sun closed"
  opening_hours        -- jsonb, single source of truth: {"mon":[["09:00","16:00"]], ...}
  slot_duration_minutes -- int, default 30
  timezone             -- text, default "Asia/Kolkata"
  parking_info
  languages            -- ["en"] for MVP
  payment_methods      -- ["cash","upi","card","bank_transfer"]
  follow_up_policy
  cancellation_policy
  rescheduling_policy
  auto_confirm_enabled -- boolean, default false
  interactive_enabled  -- boolean, default false (V2 rollout flag)
  reception_phone      -- direct contact number for the handoff message, nullable
  knowledge_version    -- integer, bumped on any change (cache key)
  created_at, updated_at

school_staff
  id (uuid, pk)
  school_id (fk)
  name
  role                 -- e.g. "Principal", "Admissions Officer"
  is_active

school_services
  id (uuid, pk)
  school_id (fk)
  service_key          -- e.g. "kindergarten", "primary", "middle" (school-defined, no fixed master list)
  display_name
  high_level_info      -- non-promissory description the front office may use
  is_active

school_faqs
  id (uuid, pk)
  school_id (fk)
  faq_id               -- e.g. "fee_structure" (per FAQ_SCHEMA.json)
  category              -- admission_enquiry|fee_structure|school_timings|transport|
                          holidays_events|facilities|contact_office|certificates|
                          location|general|other
  question
  answer
  keywords (text[])
  requires_staff (boolean)
```

Note there is **no `consultation_fee` column** on `schools` — it was dropped in
`0012_rename_clinic_to_school.sql` because schools have tiered/complex fee structures,
not one consultation price. A school's `knowledge_version` is the cache key: bump it on
any edit so the injected block (and its cached prompt prefix) refreshes.

---

## 3. Service/program keys (reference, not a fixed master list)

Unlike a clinic's fixed treatment master list, a school's `school_services.service_key`
is freely defined per school — there is no code-enforced enum. The seed data
(`supabase/seed/sunrise_public_school.sql`) uses these common values as a starting
convention for new schools:

`kindergarten`, `primary` (Grades 1-5), `middle` (Grades 6-8), `high_school`
(Grades 9-10), `senior_secondary` (Grades 11-12, streams like Science/Commerce).

A school only exposes the programs/grades it actually offers; the front office won't
mention a grade the school hasn't enabled.

---

## 4. How the knowledge block is assembled

At request time, the knowledge loader (`lib/knowledge/loader.ts`
`renderSchoolKnowledgeBlock`) reads the school's records and renders a compact, readable
block. Actual rendered example (Sunrise Public School):

```
SCHOOL KNOWLEDGE
School: Sunrise Public School (Madurai)
Address: 45, College Road, Madurai
Maps: https://maps.google.com/?q=Sunrise+Public+School+Madurai
Timings: Monday to Saturday, 9 AM to 4 PM. Closed Sunday.
Parking: Visitor parking available inside the main gate.
Languages: English.
Payment methods: cash, upi, card, bank_transfer.
Follow-up policy: Our admissions office follows up within 2 working days of an enquiry.
Cancellation: Let us know and our office will cancel your scheduled visit.
Rescheduling: Share your preferred new day/time; our office will update it.
Auto-confirm visits: NO (record requests; office confirms).

Staff:
- Mrs. Kavitha Raman — Principal
- Mr. Arun Kumar — Admissions Officer

Programs offered (high-level only):
- Kindergarten — Play group through UKG; admission enquiries welcome year-round.
- Primary School (Grades 1-5) — CBSE-affiliated primary curriculum.
- Middle School (Grades 6-8) — CBSE-affiliated middle school curriculum.
- High School (Grades 9-10) — CBSE-affiliated high school curriculum, board exam preparation.
- Senior Secondary (Grades 11-12) — Science and Commerce streams available.

FAQs:
- How do I apply for admission?: Share your child's name, age, and the grade you are
  applying for, and our admissions office will guide you through the next steps.
- What is the fee structure?: Fees vary by grade. Our admissions office will share the
  exact fee structure for the grade you are enquiring about. [defer to staff]
- What are the school timings?: We are open Monday to Saturday, 9 AM to 4 PM. We are
  closed on Sundays.
...
```

Rules for the renderer:
- Keep it compact and factual — it's injected on every message (cached).
- Mark `requires_staff` FAQs clearly so the model defers.
- Never include anything the front office isn't allowed to say (no admission-outcome
  promises).

---

## 5. Onboarding a new school (no-code)

1. Create the `schools` row (profile, timings, policies, `opening_hours`,
   `auto_confirm_enabled`).
2. Add `school_staff` rows.
3. Add `school_services` rows for each program/grade offered, with high-level
   descriptions.
4. Add `school_faqs` (start from a default template, edit per school) — including a
   `fee_structure` category row, since there is no dedicated fee field on `schools`.
5. Set `knowledge_version = 1`.
6. Point the school's WhatsApp number → the shared webhook; the loader resolves the
   school by the WhatsApp phone-number id.

No prompt edits. No deploys. A school is live once its records exist and its number is
mapped.

---

## 6. School resolution (which school is this message for?)

Inbound webhook payloads include the business phone-number id that received the message.
Maintain a mapping:

```
school_whatsapp_numbers
  id (uuid, pk)
  school_id (fk)
  phone_number_id      -- Meta WhatsApp phone number id
  display_number
```

The pipeline looks up `phone_number_id` → `school_id`, loads that school's knowledge, and
builds the prompt. This is what makes one deployment serve many schools.

---

## 7. Versioning & caching

- `knowledge_version` bumps on any edit to profile, staff, services, or FAQs.
- The prompt cache key includes `school_id` + `knowledge_version` (`knowledgeCacheKey()`
  in `lib/knowledge/loader.ts`), so edits invalidate the cached prefix cleanly and the
  next message uses fresh knowledge.
