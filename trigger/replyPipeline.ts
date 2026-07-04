import { logger, task } from "@trigger.dev/sdk";
import { buildMessages, renderCollectedInfoBlock } from "@/lib/ai/promptBuilder";
import { generateReceptionistReply } from "@/lib/ai/openaiClient";
import { AiOutputParseError, parseAiOutput } from "@/lib/ai/outputParser";
import { applySafetyOverride } from "@/lib/ai/safetyOverride";
import { nextConversationStage } from "@/lib/ai/conversationStage";
import { mergeCollectedSlots } from "@/lib/ai/mergeSlots";
import { loadClinicKnowledge, renderClinicKnowledgeBlock } from "@/lib/knowledge/loader";
import { getSchedulingProvider } from "@/lib/scheduling";
import { renderAvailableSlotsBlock, renderSlotConflictReply } from "@/lib/scheduling/renderSlotsBlock";
import type { SchedulingSlot } from "@/lib/scheduling/types";
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

// Fail-closed fallback per /docs/AI_RECEPTIONIST_SPEC.md §12: any generation
// or parse error becomes a handoff, never an unreviewed guess.
function fallbackHandoffOutput(): AiOutput {
  return {
    reply: "I'll forward this to our clinic staff. They'll assist you shortly.",
    intent: "unknown",
    collected: {},
    appointment_request: null,
    booking_selection: null,
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
    let availableSlots: SchedulingSlot[] | null = null;
    if (conversation.stage === "booking" && knowledge.profile.auto_confirm_enabled) {
      const provider = await getSchedulingProvider(clinicId);
      if (provider) {
        availableSlots = await provider.listAvailableSlots();
        logger.info("Loaded available slots", { count: availableSlots.length, ms: elapsed() });
      }
    }
    const availableSlotsBlock =
      availableSlots !== null ? renderAvailableSlotsBlock(availableSlots) : undefined;

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

    if (output.booking_selection && !finalHumanHandoff) {
      const provider = await getSchedulingProvider(clinicId);
      if (!provider) {
        // Was connected when slots were offered, disconnected since — fail
        // closed rather than send an unconfirmed "booked!" message.
        finalHumanHandoff = true;
        finalHandoffReason = "unknown";
        finalReply = "I'll connect you with our clinic staff to confirm this appointment.";
        logger.error("Scheduling provider unavailable at booking time", { clinicId });
      } else {
        const bookingResult = await provider.bookSlot({
          slotId: output.booking_selection.selected_slot_id,
          patientId: patient.id,
          conversationId: conversation.id,
          name: output.booking_selection.name,
          mobile: patient.wa_phone,
          reason: output.booking_selection.reason,
        });
        if (bookingResult.ok) {
          bookingSucceeded = true;
          logger.info("Booking succeeded", {
            appointmentId: bookingResult.appointmentId,
            calendarSynced: bookingResult.calendarSynced,
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
