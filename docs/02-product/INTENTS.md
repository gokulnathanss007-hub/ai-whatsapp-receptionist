# INTENTS.md — Supported User Intents

> Location: `docs/02-product/`. Source of truth: `lib/types.ts` (`INTENTS`,
> `HANDOFF_REASONS`, `SAFETY_INTENT_PRECEDENCE`). Related: `CONVERSATION_FLOWS.md`,
> `../03-engineering/AI_RECEPTIONIST_SPEC.md`, `../03-engineering/DECISION_ENGINE.md`
> (how intents map to executable actions).

Every inbound message is mapped to a primary intent. The model returns the intent; the
backend uses it for routing, slot collection, and analytics. Intents are grouped by
purpose. The list below mirrors `lib/types.ts` exactly, in declaration order.

Columns: **Intent** · **Description** · **Example utterances** · **Required slots** ·
**Action**

---

## Booking & scheduling

### `book_visit`
- **Description:** Parent wants to book a school visit / admission counseling session.
- **Examples:** "I want to visit the school", "can we come see the campus", "book a
  meeting with the admissions office"
- **Slots:** name, child_name, grade_applying_for, preferred_date, preferred_time,
  reason (mobile is never asked — the parent's WhatsApp number is attached
  automatically)
- **Action:** Run visit-qualification → calendar path (real slots) if the school has
  Google Calendar connected + `auto_confirm_enabled`, else record an `admission_enquiry`
  → "recorded, our office will confirm."

### `reschedule`
- **Description:** Change an existing school visit.
- **Examples:** "change my visit time", "can we come Friday instead"
- **Slots:** name (to identify; WhatsApp number already known), preferred_date,
  preferred_time
- **Action:** Capture reschedule request → flag for staff.

### `cancel`
- **Description:** Cancel a school visit.
- **Examples:** "cancel our visit", "we can't come tomorrow"
- **Slots:** name (to identify; WhatsApp number already known)
- **Action:** Capture cancellation request → flag for staff.

---

## Admissions & FAQ (answered from school knowledge)

### `admission_enquiry`
- **Description:** General question about how admissions work, or intent to start an
  enquiry.
- **Examples:** "how do I apply", "what's the admission process", "we want to enrol our
  daughter"
- **Slots:** name, child_name, age, gender, grade_applying_for, previous_school, reason
- **Action:** Answer from FAQ (`admission_enquiry` category), then transition into lead
  qualification (see `CONVERSATION_FLOWS.md` §4).

### `fee_structure`
- **Examples:** "what are the fees", "fee structure for grade 5?"
- **Action:** Answer from FAQ (`fee_structure` category — schools have tiered,
  grade-dependent fees, never a single quoted number the AI invents).

### `school_timings`
- **Examples:** "what time do you open", "are you open on Sunday"
- **Action:** Answer from FAQ (`school_timings` category).

### `transport`
- **Examples:** "do you have a school bus", "which routes do you cover"
- **Action:** Answer from FAQ (`transport` category).

### `holidays_events`
- **Examples:** "when is the next holiday", "is there a sports day"
- **Action:** Answer from FAQ (`holidays_events` category).

### `facilities`
- **Examples:** "do you have a playground", "is there a science lab"
- **Action:** Answer from FAQ (`facilities` category).

### `certificates`
- **Examples:** "how do I get a transfer certificate", "bonafide certificate process"
- **Action:** Answer from FAQ (`certificates` category); defer to staff if
  `requires_staff`.

### `location`
- **Examples:** "where are you", "send location", "address please"
- **Action:** Answer from FAQ (`location` category); share maps link if available.

### `parking`
- **Examples:** "is there parking for parents", "car parking available?"
- **Action:** Answer from FAQ if present, else defer.

### `staff`
- **Examples:** "who is the principal", "can I speak to the admissions officer"
- **Action:** Answer from school knowledge (staff names/roles); never a direct-dial
  bypass around the normal handoff flow.

