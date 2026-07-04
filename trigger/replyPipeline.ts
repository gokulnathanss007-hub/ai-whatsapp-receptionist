import { logger, task } from "@trigger.dev/sdk";
import type { DateTime } from "luxon";
import { buildMessages, renderCollectedInfoBlock } from "@/lib/ai/promptBuilder";
import { generateReceptionistReply } from "@/lib/ai/openaiClient";
import { AiOutputParseError, parseAiOutput } from "@/lib/ai/outputParser";
import { applySafetyOverride } from "@/lib/ai/safetyOverride";
import { nextConversationStage } from "@/lib/ai/conversationStage";
import { mergeCollectedSlots } from "@/lib/ai/mergeSlots";
import { BOOKING_IN_PROGRESS_TIMEOUT_MS, transitionBookingStatus } from "@/lib/ai/bookingStatus";
import { loadClinicKnowledge, renderClinicKnowledgeBlock } from "@/lib/knowledge/loader";
import { getSchedulingProvider } from "@/lib/scheduling";
import {
  renderAvailableSlotsBlock,
  renderBookingConfirmation,
  renderRequestedSlotUnavailable,
  renderSlotConflictReply,
  renderSlotsPresentation,
} from "@/lib/scheduling/renderSlotsBlock";
import { formatRequestedLabel, resolveRequestedDateTime } from "@/lib/scheduling/requestedDateTime";
import type { SchedulingSlot } from "@/lib/scheduling/types";
import { extractTimeMentions, slotMatchesTimeMention } from "@/lib/scheduling/timeMatch";
import {
  beginBookingAttempt,
  getOrCreateOpenConversation,
  getOrCreatePatient,
  getRecentMessages,
  insertAppointmentRequest,
  insertMessage,
  isEventProcessed,
  markBookingTimeout,
  markEventProcessed,
  resolveClinicIdByPhoneNumberId,
  updateConversationAfterTurn,
} from "@/lib/supabase/queries";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/sendMessage";
import type { AiOutput, BookingStatus, CollectedSlots, ConversationStage, HandoffReason } from "@/lib/types";

export interface ReplyPipelinePayload {
  phoneNumberId: string;
  waMessageId: string;
  fromWaId: string;
  contactName: string | null;
  body: string;
}

const HISTORY_LIMIT = 12;

