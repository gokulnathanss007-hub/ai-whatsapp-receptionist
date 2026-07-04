import { logger, task } from "@trigger.dev/sdk";
import type { DateTime } from "luxon";
import { buildMessages, renderCollectedInfoBlock } from "@/lib/ai/promptBuilder";
import { generateReceptionistReply } from "@/lib/ai/openaiClient";
import { AiOutputParseError, parseAiOutput } from "@/lib/ai/outputParser";
import { applySafetyOverride } from "@/lib/ai/safetyOverride";
import { nextConversationStage } from "@/lib/ai/conversationStage";
import { mergeCollectedSlots } from "@/lib/ai/mergeSlots";
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
  getOrCreateOpenConversation,
  getOrCreatePatient,
  getRecentMessages,
  insertAppointmentRequest,
  insertMessage,
  isEventProcessed,
  markEventProcessed,
  resolveClinicIdByPhoneNumberId,
  updateConversationAfterTurn,
} from "@/lib/supabase/queries";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/sendMessage";
import type { AiOutput, CollectedSlots, ConversationStage, HandoffReason } from "@/lib/types";

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
    reply: "I'll forward this to our clinic staff. They'll assist you shortly.",
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
    if (conversation.stage === "booking" && knowledge.profile.auto_confirm_enabled) {
      const provider = await getSchedulingProvider(clinicId);
      if (provider) {
        availableSlots = await provider.listAvailableSlots({ requestHint: payload.body });
        logger.info("Loaded available slots", { count: availableSlots.length, ms: elapsed() });

        clinicTimezone = knowledge.profile.timezone;
        requestedTarget = resolveRequestedDateTime({
          text: payload.body,
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
        finalReply = "Let me check our calendar and get back to you with the available times shortly.";
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
        "Sorry, let me just double-check that slot before confirming — could you tell me again which time from the list you'd like?";
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
        // closed rather than send an unconfirmed "booked!" message.
        finalHumanHandoff = true;
        finalHandoffReason = "unknown";
        finalReply = "I'll connect you with our clinic staff to confirm this appointment.";
        logger.error("Scheduling provider unavailable at booking time", { clinicId });
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
        const bookingResult = await provider.bookSlot({
          slotId: bookingSelection.selected_slot_id,
          patientId: patient.id,
          conversationId: conversation.id,
          name: bookingSelection.name,
          mobile: patient.wa_phone,
          reason: bookingSelection.reason,
        });
        if (bookingResult.ok) {
          bookingSucceeded = true;
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
        } else {
          finalReply = renderSlotConflictReply(bookingResult.alternatives);
          logger.info("Booking lost the race or slot was stale", { reason: bookingResult.reason });
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
