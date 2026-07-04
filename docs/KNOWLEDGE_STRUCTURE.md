# KNOWLEDGE_STRUCTURE.md — Clinic Knowledge Structure

The core multi-tenant principle: **every clinic has its own data without changing code.**
Onboarding a clinic = adding rows/records, never editing the prompt or the application.

This document defines what a clinic's knowledge is, how it's stored, and how it becomes the
`{{CLINIC_KNOWLEDGE_BLOCK}}` injected into the system prompt (`SYSTEM_PROMPT.md`).

---

## 1. What a clinic's knowledge contains

1. **Clinic profile** — name, city, address, Google Maps link, timings, parking, languages.
2. **Doctors** — names and roles (as the receptionist may reference them).
3. **Services** — the treatments this clinic offers (subset of the master list) with a
   high-level, non-clinical description each.
4. **Fees & policies** — consultation fee, payment methods, follow-up policy, cancellation
   and rescheduling policy, whether auto-confirmation of appointments is enabled.
5. **FAQs** — structured per `FAQ_SCHEMA.json`.

All of it is clinic-specific config. None of it lives in code.

---

## 2. Storage model (Supabase / Postgres)

Knowledge is stored relationally and assembled at request time. Suggested tables (align with
existing CGE `clinics` table; add the rest):

```
clinics
  id (uuid, pk)
  name
  city
  address
  maps_url
  timings              -- e.g. "Mon-Sat 10:00-20:00; Sun closed"
  parking_info
  languages            -- ["en"] for MVP
  consultation_fee     -- numeric
  payment_methods      -- ["cash","upi","card"]
  follow_up_policy
  cancellation_policy
  rescheduling_policy
  auto_confirm_enabled -- boolean, default false
  knowledge_version    -- integer, bumped on any change (cache key)
  created_at, updated_at

clinic_doctors
  id (uuid, pk)
  clinic_id (fk)
  name
  role                 -- e.g. "Consultant Dermatologist"
  is_active

clinic_services
  id (uuid, pk)
  clinic_id (fk)
  service_key          -- e.g. "acne", "laser", "hydrafacial" (from master list)
  display_name
  high_level_info      -- non-clinical description the receptionist may use
  is_active

clinic_faqs
  id (uuid, pk)
  clinic_id (fk)
  faq_id               -- e.g. "consultation_fee" (per FAQ_SCHEMA.json)
  category
  question
  answer
  keywords (text[])
  requires_staff (boolean)
```

A clinic's `knowledge_version` is the cache key: bump it on any edit so the injected block
(and its cached prompt prefix) refreshes.

---

## 3. Master service list (reference)

Clinics select their offered services from this master list. Each maps to an intent in
`INTENTS.md`:

`acne`, `acne_scars`, `pigmentation`, `melasma`, `hair_fall`, `prp`, `gfc`,
`hair_transplant`, `laser_hair_reduction`, `anti_aging`, `botox`, `fillers`,
`skin_rejuvenation`, `chemical_peel`, `hydrafacial`, `wart_removal`, `mole_removal`,
`nail_disorders`, `eczema`, `psoriasis`, `vitiligo`, `fungal_infections`.

A clinic only exposes the services it actually provides; the receptionist won't offer a
service the clinic hasn't enabled.

---

## 4. How the knowledge block is assembled

At request time, the knowledge loader (`/lib/knowledge`) reads the clinic's records and
renders a compact, readable block. Rendered example:

```
CLINIC KNOWLEDGE
Clinic: Glow Skin Clinic (Madurai)
Address: 1st Floor, Anna Nagar Main Road, Madurai
Maps: https://maps.google.com/...
Timings: Monday to Saturday, 10 AM to 8 PM. Closed Sunday.
Parking: Two-wheeler and car parking in front of the clinic.
Languages: English.
Consultation fee: ₹500.
Payment methods: cash, UPI, card.
Follow-up policy: Follow-up within 7 days is complimentary.
Cancellation: Inform us and staff will cancel.
Rescheduling: Share new preferred day/time; staff will update.
Auto-confirm appointments: NO (record requests; staff confirm).

Doctors:
- Dr. Meera — Consultant Dermatologist

Services offered (high-level only):
- Acne — treatments to improve acne; consultation required.
- Pigmentation — treatments to improve uneven skin tone; consultation required.
- Laser hair reduction — reduces unwanted hair over sessions; consultation required.
- HydraFacial — hydrating facial treatment; consultation required.

FAQs:
- Consultation fee: Our consultation fee is ₹500.
- Timings: Open Mon-Sat, 10 AM to 8 PM; closed Sunday.
- Insurance: Mostly self-pay; staff assist with specific queries. [defer to staff]
...
```

Rules for the renderer:
- Keep it compact and factual — it's injected on every message (cached).
- Mark `requires_staff` FAQs clearly so the model defers.
- Never include anything the receptionist isn't allowed to say (no clinical detail).

---

## 5. Onboarding a new clinic (no-code)

1. Create the `clinics` row (profile, fee, timings, policies, `auto_confirm_enabled`).
2. Add `clinic_doctors`.
3. Select `clinic_services` from the master list, with high-level descriptions.
4. Add `clinic_faqs` (start from a default template, edit per clinic).
5. Set `knowledge_version = 1`.
6. Point the clinic's WhatsApp number → the shared webhook; the loader resolves the clinic
   by the WhatsApp phone-number id.

No prompt edits. No deploys. A clinic is live once its records exist and its number is mapped.

---

## 6. Clinic resolution (which clinic is this message for?)

Inbound webhook payloads include the business phone-number id that received the message.
Maintain a mapping:

```
clinic_whatsapp_numbers
  id (uuid, pk)
  clinic_id (fk)
  phone_number_id      -- Meta WhatsApp phone number id
  display_number
```

The pipeline looks up `phone_number_id` → `clinic_id`, loads that clinic's knowledge, and
builds the prompt. This is what makes one deployment serve many clinics.

---

## 7. Versioning & caching

- `knowledge_version` bumps on any edit to profile, doctors, services, or FAQs.
- The prompt cache key includes `clinic_id` + `knowledge_version`, so edits invalidate the
  cached prefix cleanly and the next message uses fresh knowledge.
