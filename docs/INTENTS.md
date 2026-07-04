# INTENTS.md — Supported User Intents

Every inbound message is mapped to a primary intent. The model returns the intent; the
backend uses it for routing, slot collection, and analytics. Intents are grouped by purpose.

Columns: **Intent** · **Description** · **Example utterances** · **Required slots** ·
**Action**

---

## Booking & scheduling

### `book_appointment`
- **Description:** Patient wants to book a consultation.
- **Examples:** "I want an appointment", "book a slot", "can I see the doctor tomorrow"
- **Slots:** name, preferred_doctor (optional), preferred_date, preferred_time, reason (mobile
  is never asked — the patient's WhatsApp number is attached automatically)
- **Action:** Run appointment capture → record `appointment_request` → "recorded, staff will confirm."

### `reschedule`
- **Description:** Change an existing appointment.
- **Examples:** "change my appointment", "can I come Friday instead"
- **Slots:** name (to identify; WhatsApp number already known), new_preferred_date, new_preferred_time
- **Action:** Capture reschedule request → flag for staff.

### `cancel`
- **Description:** Cancel an appointment.
- **Examples:** "cancel my appointment", "I can't come tomorrow"
- **Slots:** name (to identify; WhatsApp number already known)
- **Action:** Capture cancellation request → flag for staff.

---

## FAQ (answered from clinic knowledge)

### `consultation_fee`
- **Examples:** "what's the fee", "consultation charges?"
- **Action:** Answer from FAQ; offer to book.

### `clinic_timings`
- **Examples:** "what time do you open", "are you open on Sunday"
- **Action:** Answer from FAQ.

### `location`
- **Examples:** "where are you", "send location", "address please"
- **Action:** Answer from FAQ; share maps link if available.

### `parking`
- **Examples:** "is there parking", "car parking available?"
- **Action:** Answer from FAQ.

### `insurance`
- **Examples:** "do you take insurance", "mediclaim accepted?"
- **Action:** Answer from FAQ; defer to staff if `requires_staff`.

### `doctors`
- **Examples:** "who is the doctor", "is there a dermatologist"
- **Action:** Answer from FAQ.

### `payment_methods`
- **Examples:** "do you accept UPI", "can I pay by card"
- **Action:** Answer from FAQ.

### `follow_up_policy`
- **Examples:** "is follow-up free", "do I pay again for review"
- **Action:** Answer from FAQ.

---

## Treatment enquiries (high-level info + lead qualification)

These trigger lead qualification (see `CONVERSATION_FLOWS.md` §4). The AI describes the
treatment at a high level only — never suitability, results, or a clinical recommendation.

### `acne`
- **Examples:** "I have acne", "pimples problem"
- **Slots:** name, age, gender, duration, previous_treatment, preferred_time, preferred_doctor (opt)

### `hair_fall`
- **Examples:** "hair fall", "losing hair", "baldness"
- **Slots:** gender, age, duration, current_medications, previous_treatments, preferred_time

### `pigmentation`
- **Examples:** "dark spots", "melasma", "uneven skin tone"
- **Slots:** affected_area, duration, previous_treatments, preferred_time

### `laser`
- **Examples:** "laser hair removal", "laser treatment cost"
- **Slots:** concern/area, preferred_time (+ qualify as above)

### `botox`
- **Examples:** "botox", "anti-wrinkle injection"
- **Slots:** concern/area, preferred_time

### `chemical_peel`
- **Examples:** "chemical peel", "peeling treatment"
- **Slots:** concern, preferred_time

### `hydrafacial`
- **Examples:** "hydrafacial", "facial treatment"
- **Slots:** preferred_time

### `general_treatment_enquiry`
- **Description:** Any other listed service (acne scars, PRP, GFC, hair transplant, fillers,
  skin rejuvenation, wart/mole removal, nail disorders, eczema, psoriasis, vitiligo, fungal
  infections, anti-aging).
- **Action:** High-level info + qualify (nature of concern, duration, previous treatment,
  preferred time).

---

## Control & routing

### `greeting`
- **Examples:** "hi", "hello", "good morning"
- **Action:** Greeting flow.

### `talk_to_human`
- **Examples:** "I want to talk to someone", "connect me to staff"
- **Action:** Immediate handoff.

### `complaint`
- **Examples:** "I'm not happy", "bad experience"
- **Action:** Empathise briefly → handoff.

### `billing_issue`
- **Examples:** "wrong bill", "I was overcharged"
- **Action:** Handoff.

### `refund`
- **Examples:** "I want a refund", "money back"
- **Action:** Handoff.

### `emergency`
- **Examples:** "severe pain", "face swelling", "allergic reaction"
- **Action:** Urge immediate in-person/emergency care (no medical instructions) → handoff immediately.

### `medical_advice`
- **Description:** Any request to diagnose, interpret symptoms, or prescribe.
- **Examples:** "what medicine should I take", "is this cancer", "what's wrong with my skin"
- **Action:** Decline gently → handoff. **Never** answer.

### `unknown`
- **Description:** In-context but not in clinic knowledge, or unclear.
- **Action:** "Let me check with our clinic staff" → flag for staff. Never fabricate.

### `out_of_scope`
- **Description:** Off-topic (politics, coding, general knowledge), or "are you AI".
- **Action:** Redirect to clinic context; never engage; never reveal AI nature.

---

## Handoff reason codes

When `human_handoff = true`, the backend records one of:
`medical_advice`, `complaint`, `billing_issue`, `refund`, `emergency`, `legal`,
`unknown`, `explicit_request`.

## Notes on intent precedence

Safety intents win. If a message contains both a booking phrase and a medical/emergency
signal, classify as the safety intent (`emergency` > `medical_advice` > `complaint` /
`billing_issue` / `refund` > everything else) and hand off.