// Deliberately broad: catches any phrasing that claims a booking is already
// done ("✅ confirmed", "is booked", "all set", "has been scheduled", ...).
// A narrow "confirmed|✅"-only version was bypassed in production by the
// model instead writing "All set ... is booked ... will confirm shortly" —
// same false-completion claim, different words. Broaden this further if a
// new phrasing slips through again rather than special-casing each one.
const CLAIMS_COMPLETION_PATTERN =
  /✅|\ball set\b|\b(?:is|has been|you'?re)\s+(?:booked|confirmed|scheduled|set)\b/i;

// Fail-closed fallback per /docs/AI_RECEPTIONIST_SPEC.md §12: any generation
// or parse error becomes a handoff, never an unreviewed guess.
function fallbackHandoffOutput(): AiOutput {
  return {
    reply: "I will pass this to our clinic staff. They will help you soon.",
    intent: "unknown",
    collected: {},
    appointment_request: null,
    booking_selection: null,
    presenting_slots: false,
    human_handoff: true,
    handoff_reason: "unknown",
  };
}

/** Inserts the inbound message, tolerating a retried run that already recorded it. */
async function insertInboundMessage(conversationId: string, payload: ReplyPipelinePayload) {
  try {
    await insertMessage({
      conversationId,
      waMessageId: payload.waMessageId,
      direction: "inbound",
      body: payload.body,
    });
  } catch (error) {
    const isDuplicate =
      typeof error === "object" && error !== null && "code" in error && error.code === "23505";
    if (!isDuplicate) throw error;
  }
}

/**
 * Sends a single deterministic reply without touching the AI or Google
 * Calendar — used only by the duplicate-protection / timeout short-circuits
 * below, where the backend's own booking_status is the entire answer and
 * re-running the model would risk it inventing a second, contradictory
 * status update.
 */
async function shortCircuitReply(params: {
  conversationId: string;
  payload: ReplyPipelinePayload;
  reply: string;
}): Promise<{ skipped: false; intent: "book_appointment"; humanHandoff: false }> {
  await insertInboundMessage(params.conversationId, params.payload);
  const outboundMessageId = await sendWhatsAppTextMessage({
    phoneNumberId: params.payload.phoneNumberId,
    to: params.payload.fromWaId,
    body: params.reply,
  });
  await insertMessage({
    conversationId: params.conversationId,
    waMessageId: outboundMessageId,
    direction: "outbound",
    body: params.reply,
    intent: "book_appointment",
  });
  await markEventProcessed(params.payload.waMessageId);
  return { skipped: false as const, intent: "book_appointment" as const, humanHandoff: false as const };
}

export const replyPipelineTask = task({
  id: "whatsapp-reply-pipeline",
  // googleapis (used by lib/scheduling/lib/google) is memory-heavy — the
  // default "micro" machine OOM-killed this task in production once the
  // Google Calendar integration was wired in. small-2x gives real headroom.
  machine: "small-2x",
  run: async (payload: ReplyPipelinePayload) => {
    const t0 = Date.now();
    const elapsed = () => Date.now() - t0;

    // Idempotency: a full prior run (including send) already handled this message.
    if (await isEventProcessed(payload.waMessageId)) {
      logger.info("Skipping already-processed message", { waMessageId: payload.waMessageId });
      return { skipped: true as const };
    }

    const clinicId = await resolveClinicIdByPhoneNumberId(payload.phoneNumberId);
    if (!clinicId) {
      throw new Error(`No clinic mapped to phone_number_id ${payload.phoneNumberId}`);
    }
    logger.info("Resolved clinic", { ms: elapsed() });

    const patient = await getOrCreatePatient(clinicId, payload.fromWaId);
    const conversation = await getOrCreateOpenConversation(clinicId, patient.id);
    logger.info("Loaded patient + conversation", { ms: elapsed() });

    // Duplicate protection + crash recovery: a real booking attempt is
    // already in flight for this conversation (see beginBookingAttempt()
    // below). Root cause this replaces: the AI previously had no persisted
    // backend state to consult, so a patient sending "any update?" while a
    // prior turn was still resolving could get a second, independently
    // generated status claim — the exact "booked... actually checking...
    // still checking" contradiction this whole state machine exists to rule
    // out. A genuinely new inbound message never re-runs the AI or calls
    // Google Calendar while this is true; it only ever reads real state.
    if (conversation.booking_status === "booking_in_progress") {
      const isRetryOfSameAttempt = conversation.booking_in_progress_message_id === payload.waMessageId;
      const ageMs = Date.now() - new Date(conversation.booking_status_updated_at).getTime();

      if (!isRetryOfSameAttempt && ageMs < BOOKING_IN_PROGRESS_TIMEOUT_MS) {
        logger.info("Booking already in progress — short-circuiting without re-running AI/booking", {
          conversationId: conversation.id,
          ageMs,
        });
        return shortCircuitReply({
          conversationId: conversation.id,
          payload,
          reply: "We are still booking your appointment. You don't need to do anything — we will message you as soon as it is done.",
        });
      }
      if (!isRetryOfSameAttempt) {
        logger.error("Booking Timeout — stale booking_in_progress detected, marking timed out", {
          conversationId: conversation.id,
          ageMs,
        });
        await markBookingTimeout(conversation.id);
        return shortCircuitReply({
          conversationId: conversation.id,
          payload,
          reply:
            "Sorry, your booking is taking a little longer than usual. You don't need to do anything — we will message you as soon as it is confirmed.",
        });
      }
      // isRetryOfSameAttempt: this IS the message that started the in-flight
      // attempt, being retried after a crash (e.g. Trigger.dev retry after an
      // OOM or network failure) — not a new message. Fall through and let it
      // genuinely re-attempt the booking below, regardless of age.
    }

    // Independent of each other — run concurrently.
    const [knowledge, history] = await Promise.all([
      loadClinicKnowledge(clinicId),
      getRecentMessages(conversation.id, HISTORY_LIMIT),
      insertInboundMessage(conversation.id, payload),
    ]);
    const knowledgeBlock = renderClinicKnowledgeBlock(knowledge);
    logger.info("Loaded knowledge + history, inserted inbound message", { ms: elapsed() });

    // Only check real availability once the conversation has already reached
    // the booking stage (i.e. qualifying is done) and the clinic has opted
    // into calendar-checked auto-confirmation. getSchedulingProvider returns
    // null if no calendar is connected/working, which naturally falls back
    // to the legacy free-text flow below — see
    // /docs/GOOGLE_CALENDAR_INTEGRATION.md §2, §6, §10.
    //
    // requestedTarget resolves the patient's CURRENT message into an exact
    // date/time when unambiguous ("today"/"tomorrow" + a clear AM/PM time).
    // Production bug this fixes: listAvailableSlots used to always return
    // the chronologically-earliest slots with zero awareness of what was
    // actually requested, so "tomorrow 5pm" could be silently resolved
    // against today's earliest slots instead. See
    // /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7.
    let availableSlots: SchedulingSlot[] | null = null;
    let requestedTarget: DateTime | null = null;
    let clinicTimezone: string | null = null;
    // Production bug this gate-widening fixes: slots were fetched ONLY when
    // the conversation was already at stage "booking" when the turn started
    // — but a patient's FIRST booking message ("I want to book appointment
    // for today 7 pm") arrives while the stage is still greeting/faq, so
    // that turn had no availability data, the model set presenting_slots
    // anyway, and the patient got the dead-end "let me check our calendar"
    // fallback with no follow-up ever coming. Fetch availability whenever
    // the current message itself clearly signals booking intent (mentions
    // booking words or resolves to a concrete date/time), not just when the
    // persisted stage already caught up.
    const currentMessageSignalsBooking =
      /\b(book|appointment|slot|schedule|reschedul)/i.test(payload.body) ||
      resolveRequestedDateTime({
        text: payload.body,
        timezone: knowledge.profile.timezone,
        now: new Date(),
      }) !== null;
    if ((conversation.stage === "booking" || currentMessageSignalsBooking) && knowledge.profile.auto_confirm_enabled) {
      const provider = await getSchedulingProvider(clinicId);
      if (provider) {
        // Production bug this fixes: once a specific slot has been offered,
        // a patient confirming it ("Confirm it", "Yes", "Ok") mentions no
        // day/time at all, so resolveRequestedDateTime(payload.body) returns
        // null — which silently fell back to "today's earliest slots" and
        // dropped the slot the patient was actually confirming. The model
        // then had no valid selected_slot_id to book against and stalled in
        // an "I'll confirm with our team" loop forever. Falling back to the
        // already-collected preferred_date/preferred_time (captured earlier
        // this same booking) re-resolves the same target the offer was
        // built from. See collectedPreferredDate/Time in the diagnostics log
        // below, which already surfaced this gap without acting on it.
        const collectedSlots = conversation.collected_slots as CollectedSlots | undefined;
        let requestHint = payload.body;
        if (
          resolveRequestedDateTime({
            text: payload.body,
            timezone: knowledge.profile.timezone,
            now: new Date(),
          }) === null &&
          (collectedSlots?.preferred_date || collectedSlots?.preferred_time)
        ) {
          requestHint = `${collectedSlots?.preferred_date ?? ""} ${collectedSlots?.preferred_time ?? ""}`.trim();
        }

        availableSlots = await provider.listAvailableSlots({ requestHint });
        logger.info("Loaded available slots", { count: availableSlots.length, ms: elapsed() });

        clinicTimezone = knowledge.profile.timezone;
        requestedTarget = resolveRequestedDateTime({
          text: requestHint,
          timezone: knowledge.profile.timezone,
          now: new Date(),
        });
      }
    }
    const availableSlotsBlock =
      availableSlots !== null ? renderAvailableSlotsBlock(availableSlots) : undefined;

    // Requirement: debug logging showing requested date/time, parsed
    // datetime, and the slots actually returned — see
    // /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7/§8.
    logger.info("Booking request diagnostics", {
      patientMessage: payload.body,
      collectedPreferredDate: (conversation.collected_slots as CollectedSlots | undefined)?.preferred_date ?? null,
      collectedPreferredTime: (conversation.collected_slots as CollectedSlots | undefined)?.preferred_time ?? null,
      parsedTargetDateTime: requestedTarget?.toISO() ?? null,
      availableSlotsReturned: availableSlots?.map((s) => ({ id: s.id, label: s.label, startsAt: s.startsAt })) ?? null,
    });

    // Rendered from persisted collected_slots (pre-this-turn), not just raw
    // history — durable memory of what's already been asked/answered, even
    // once earlier turns scroll out of the trimmed history window. See the
    // "never re-ask" audit note in /docs/GOOGLE_CALENDAR_INTEGRATION.md.
    const collectedInfoBlock = renderCollectedInfoBlock(conversation.collected_slots as CollectedSlots);

    const messages = buildMessages({
      clinicName: knowledge.profile.name,
      knowledgeBlock,
      collectedInfoBlock,
      availableSlotsBlock,
      history,
      newMessage: payload.body,
    });

    let output: AiOutput;
    try {
      const raw = await generateReceptionistReply(messages);
      output = parseAiOutput(raw);
    } catch (error) {
      logger.error("Reply generation/parse failed — failing closed to handoff", {
        error: error instanceof AiOutputParseError ? error.message : String(error),
      });
      output = fallbackHandoffOutput();
    }
    logger.info("Generated AI reply", { ms: elapsed() });

    output = applySafetyOverride(payload.body, output);

    // Prompt-level guardrail backed up in code, per CLAUDE.md §3 ("never rely
    // on the model alone"): these two paths are meant to be mutually
    // exclusive, but a model that ignores the instruction and populates both
    // would otherwise create a duplicate legacy appointment_requests row
    // alongside the real calendar booking. booking_selection wins because
    // it's calendar-verified; appointment_request is not.
    if (output.appointment_request && output.booking_selection) {
      logger.error("Model returned both appointment_request and booking_selection", {
        intent: output.intent,
      });
      output = { ...output, appointment_request: null };
    }

    // Prompt-level guardrail backed up in code: the model has, in testing,
    // populated appointment_request with blank placeholder strings before it
    // actually had the patient's details (e.g. mid-qualifying, before a name
    // was even given). Inserting that would create a garbage
    // appointment_requests row — require every field to be genuinely filled.
    if (
      output.appointment_request &&
      (!output.appointment_request.name.trim() ||
        !output.appointment_request.preferred_date.trim() ||
        !output.appointment_request.preferred_time.trim() ||
        !output.appointment_request.reason.trim())
    ) {
      logger.error("Model returned an incomplete appointment_request — dropping it", {
        appointmentRequest: output.appointment_request,
      });
      output = { ...output, appointment_request: null };
    }

    // The model's reply may be optimistic ("you're booked for..."). If a
    // booking was actually attempted, the real outcome — not the model —
    // has final say on what gets sent. See /docs/GOOGLE_CALENDAR_INTEGRATION.md §6, §7.
    let finalReply = output.reply;
    let finalHumanHandoff = output.human_handoff;
    let finalHandoffReason: HandoffReason | null = output.handoff_reason;
    let bookingSucceeded = false;
    let bookingAttempted = false;
    // True when this run lost the atomic claim race to a concurrent run for
    // the same conversation — see beginBookingAttempt(). This run must never
    // write booking_status in that case; the run that holds the claim owns
    // the next transition.
    let claimLost = false;
    // Tracked in-memory (not re-read from the row) because a real attempt
    // this same turn moves it past "booking_in_progress" before the
    // end-of-turn write — see transitionBookingStatus()'s one-way rule.
    let currentBookingStatus: BookingStatus = conversation.booking_status;

    // Prompt-level guardrail backed up in code: observed in production —
    // the model fabricated an entire fake slot list (a past time, and times
    // on a day the clinic is closed) instead of faithfully relaying
    // <available_slots>. The model's own free-text slot list can never be
    // trusted; whenever it signals it's presenting times, replace its reply
    // with a deterministic rendering of the real data. See
    // /docs/GOOGLE_CALENDAR_INTEGRATION.md §6.
    if (output.presenting_slots) {
      if (availableSlots !== null) {
        // If the patient asked for a specific date/time, say so explicitly
        // when it's not exactly available, rather than a generic "here's
        // what's open" — matches the "requested slot unavailable" framing
        // required per /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7.
        const exactMatchShown =
          requestedTarget !== null &&
          availableSlots.some((slot) => slot.startsAt === requestedTarget!.toUTC().toISO());
        if (requestedTarget && clinicTimezone && !exactMatchShown) {
          finalReply = renderRequestedSlotUnavailable(
            formatRequestedLabel(requestedTarget, clinicTimezone, new Date()),
            availableSlots,
          );
        } else {
          finalReply = renderSlotsPresentation(availableSlots, knowledge.doctors[0]?.name);
        }
      } else {
        logger.error("Model set presenting_slots with no real availability data given", {
          reply: output.reply,
        });
        // Never promise a follow-up nothing will ever perform ("I'll get
        // back to you shortly" with no mechanism behind it) — ask a
        // question that keeps the conversation moving instead.
        finalReply = "Sure — what day and time would you like to come in?";
      }
    } else if (
      // Prompt-level guardrail backed up in code: observed in production
      // testing (twice, with two different phrasings — "✅ ... confirmed"
      // and later "All set ... is booked ... will confirm shortly") that the
      // model can claim success while leaving booking_selection null,
      // meaning bookSlot() is never called and nothing is actually booked.
      // CLAIMS_COMPLETION_PATTERN must stay broad — narrow wording checks
      // keep getting bypassed by a different phrasing of the same claim.
      !output.booking_selection &&
      !output.appointment_request &&
      availableSlotsBlock !== undefined &&
      CLAIMS_COMPLETION_PATTERN.test(output.reply)
    ) {
      logger.error("Model claimed a completed booking with no booking_selection to back it", {
        reply: output.reply,
      });
      finalReply =
        "Sorry, let me check that time once more. Which time from the list would you like?";
    } else if (
      !output.booking_selection &&
      !output.appointment_request &&
      !finalHumanHandoff &&
      availableSlotsBlock !== undefined
    ) {
      // Structural backstop, not a wording guess: while <available_slots> is
      // in play, the system prompt's contract gives the model exactly three
      // legal moves — presenting_slots, booking_selection, or a handoff.
      // Anything else is the model inventing its own status update, which is
      // exactly how "I'll confirm the exact slot now with our team" and
      // "I'm just confirming the 6:00 PM slot..." reached patients in
      // production without ever calling bookSlot(). A regex can only ever
      // catch phrasings seen before (CLAIMS_COMPLETION_PATTERN above already
      // needed broadening twice for that reason); this catches all of them by
      // construction. Re-show the real live options rather than let a
      // fabricated "checking..." reply through.
      logger.error("Model produced a non-actionable reply while slots were offered — replacing with real options", {
        reply: output.reply,
      });
      finalReply = renderSlotsPresentation(availableSlots ?? [], knowledge.doctors[0]?.name);
    }

    if (output.booking_selection && !finalHumanHandoff) {
      const bookingSelection = output.booking_selection;
      const provider = await getSchedulingProvider(clinicId);

      const candidateSlot = availableSlots?.find(
        (slot) => slot.id === bookingSelection.selected_slot_id,
      );

      // Requirement: requested_slot must equal selected_slot before any
      // booking is attempted. Full day+time precision when we resolved a
      // specific target this turn; falls back to time-of-day-only when the
      // date was ambiguous (e.g. weekday names we don't parse). Either way,
      // a mismatch aborts the booking — it is never silently overridden to
      // "the first/nearest available slot".
      let mismatch = false;
      if (candidateSlot && requestedTarget) {
        mismatch = candidateSlot.startsAt !== requestedTarget.toUTC().toISO();
      } else if (candidateSlot) {
        const mentionedTimes = extractTimeMentions(payload.body);
        mismatch = mentionedTimes.length > 0 && !slotMatchesTimeMention(candidateSlot, mentionedTimes);
      }

      logger.info("Booking selection validation", {
        requestedTargetIso: requestedTarget?.toUTC().toISO() ?? null,
        selectedSlotId: bookingSelection.selected_slot_id,
        candidateSlotLabel: candidateSlot?.label ?? null,
        candidateSlotStart: candidateSlot?.startsAt ?? null,
        mismatch,
      });

      if (!provider) {
        // Was connected when slots were offered, disconnected since — fail
        // closed rather than send an unconfirmed "booked!" message. This is
        // a genuine terminal failure (requirement: every booking code path
        // must reach confirmed/failed/timeout, never linger at
        // waiting_for_confirmation) — a human is now handling it instead.
        bookingAttempted = true;
        currentBookingStatus = transitionBookingStatus(currentBookingStatus, "failed");
        finalHumanHandoff = true;
        finalHandoffReason = "unknown";
        finalReply = "Our clinic staff will confirm this appointment for you. They will message you soon.";
        logger.error("Scheduling provider unavailable at booking time", { clinicId });
        logger.info("Booking Completed", { conversationId: conversation.id, outcome: "failed", reason: "provider_unavailable" });
      } else if (mismatch) {
        // Observed in production: the model resolved a patient's clearly
        // stated date/time (e.g. "tomorrow 5pm") to the WRONG id from
        // <available_slots> (e.g. "today 11am"'s id) — despite the correct
        // slot being available. Abort the booking; never substitute a
        // different slot. Re-show the real current options instead.
        logger.error("booking_selection mismatch — aborting booking, re-presenting slots instead", {
          requestedTargetIso: requestedTarget?.toUTC().toISO() ?? null,
          candidateLabel: candidateSlot?.label,
          body: payload.body,
        });
        finalReply =
          requestedTarget && clinicTimezone
            ? renderRequestedSlotUnavailable(
                formatRequestedLabel(requestedTarget, clinicTimezone, new Date()),
                availableSlots ?? [],
              )
            : renderSlotsPresentation(availableSlots ?? [], knowledge.doctors[0]?.name);
      } else {
        // Atomic claim, not a read-then-write check: two near-simultaneous
        // inbound messages (e.g. the patient double-tapping "Confirm") each
        // start their own run, and both can pass every check above before
        // either has written anything. claim_booking_attempt() is a single
        // conditional UPDATE — Postgres row-locking guarantees at most one
        // concurrent caller can ever see this conversation as claimable. See
        // 0007_claim_booking_attempt.sql.
        const claimed = await beginBookingAttempt(conversation.id, payload.waMessageId);
        if (!claimed) {
          // Lost the race: another run already holds this booking (in
          // flight or already confirmed). Never call bookSlot() a second
          // time, and never touch booking_status here — the run that holds
          // the claim owns the next transition; writing anything from here
          // could clobber its confirmed/failed/timeout result with a stale
          // value.
          claimLost = true;
          logger.info("Booking attempt lost the atomic claim race — not starting a second booking", {
            conversationId: conversation.id,
          });
          finalReply =
            "We are still booking your appointment. You don't need to do anything — we will message you as soon as it is done.";
        } else {
          // Persisted BEFORE the real Google Calendar call, not batched with
          // everything else at the end of the turn — so a crash mid-call
          // still leaves the database (not just this in-memory run) showing
          // a genuine booking in flight. See the duplicate-protection check
          // at the top of run().
          bookingAttempted = true;
          currentBookingStatus = transitionBookingStatus(currentBookingStatus, "booking_in_progress");
          logger.info("Booking Started", {
            conversationId: conversation.id,
            selectedSlotId: bookingSelection.selected_slot_id,
          });

          const bookingResult = await provider.bookSlot({
            slotId: bookingSelection.selected_slot_id,
            patientId: patient.id,
            conversationId: conversation.id,
            name: bookingSelection.name,
            mobile: patient.wa_phone,
            reason: bookingSelection.reason,
            waMessageId: payload.waMessageId,
          });
          if (bookingResult.ok) {
            bookingSucceeded = true;
            currentBookingStatus = transitionBookingStatus(currentBookingStatus, "confirmed");
            // Never trust the model's own free-text date/time claim — always
            // state the real, verified slot so a wrong-slot-id mismatch is
            // immediately visible to the patient instead of silently wrong.
            finalReply = renderBookingConfirmation({
              slot: bookingResult.slot,
              clinicName: knowledge.profile.name,
              doctorName: knowledge.doctors[0]?.name,
            });
            // Defense-in-depth audit log per requirement 7/8 — the mismatch
            // guard above should make this branch unreachable in practice
            // (booking is aborted before this point on a mismatch), but this
            // is the last line of defense and the full debug trail requested:
            // requested date/time, parsed target, selected slot, and the
            // final Calendar event start/end that was actually created.
            if (requestedTarget && bookingResult.slot.startsAt !== requestedTarget.toUTC().toISO()) {
              logger.error("CRITICAL: booked slot does not match requested date/time", {
                requestedTargetIso: requestedTarget.toUTC().toISO(),
                bookedSlotStart: bookingResult.slot.startsAt,
                bookedSlotEnd: bookingResult.slot.endsAt,
              });
            }
            logger.info("Booking succeeded", {
              requestedTargetIso: requestedTarget?.toUTC().toISO() ?? null,
              collectedPreferredDate:
                (conversation.collected_slots as CollectedSlots | undefined)?.preferred_date ?? null,
              collectedPreferredTime:
                (conversation.collected_slots as CollectedSlots | undefined)?.preferred_time ?? null,
              appointmentId: bookingResult.appointmentId,
              calendarSynced: bookingResult.calendarSynced,
              finalCalendarStart: bookingResult.slot.startsAt,
              finalCalendarEnd: bookingResult.slot.endsAt,
            });
            logger.info("Booking Completed", { conversationId: conversation.id, outcome: "confirmed" });
          } else {
            currentBookingStatus = transitionBookingStatus(currentBookingStatus, "failed");
            finalReply = renderSlotConflictReply(bookingResult.alternatives);
            logger.info("Booking lost the race or slot was stale", { reason: bookingResult.reason });
            logger.info("Booking Completed", {
              conversationId: conversation.id,
              outcome: "failed",
              reason: bookingResult.reason,
            });
          }
        }
      }
    }

    const mergedSlots = mergeCollectedSlots(conversation.collected_slots, output.collected);
    let stage: ConversationStage = nextConversationStage(
      { ...output, human_handoff: finalHumanHandoff },
      conversation.stage,
    );
    // Intent classification can get pulled toward a side topic mentioned in
    // the same reply (e.g. explaining clinic hours while still mid-booking),
    // which would otherwise flip the stage away from "booking" and silently
    // stop showing availability next turn. If we actually showed
    // <available_slots> this turn, stay on "booking" regardless of intent —
    // don't rely on the model's classification alone for this.
    if (availableSlotsBlock !== undefined && stage !== "handoff") {
      stage = "booking";
    }
    // Once booked, stop re-fetching availability on every subsequent
    // "thank you!" — nextConversationStage would otherwise keep the
    // conversation on "booking" forever since booking_selection is still set
    // on this same successful turn.
    if (bookingSucceeded) stage = "followup";

    // Only touch booking_status when something booking-related actually
    // happened this turn — mirrors mergeCollectedSlots' "only defined values
    // overwrite" pattern; a plain FAQ/qualifying turn leaves it untouched.
    // The confirmed/failed cases were already transitioned in-memory above
    // (right next to the real bookSlot() call); this just decides whether a
    // fresh offer this turn should now count as "awaiting the patient's yes".
    // claimLost is excluded entirely — this run never held the claim, so it
    // must never write a status that could race with (and clobber) whatever
    // the claim-holding run is about to persist.
    let finalBookingStatus: BookingStatus | undefined;
    if (claimLost) {
      finalBookingStatus = undefined;
    } else if (bookingSucceeded || bookingAttempted) {
      finalBookingStatus = currentBookingStatus;
    } else if (availableSlotsBlock !== undefined) {
      finalBookingStatus = transitionBookingStatus(currentBookingStatus, "waiting_for_confirmation");
    }

    // Independent writes/send — run concurrently. The outbound message row
    // (which needs the WhatsApp send result) is inserted right after.
    const [outboundMessageId] = await Promise.all([
      sendWhatsAppTextMessage({
        phoneNumberId: payload.phoneNumberId,
        to: payload.fromWaId,
        body: finalReply,
      }),
      updateConversationAfterTurn({
        conversationId: conversation.id,
        stage,
        mergedSlots,
        humanHandoff: finalHumanHandoff,
        handoffReason: finalHandoffReason,
        bookingStatus: finalBookingStatus,
      }),
      output.appointment_request
        ? insertAppointmentRequest({
            clinicId,
            patientId: patient.id,
            conversationId: conversation.id,
            mobile: patient.wa_phone,
            payload: output.appointment_request,
          })
        : Promise.resolve(),
    ]);
    logger.info("Sent WhatsApp reply + persisted turn", { ms: elapsed() });
    if (bookingSucceeded) {
      logger.info("WhatsApp Confirmation Sent", { conversationId: conversation.id, outboundMessageId });
    }

    await insertMessage({
      conversationId: conversation.id,
      waMessageId: outboundMessageId,
      direction: "outbound",
      body: finalReply,
      intent: output.intent,
    });

    // Mark processed last — only once the reply has actually been sent.
    await markEventProcessed(payload.waMessageId);
    logger.info("Done", { ms: elapsed() });

    return {
      skipped: false as const,
      intent: output.intent,
      humanHandoff: finalHumanHandoff,
    };
  },
});