### `payment_methods`
- **Examples:** "do you accept UPI", "can I pay fees by card"
- **Action:** Answer from FAQ.

### `follow_up_policy`
- **Examples:** "will someone follow up with us", "how soon will you get back to us"
- **Action:** Answer from FAQ / school profile `follow_up_policy`.

### `curriculum`
- **Examples:** "what board do you follow", "CBSE or state board?"
- **Action:** Answer from FAQ (`general` category, e.g. the curriculum FAQ).

### `extracurriculars`
- **Examples:** "do you have sports", "any music or art classes"
- **Action:** Answer from FAQ if present, else defer.

### `general_enquiry`
- **Description:** Any other in-context school question not covered by a more specific
  intent above.
- **Action:** Answer from school knowledge if present; otherwise "let me check with our
  school office."

---

## Control & routing

### `greeting`
- **Examples:** "hi", "hello", "good morning"
- **Action:** Greeting flow / Main Menu (`../03-engineering/PATIENT_EXPERIENCE.md` §3).

### `talk_to_human`
- **Examples:** "I want to talk to someone", "connect me to the school office", "can I
  speak to the Principal"
- **Action:** Immediate handoff.

### `complaint`
- **Examples:** "I'm not happy with how this was handled", "bad experience"
- **Action:** Empathise briefly → handoff.

### `billing_issue`
- **Examples:** "wrong amount charged", "I was overcharged for the fee"
- **Action:** Handoff.

### `refund`
- **Examples:** "I want a refund", "money back on the admission fee"
- **Action:** Handoff.

### `urgent_safety_concern`
- **Examples:** "my child hasn't come home from school", "there's an emergency at the
  school"
- **Action:** First gently urge the parent to contact the school office directly by
  phone for anything needing immediate attention, then hand off immediately. No
  safeguarding instructions from the AI.

### `sensitive_matter`
- **Description:** A sensitive or family-specific matter needing human judgement —
  custody, disciplinary issues, bullying, a child-safety concern.
- **Examples:** "my child is being bullied", "there's a custody issue with pickup",
  "I need to report an incident"
- **Action:** Decline to resolve it itself → handoff. **Never** attempt to advise.

### `unknown`
- **Description:** In-context but not in school knowledge, or unclear.
- **Action:** "Let me check with our school office" → flag for staff. Never fabricate.

### `out_of_scope`
- **Description:** Off-topic (politics, coding, general knowledge), or "are you AI".
- **Action:** Redirect to school context; never engage; never reveal AI nature.

---

## Handoff reason codes

When `human_handoff = true`, the backend records one of (`lib/types.ts`
`HANDOFF_REASONS`):
`sensitive_matter`, `complaint`, `billing_issue`, `refund`, `urgent_safety_concern`,
`legal`, `unknown`, `explicit_request`.

## Notes on intent precedence

Safety intents win (`lib/types.ts` `SAFETY_INTENT_PRECEDENCE`). If a message contains
both a booking phrase and a safety signal, classify as the safety intent
(`urgent_safety_concern` > `sensitive_matter` > `complaint` / `billing_issue` /
`refund` > everything else) and hand off.

## Collected slots (`lib/types.ts` `CollectedSlots`)

Fields the model may capture across a conversation, all optional, accumulated in
`conversations.collected_slots` and rendered back as `<parent_info>` every turn: `name`,
`child_name`, `age`, `gender`, `grade_applying_for`, `previous_school`,
`preferred_time`, `preferred_date`, `reason`, `enquiry_details`. There is no `mobile`
slot — the parent's WhatsApp number is already known from the inbound webhook
(`parents.wa_phone`) and must never be asked for.

## Admission enquiry payload (`lib/types.ts` `AdmissionEnquiryPayload`)

Populated (as `enquiry_request` in the AI output) only in the no-calendar fallback path,
once enough detail is gathered: `name`, `grade_applying_for` (optional), `preferred_date`,
`preferred_time`, `reason`.
