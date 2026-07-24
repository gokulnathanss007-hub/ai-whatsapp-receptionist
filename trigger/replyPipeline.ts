import { logger, task } from "@trigger.dev/sdk";
import type { DateTime } from "luxon";
import { buildMessages, renderCollectedInfoBlock } from "@/lib/ai/promptBuilder";
import { generateReceptionistReply } from "@/lib/ai/openaiClient";
import { AiOutputParseError, parseAiOutput } from "@/lib/ai/outputParser";
import { applySafetyOverride, detectSafetyOverride } from "@/lib/ai/safetyOverride";
import { nextConversationStage } from "@/lib/ai/conversationStage";
import { mergeCollectedSlots } from "@/lib/ai/mergeSlots";
import { BOOKING_IN_PROGRESS_TIMEOUT_MS, transitionBookingStatus } from "@/lib/ai/bookingStatus";
import { loadSchoolKnowledge, renderSchoolKnowledgeBlock } from "@/lib/knowledge/loader";
import { getSchedulingProvider } from "@/lib/scheduling";
import {
  renderAvailableSlotsBlock,
  renderBookingConfirmation,
  renderDayPickerText,
  renderRequestedSlotUnavailable,
  renderSlotConflictReply,
  renderSlotNotOpenReply,
  renderSlotsPresentation,
} from "@/lib/scheduling/renderSlotsBlock";
import { listOpenDays, parseDayRowId, resolveTypedDay, type DayOption } from "@/lib/scheduling/dayPicker";
import { listAvailableSlots } from "@/lib/scheduling/listAvailableSlots";
import { resolveSelectedSlot } from "@/lib/scheduling/recoverSelectedSlot";
import { formatRequestedLabel, resolveRequestedDateTime } from "@/lib/scheduling/requestedDateTime";
import type { SchedulingSlot } from "@/lib/scheduling/types";
import { extractTimeMentions, slotMatchesTimeMention } from "@/lib/scheduling/timeMatch";
import {
  beginBookingAttempt,
  getOrCreateOpenConversation,
  getOrCreateParent,
  getRecentMessages,
  getSchoolAsset,
  insertAdmissionEnquiry,
  insertAdmissionOfficeEnquiry,
  insertMessage,
  isEventProcessed,
  markBookingTimeout,
  markEventProcessed,
  resolveSchoolIdByPhoneNumberId,
  updateConversationAfterTurn,
} from "@/lib/supabase/queries";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/sendMessage";
import { executeActionsOnWhatsApp } from "@/lib/whatsapp/channelAdapter";
import { translateTurnToActions } from "@/lib/decision-engine/translateV1";
import {
  isGreetingOnly,
  isMenuRequest,
  renderHandoffText,
  renderMainMenu,
  renderMainMenuText,
  resolveMenuSelection,
} from "@/lib/decision-engine/mainMenu";
import {
  ADM_COLLECT_CLASS_PREFIX,
  ADMISSION_ENQUIRY_CONFIRMATION_TEXT,
  ASK_MESSAGE_TEXT,
  ASK_STUDENT_NAME_TEXT,
  isSkipMessage,
  renderAdmissionMenu,
  renderAdmissionMenuText,
  renderAdmissionProcessText,
  renderAdmissionStatusText,
  renderAskClass,
  renderAskClassText,
  renderAskParentNameText,
  renderRequiredDocumentsText,
  resolveAdmissionMenuSelection,
  resolveAskClassSelection,
} from "@/lib/decision-engine/admissionMenu";
import type { Action } from "@/lib/decision-engine/types";
import { formatOpeningHours } from "@/lib/scheduling/formatOpeningHours";
import type { AiOutput, BookingStatus, CollectedSlots, ConversationStage, HandoffReason } from "@/lib/types";

export interface ReplyPipelinePayload {
  phoneNumberId: string;
  waMessageId: string;
  fromWaId: string;
  contactName: string | null;
  body: string;
  /** interactive.button_reply/list_reply id when the parent tapped instead of typing (V2 interactive) — e.g. the exact slot id of a tapped row. */
  interactiveReplyId?: string | null;
}

const HISTORY_LIMIT = 12;

// Resume threshold (PATIENT_EXPERIENCE.md §7): after this much silence a
// returning parent gets a clean scheduling slate (stale relative dates and
// long-dead slot offers are dropped; name/enquiry details are kept). Matches
// the Meta 24h session window — beyond it the prior session is over anyway.
const STALE_CONVERSATION_MS = 24 * 60 * 60 * 1000;

// Deliberately broad: catches any phrasing that claims a booking is already
// done ("✅ confirmed", "is booked", "all set", "has been scheduled", ...).
// A narrow "confirmed|✅"-only version was bypassed in production by the
// model instead writing "All set ... is booked ... will confirm shortly" —
// same false-completion claim, different words. Broaden this further if a
// new phrasing slips through again rather than special-casing each one.
const CLAIMS_COMPLETION_PATTERN =
  /✅|\ball set\b|\b(?:is|has been|you'?re)\s+(?:booked|confirmed|scheduled|set)\b/i;

// FAQ-category menu items that answer directly from school_faqs — no AI call
// needed. Mirrors the 1:1 menu↔category mapping enforced by
// school_faqs_category_check (0012_rename_clinic_to_school.sql).
// menu_transport and menu_fee_structure are handled separately (see
// TRANSPORT_PDF_ASSET_KEY / FEE_STRUCTURE_ASSET_KEY below) — they may
// send a file (PDF/image) instead of plain FAQ text.
const FAQ_MENU_ITEMS: Record<string, { category: string; intent: string }> = {
  menu_facilities: { category: "facilities", intent: "facilities" },
};

/** school_assets.asset_key for the Transport menu's routes/schedule PDF (product decision 2026-07-23). */
const TRANSPORT_PDF_ASSET_KEY = "transport_bus_routes";
/** school_assets.asset_key for the Fee Structure menu's fee details image (product decision 2026-07-23). */
const FEE_STRUCTURE_ASSET_KEY = "fee_structure_details";

// Fail-closed fallback per /docs/AI_RECEPTIONIST_SPEC.md §12: any generation
// or parse error becomes a handoff, never an unreviewed guess.
function fallbackHandoffOutput(): AiOutput {
  return {
    reply: "I will pass this to our school office.\n\nThey will help you soon.",
    intent: "unknown",
    collected: {},
    enquiry_request: null,
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
}): Promise<{ skipped: false; intent: "book_visit"; humanHandoff: false }> {
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
    intent: "book_visit",
  });
  await markEventProcessed(params.payload.waMessageId);
  return { skipped: false as const, intent: "book_visit" as const, humanHandoff: false as const };
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

    const schoolId = await resolveSchoolIdByPhoneNumberId(payload.phoneNumberId);
    if (!schoolId) {
      throw new Error(`No school mapped to phone_number_id ${payload.phoneNumberId}`);
    }
    logger.info("Resolved school", { ms: elapsed() });

    const parent = await getOrCreateParent(schoolId, payload.fromWaId);
    const conversation = await getOrCreateOpenConversation(schoolId, parent.id);
    logger.info("Loaded parent + conversation", { ms: elapsed() });

    // Duplicate protection + crash recovery: a real booking attempt is
    // already in flight for this conversation (see beginBookingAttempt()
    // below). Root cause this replaces: the AI previously had no persisted
    // backend state to consult, so a parent sending "any update?" while a
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
          reply: "We are still booking your visit.\n\nYou don't need to do anything — we will message you as soon as it is done.",
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
            "Sorry, your booking is taking a little longer than usual.\n\nYou don't need to do anything — we will message you as soon as it is confirmed.",
        });
      }
      // isRetryOfSameAttempt: this IS the message that started the in-flight
      // attempt, being retried after a crash (e.g. Trigger.dev retry after an
      // OOM or network failure) — not a new message. Fall through and let it
      // genuinely re-attempt the booking below, regardless of age.
    }

    // Conversation Resume Strategy (PATIENT_EXPERIENCE.md §7): a parent
    // returning after a long gap must get a fresh start, not the ghost of a
    // days-old session. Production incident: a conversation frozen at stage
    // "booking" with preferred "tomorrow" collected 13 days earlier (a) kept
    // suppressing the Main Menu forever ("never interrupt an active
    // booking" — but nothing was active) and (b) made the model hallucinate
    // "You're booked for tomorrow?" from rotten relative dates. Keep durable
    // identity (name, enquiry details); drop the scheduling state — relative
    // dates like "tomorrow" are only meaningful within the session that said
    // them.
    const conversationIsStale =
      Date.now() - new Date(conversation.last_message_at).getTime() > STALE_CONVERSATION_MS;
    if (conversationIsStale && conversation.booking_status !== "booking_in_progress") {
      const cleaned = { ...(conversation.collected_slots as Record<string, unknown>) };
      delete cleaned.preferred_date;
      delete cleaned.preferred_time;
      conversation.collected_slots = cleaned;
      if (conversation.stage === "booking" || conversation.stage === "qualifying") {
        conversation.stage = "greeting";
      }
      if (conversation.booking_status === "waiting_for_confirmation") {
        conversation.booking_status = "none";
      }
      conversation.current_screen = "free_text";
      logger.info("Stale conversation resumed — reset scheduling state, kept identity", {
        conversationId: conversation.id,
        lastMessageAt: conversation.last_message_at,
      });
    }

    // Independent of each other — run concurrently.
    const [knowledge, history] = await Promise.all([
      loadSchoolKnowledge(schoolId),
      getRecentMessages(conversation.id, HISTORY_LIMIT),
      insertInboundMessage(conversation.id, payload),
    ]);
    const knowledgeBlock = renderSchoolKnowledgeBlock(knowledge);
    logger.info("Loaded knowledge + history, inserted inbound message", { ms: elapsed() });

    // ── Parent Experience Layer: deterministic screens ────────────────────
    // The banking-app moments (menu, menu picks, slot-tap confirmation) are
    // rendered by CODE, not the model — instant, token-free, and immune to
    // model noise (PATIENT_EXPERIENCE.md §3/§4). The AI handles everything
    // conversational; these handlers only fire on unambiguous signals.

    /** Sends this turn's actions + persists the turn — for deterministic (no-AI) screens. The inbound row is already inserted above. */
    const deterministicTurn = async (params: {
      actions: Action[];
      textRendering: string;
      stage: ConversationStage;
      collected?: CollectedSlots;
      humanHandoff?: boolean;
      handoffReason?: HandoffReason | null;
      bookingStatus?: BookingStatus;
      intent: string;
    }) => {
      const outboundId = await executeActionsOnWhatsApp({
        phoneNumberId: payload.phoneNumberId,
        to: payload.fromWaId,
        actions: params.actions,
        textFallback: params.textRendering,
      });
      await updateConversationAfterTurn({
        conversationId: conversation.id,
        stage: params.stage,
        mergedSlots: mergeCollectedSlots(conversation.collected_slots, params.collected ?? {}),
        humanHandoff: params.humanHandoff ?? false,
        handoffReason: params.handoffReason ?? null,
        bookingStatus: params.bookingStatus,
        currentScreen: params.actions[params.actions.length - 1]?.screen,
      });
      await insertMessage({
        conversationId: conversation.id,
        waMessageId: outboundId,
        direction: "outbound",
        body: params.textRendering,
        intent: params.intent,
      });
      await markEventProcessed(payload.waMessageId);
      logger.info("Deterministic screen turn complete", {
        screen: params.actions[params.actions.length - 1]?.screen,
        ms: elapsed(),
      });
      return { skipped: false as const, intent: params.intent as AiOutput["intent"], humanHandoff: params.humanHandoff ?? false };
    };

    const persisted = conversation.collected_slots as CollectedSlots | undefined;

    // 1) Greeting or explicit menu request → Main Menu, ALWAYS (product
    //    decision 2026-07-23: a parent typing "Hi" must always get the menu
    //    back — including mid-qualifying, mid-admission-collection, or after
    //    a handoff — so it works as a universal "start over" escape hatch;
    //    never leaves a parent stuck answering a question they don't want to
    //    continue). deterministicTurn below resets stage to "greeting" and
    //    human_handoff to false, matching a genuine fresh start. Strictly
    //    greeting-ONLY messages ("Hi", "Good morning") — a message with any
    //    stated intent skips the menu and is answered directly. A real
    //    in-flight booking attempt (booking_status: booking_in_progress) is
    //    still protected — that's short-circuited earlier, before this code
    //    ever runs, and is unaffected by this always-on greeting behaviour.
    if (isGreetingOnly(payload.body) || isMenuRequest(payload.body)) {
      const menuText = renderMainMenuText({ schoolName: knowledge.profile.name, parentName: persisted?.name ? String(persisted.name) : payload.contactName });
      const actions: Action[] = knowledge.profile.interactive_enabled
        ? [renderMainMenu({ schoolName: knowledge.profile.name, parentName: persisted?.name ? String(persisted.name) : payload.contactName })]
        : [{ action: "reply_text", screen: "main_menu", data: { text: menuText } }];
      return deterministicTurn({ actions, textRendering: menuText, stage: "greeting", intent: "greeting" });
    }

    // 2) Menu picks — taps (menu_* ids) or a typed 1-10 right after the menu.
    const menuSelection = resolveMenuSelection({
      body: payload.body,
      interactiveReplyId: payload.interactiveReplyId,
      currentScreen: conversation.current_screen,
    });
    let effectiveBody = payload.body;
    if (menuSelection === "menu_contact_office") {
      const reply = renderHandoffText({
        receptionPhone: knowledge.profile.reception_phone,
        openingHoursText: formatOpeningHours(knowledge.profile.opening_hours) ?? knowledge.profile.timings,
      });
      return deterministicTurn({
        actions: [{ action: "handoff", screen: "handoff", data: { reason: "explicit_request" } }],
        textRendering: reply,
        stage: "handoff",
        humanHandoff: true,
        handoffReason: "explicit_request",
        intent: "talk_to_human",
      });
    } else if (menuSelection === "menu_location") {
      const lines = [
        `📍 ${knowledge.profile.name}`,
        knowledge.profile.address,
        knowledge.profile.maps_url,
        "See you soon!",
      ].filter((line): line is string => Boolean(line));
      return deterministicTurn({
        actions: [
          {
            action: "show_location",
            screen: "school_location",
            data: { schoolName: knowledge.profile.name, address: knowledge.profile.address, mapsUrl: knowledge.profile.maps_url },
          },
        ],
        textRendering: lines.join("\n"),
        stage: "faq",
        intent: "location",
      });
    } else if (menuSelection === "menu_school_timings") {
      // Just the fact — no "would you like to book?" tacked on. Every menu
      // answer ending with the same booking nudge read as robotic nagging
      // (product feedback 2026-07-18); the menu is always one tap away.
      const hours = formatOpeningHours(knowledge.profile.opening_hours) ?? knowledge.profile.timings;
      const reply = hours
        ? `We are open: ${hours}.`
        : "Our office will share the timings with you soon.";
      return deterministicTurn({
        actions: [{ action: "reply_text", screen: "faq_answer", data: { text: reply } }],
        textRendering: reply,
        stage: "faq",
        intent: "school_timings",
      });
    } else if (menuSelection === "menu_ask_anything") {
      const reply = "Sure — go ahead and type your question.";
      return deterministicTurn({
        actions: [{ action: "reply_text", screen: "free_text", data: { text: reply } }],
        textRendering: reply,
        stage: "greeting",
        intent: "general_enquiry",
      });
    } else if (menuSelection === "menu_transport") {
      // Sends the school's bus routes/schedule PDF when one is configured
      // (school_assets, 0014_school_assets.sql) — the channel adapter only
      // renders an already-resolved fileUrl, it never decides whether one
      // exists (DECISION_ENGINE.md §4). Falls back to the transport FAQ text
      // exactly like every other menu item when no PDF is configured yet —
      // never invent a file that doesn't exist (CLAUDE.md §5).
      const faq = knowledge.faqs.find((f) => f.category === "transport");
      const fallbackText = faq ? faq.answer : "Our office will share these details with you.";
      const asset = await getSchoolAsset(schoolId, TRANSPORT_PDF_ASSET_KEY);
      const actions: Action[] = asset
        ? [
            {
              action: "send_pdf",
              screen: "faq_answer",
              data: {
                assetKey: TRANSPORT_PDF_ASSET_KEY,
                fileUrl: asset.file_url,
                filename: asset.filename,
                caption: asset.caption ?? fallbackText,
                fallbackText,
              },
            },
          ]
        : [{ action: "reply_text", screen: "faq_answer", data: { text: fallbackText } }];
      return deterministicTurn({
        actions,
        textRendering: asset?.caption ?? fallbackText,
        stage: "faq",
        intent: "transport",
      });
    } else if (menuSelection === "menu_fee_structure") {
      // Sends the school's fee structure PDF when one is configured
      // (school_assets, 0014_school_assets.sql) — same pattern as Transport
      // above. Falls back to the fee_structure FAQ text exactly like every
      // other menu item when no file is configured yet — never invent a
      // file that doesn't exist (CLAUDE.md §5).
      const faq = knowledge.faqs.find((f) => f.category === "fee_structure");
      const fallbackText = faq ? faq.answer : "Our office will share these details with you.";
      const asset = await getSchoolAsset(schoolId, FEE_STRUCTURE_ASSET_KEY);
      const actions: Action[] = asset
        ? [
            {
              action: "send_pdf",
              screen: "faq_answer",
              data: {
                assetKey: FEE_STRUCTURE_ASSET_KEY,
                fileUrl: asset.file_url,
                filename: asset.filename,
                caption: asset.caption ?? fallbackText,
                fallbackText,
              },
            },
          ]
        : [{ action: "reply_text", screen: "faq_answer", data: { text: fallbackText } }];
      return deterministicTurn({
        actions,
        textRendering: asset?.caption ?? fallbackText,
        stage: "faq",
        intent: "fee_structure",
      });
    } else if (menuSelection && FAQ_MENU_ITEMS[menuSelection]) {
      // Each mirrors a school_faqs category 1:1 (0012_rename_clinic_to_school.sql).
      // Fact not configured yet → say so rather than invent one (CLAUDE.md §5
      // "Never invent").
      const { category, intent } = FAQ_MENU_ITEMS[menuSelection];
      const faq = knowledge.faqs.find((f) => f.category === category);
      const reply = faq ? faq.answer : "Our office will share these details with you.";
      return deterministicTurn({
        actions: [{ action: "reply_text", screen: "faq_answer", data: { text: reply } }],
        textRendering: reply,
        stage: "faq",
        intent,
      });
    } else if (menuSelection === "menu_admission_enquiry") {
      // Admission Desk sub-menu (redesigned 2026-07-23) — see
      // lib/decision-engine/admissionMenu.ts. Fully deterministic; the
      // conversational AI qualifying flow is no longer the entry point here.
      const textRendering = renderAdmissionMenuText();
      const actions: Action[] = knowledge.profile.interactive_enabled
        ? [renderAdmissionMenu()]
        : [{ action: "reply_text", screen: "admission_menu", data: { text: textRendering } }];
      return deterministicTurn({ actions, textRendering, stage: "qualifying", intent: "admission_enquiry" });
    }

    // ── Admission Desk sub-flow (redesigned 2026-07-23) ───────────────────
    // Isolated from every other menu item — fully deterministic, no AI call
    // anywhere below. Reached only via menu_admission_enquiry above, which
    // shows the Admission Desk menu. See lib/decision-engine/admissionMenu.ts
    // for every screen's rendering and selection-resolution logic.
    const admissionSelectionInput = {
      body: payload.body,
      interactiveReplyId: payload.interactiveReplyId,
      currentScreen: conversation.current_screen,
    };

    /** Renders one Admission Desk screen, respecting interactive_enabled — mirrors the show_list/text dual-path pattern used everywhere else in this file. */
    const admissionScreenTurn = (params: {
      interactive: Extract<Action, { action: "show_list" }> | null;
      text: string;
      screen: Action["screen"];
      collected?: CollectedSlots;
      humanHandoff?: boolean;
      handoffReason?: HandoffReason | null;
    }) => {
      const actions: Action[] =
        knowledge.profile.interactive_enabled && params.interactive
          ? [params.interactive]
          : [{ action: "reply_text", screen: params.screen, data: { text: params.text } }];
      return deterministicTurn({
        actions,
        textRendering: params.text,
        stage: "qualifying",
        collected: params.collected,
        humanHandoff: params.humanHandoff,
        handoffReason: params.handoffReason,
        intent: "admission_enquiry",
      });
    };

    /** Shows the real Main Menu — used both for the Admission Desk's own "Back to Main Menu" item AND every sub-screen's plain "Back" (product decision 2026-07-23: one tap home from anywhere in the Admission Desk, not a nested up-one-level). */
    const renderMainMenuScreen = () => {
      const persistedName = persisted?.name ? String(persisted.name) : payload.contactName;
      const menuText = renderMainMenuText({ schoolName: knowledge.profile.name, parentName: persistedName });
      const actions: Action[] = knowledge.profile.interactive_enabled
        ? [renderMainMenu({ schoolName: knowledge.profile.name, parentName: persistedName })]
        : [{ action: "reply_text", screen: "main_menu", data: { text: menuText } }];
      return deterministicTurn({ actions, textRendering: menuText, stage: "greeting", intent: "greeting" });
    };

    const startAdmissionOfficeCollection = () => {
      // Direct contact number + hours alongside the enquiry collector, so a
      // parent who'd rather just call isn't only offered the WhatsApp form
      // (product decision 2026-07-23) — same phone/hours source as the main
      // "Contact School Office" handoff (lib/decision-engine/mainMenu.ts).
      const askText = renderAskParentNameText({
        receptionPhone: knowledge.profile.reception_phone,
        openingHoursText: formatOpeningHours(knowledge.profile.opening_hours) ?? knowledge.profile.timings,
      });
      return admissionScreenTurn({ interactive: null, text: askText, screen: "admission_collect_parent_name" });
    };

    // 1) Top-level Admission Desk menu picks — each info item is a single,
    // terminal text reply (product decision 2026-07-24): no follow-on
    // "Continue"/"Need help?" list chaining one screen into the next, which
    // left parents stuck in an endless menu-in-menu loop with no ending
    // point. The parent can always type "menu" or ask a follow-up question.
    const admSelection = resolveAdmissionMenuSelection(admissionSelectionInput);
    if (admSelection === "adm_back_main") {
      return renderMainMenuScreen();
    } else if (admSelection === "adm_open") {
      return admissionScreenTurn({ interactive: null, text: renderAdmissionStatusText(), screen: "admission_open_result" });
    } else if (admSelection === "adm_process") {
      return admissionScreenTurn({ interactive: null, text: renderAdmissionProcessText(), screen: "admission_process" });
    } else if (admSelection === "adm_documents") {
      return admissionScreenTurn({ interactive: null, text: renderRequiredDocumentsText(), screen: "admission_documents" });
    } else if (admSelection === "adm_talk_office") {
      return startAdmissionOfficeCollection();
    }

    // 2) "Talk to Admission Office" — one question at a time, no AI call.
    if (conversation.current_screen === "admission_collect_parent_name") {
      const name = payload.body.trim();
      if (!name) {
        return admissionScreenTurn({
          interactive: null,
          text: `Sorry, I didn't catch that.\n\nWhat is your name?`,
          screen: "admission_collect_parent_name",
        });
      }
      return admissionScreenTurn({ interactive: null, text: ASK_STUDENT_NAME_TEXT, screen: "admission_collect_student_name", collected: { name } });
    }
    if (conversation.current_screen === "admission_collect_student_name") {
      const childName = payload.body.trim();
      if (!childName) {
        return admissionScreenTurn({ interactive: null, text: `Sorry, I didn't catch that. ${ASK_STUDENT_NAME_TEXT}`, screen: "admission_collect_student_name" });
      }
      return admissionScreenTurn({
        interactive: renderAskClass(knowledge.services),
        text: renderAskClassText(knowledge.services),
        screen: "admission_collect_class",
        collected: { child_name: childName },
      });
    }
    if (conversation.current_screen === "admission_collect_class") {
      const sel = resolveAskClassSelection(knowledge.services, admissionSelectionInput);
      let gradeApplyingFor: string | null = null;
      if (sel?.startsWith(ADM_COLLECT_CLASS_PREFIX)) {
        const service = knowledge.services.find((s) => s.service_key === sel.slice(ADM_COLLECT_CLASS_PREFIX.length));
        gradeApplyingFor = service?.display_name ?? null;
      } else if (!payload.interactiveReplyId && payload.body.trim()) {
        // No picker match — accept a free-typed class name as-is rather than
        // forcing the parent back through the list (PATIENT_EXPERIENCE.md §6.2
        // "every tap has a typed equivalent" — this is the reverse case, every
        // typed answer is also accepted even off-list).
        gradeApplyingFor = payload.body.trim();
      }
      if (gradeApplyingFor) {
        return admissionScreenTurn({ interactive: null, text: ASK_MESSAGE_TEXT, screen: "admission_collect_message", collected: { grade_applying_for: gradeApplyingFor } });
      }
      return admissionScreenTurn({
        interactive: renderAskClass(knowledge.services),
        text: `Sorry, I didn't catch that. ${renderAskClassText(knowledge.services)}`,
        screen: "admission_collect_class",
      });
    }
    if (conversation.current_screen === "admission_collect_message") {
      const raw = payload.body.trim();
      const message = isSkipMessage(raw) || !raw ? null : raw;
      const collectedSoFar = conversation.collected_slots as CollectedSlots;
      const parentName = collectedSoFar.name ? String(collectedSoFar.name) : payload.contactName ?? "Parent";
      const childName = collectedSoFar.child_name ? String(collectedSoFar.child_name) : "";
      const gradeApplyingFor = collectedSoFar.grade_applying_for ? String(collectedSoFar.grade_applying_for) : null;

      await insertAdmissionOfficeEnquiry({
        schoolId,
        parentId: parent.id,
        conversationId: conversation.id,
        name: parentName,
        childName,
        gradeApplyingFor,
        mobile: parent.wa_phone,
        message,
      });

      return deterministicTurn({
        actions: [{ action: "reply_text", screen: "admission_enquiry_confirmation", data: { text: ADMISSION_ENQUIRY_CONFIRMATION_TEXT } }],
        textRendering: ADMISSION_ENQUIRY_CONFIRMATION_TEXT,
        stage: "handoff",
        humanHandoff: true,
        handoffReason: "explicit_request",
        collected: message ? { enquiry_details: message } : {},
        intent: "admission_enquiry",
      });
    }
    // ── end Admission Desk sub-flow ────────────────────────────────────────

    // 3) Confirmation-button taps (from the slot-tap confirm step below).
    //    confirm_slot_<id> carries the exact slot id — stateless, same trick
    //    as list rows. change_slot re-opens the picker conversationally.
    let confirmedTapSlotId: string | null = null;
    if (payload.interactiveReplyId?.startsWith("confirm_slot_")) {
      confirmedTapSlotId = payload.interactiveReplyId.slice("confirm_slot_".length);
      effectiveBody = "Confirm my visit";
    } else if (payload.interactiveReplyId === "change_slot") {
      effectiveBody = "Please show me other available times";
    }

    // 4) Day pick (tap on day_<date>) → that day's times as a tappable list.
    //    Day-first booking (PATIENT_EXPERIENCE.md §5): the parent chose a
    //    day from the day picker; show ONLY that day's free times.
    //    Deterministic — no AI call.
    let tappedDayKey = payload.interactiveReplyId ? parseDayRowId(payload.interactiveReplyId) : null;
    // Typed equivalent: "Saturday" / "today" typed right after the day
    // picker resolves like a tap — WITHOUT this, a typed day-only reply
    // has no time to parse, falls to the generic flow, and the parent
    // gets the day picker again in a loop (PATIENT_EXPERIENCE.md §6.2).
    if (!tappedDayKey && conversation.current_screen === "day_picker" && !/\d/.test(payload.body)) {
      tappedDayKey = resolveTypedDay({
        text: effectiveBody,
        timezone: knowledge.profile.timezone,
        now: new Date(),
      });
    }
    if (tappedDayKey && knowledge.profile.auto_confirm_enabled) {
      const daySlots = await listAvailableSlots({ schoolId, dayKey: tappedDayKey });
      if (daySlots && daySlots.length > 0) {
        const dayLabel = daySlots[0]!.label.split(" – ")[0]!;
        const leadIn = `Times for ${dayLabel} — which works for you?`;
        const textRendering = `${leadIn}\n\n${daySlots.map((s) => `• ${s.label}`).join("\n")}\n\nWant a different time? Just type it (e.g. 6 pm).`;
        return deterministicTurn({
          actions: [{ action: "show_calendar_slots", screen: "slot_picker", data: { leadIn, slots: daySlots } }],
          textRendering,
          stage: "booking",
          collected: { preferred_date: dayLabel },
          bookingStatus: transitionBookingStatus(conversation.booking_status, "waiting_for_confirmation"),
          intent: "book_visit",
        });
      }
      if (daySlots) {
        // That day filled up between the picker and the tap — re-offer days.
        const days = await listOpenDays(schoolId);
        if (days && days.length > 0) {
          const text = `Sorry, that day is now full.\n\n${renderDayPickerText(days)}`;
          const actions = translateTurnToActions({
            finalReply: text,
            presentedSlots: null,
            interactiveEnabled: knowledge.profile.interactive_enabled,
            presentedDays: days,
          });
          return deterministicTurn({ actions, textRendering: text, stage: "booking", intent: "book_visit" });
        }
        const text =
          "Sorry, that day is now full, and no other days are open this week. Our staff will message you soon with new times.";
        return deterministicTurn({
          actions: [{ action: "reply_text", screen: "booking_failed", data: { text } }],
          textRendering: text,
          stage: "booking",
          intent: "book_visit",
        });
      }
      // daySlots === null → calendar connection is down; fall through to the
      // AI/legacy flow rather than dead-ending the tap.
    }
    // ── end deterministic screens; the AI takes it from here ─────────────

    // Only check real availability once the conversation has already reached
    // the booking stage (i.e. qualifying is done) and the school has opted
    // into calendar-checked auto-confirmation. getSchedulingProvider returns
    // null if no calendar is connected/working, which naturally falls back
    // to the legacy free-text flow below — see
    // /docs/GOOGLE_CALENDAR_INTEGRATION.md §2, §6, §10.
    //
    // requestedTarget resolves the parent's CURRENT message into an exact
    // date/time when unambiguous ("today"/"tomorrow" + a clear AM/PM time).
    // Production bug this fixes: listAvailableSlots used to always return
    // the chronologically-earliest slots with zero awareness of what was
    // actually requested, so "tomorrow 5pm" could be silently resolved
    // against today's earliest slots instead. See
    // /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7.
    let availableSlots: SchedulingSlot[] | null = null;
    let requestedTarget: DateTime | null = null;
    let schoolTimezone: string | null = null;
    // Production bug this gate-widening fixes: slots were fetched ONLY when
    // the conversation was already at stage "booking" when the turn started
    // — but a parent's FIRST booking message ("I want to book a visit for
    // today 7 pm") arrives while the stage is still greeting/faq, so that
    // turn had no availability data, the model set presenting_slots anyway,
    // and the parent got the dead-end "let me check our calendar" fallback
    // with no follow-up ever coming. Fetch availability whenever the current
    // message itself clearly signals booking intent (mentions booking words
    // or resolves to a concrete date/time), not just when the persisted
    // stage already caught up.
    const currentMessageSignalsBooking =
      /\b(book|visit|appointment|slot|schedule|reschedul|confirm)/i.test(effectiveBody) ||
      Boolean(payload.interactiveReplyId) ||
      resolveRequestedDateTime({
        text: effectiveBody,
        timezone: knowledge.profile.timezone,
        now: new Date(),
      }) !== null;
    if ((conversation.stage === "booking" || currentMessageSignalsBooking) && knowledge.profile.auto_confirm_enabled) {
      const provider = await getSchedulingProvider(schoolId);
      if (provider) {
        // Production bug this fixes: once a specific slot has been offered,
        // a parent confirming it ("Confirm it", "Yes", "Ok") mentions no
        // day/time at all, so resolveRequestedDateTime(payload.body) returns
        // null — which silently fell back to "today's earliest slots" and
        // dropped the slot the parent was actually confirming. The model
        // then had no valid selected_slot_id to book against and stalled in
        // an "I'll confirm with our team" loop forever. Falling back to the
        // already-collected preferred_date/preferred_time (captured earlier
        // this same booking) re-resolves the same target the offer was
        // built from. See collectedPreferredDate/Time in the diagnostics log
        // below, which already surfaced this gap without acting on it.
        const collectedSlots = conversation.collected_slots as CollectedSlots | undefined;
        let requestHint = effectiveBody;
        const bodyResolves =
          resolveRequestedDateTime({
            text: effectiveBody,
            timezone: knowledge.profile.timezone,
            now: new Date(),
          }) !== null;
        // Day-first flow: "6 pm" typed AFTER picking Saturday means Saturday
        // 6 pm — a bare time parses as "today", which would silently switch
        // the day the parent just chose. If the message states a time but
        // no day, the day they already picked wins.
        const bodyMentionsDay =
          /\b(today|tomorrow|now|mon|tue|wed|thu|fri|sat|sun)\w*\b/i.test(effectiveBody) ||
          /\d{1,2}[/\-]\d{1,2}/.test(effectiveBody);
        // The remembered-preferences fallback exists for CONTINUATION turns
        // ("yes confirm it", a bare "6 pm" after picking a day) — i.e. only
        // while an offer is actually awaiting the parent's answer. A fresh
        // booking request must never inherit an old preference — production
        // bug: "Admission Enquiry" tapped hours after an earlier test reused
        // "Today 7:00 PM" and skipped the day picker.
        const offerAwaitingAnswer = conversation.booking_status === "waiting_for_confirmation";
        if (
          offerAwaitingAnswer &&
          !bodyResolves &&
          (collectedSlots?.preferred_date || collectedSlots?.preferred_time)
        ) {
          requestHint = `${collectedSlots?.preferred_date ?? ""} ${collectedSlots?.preferred_time ?? ""}`.trim();
        } else if (offerAwaitingAnswer && bodyResolves && !bodyMentionsDay && collectedSlots?.preferred_date) {
          requestHint = `${collectedSlots.preferred_date} ${effectiveBody}`;
        }

        availableSlots = await provider.listAvailableSlots({ requestHint });
        logger.info("Loaded available slots", { count: availableSlots.length, ms: elapsed() });

        schoolTimezone = knowledge.profile.timezone;
        requestedTarget = resolveRequestedDateTime({
          text: requestHint,
          timezone: knowledge.profile.timezone,
          now: new Date(),
        });
      }
    }
    // 5) Slot-row tap → CONFIRMATION BUTTONS, not an instant booking
    //    (PATIENT_EXPERIENCE.md §4 booking_confirmation moment). The tapped
    //    label's date/time is merged into collected state so a typed
    //    "confirm"/"yes" resolves to the same slot as tapping [Confirm].
    //    Deterministic — no AI call. Only for interactive schools; only for
    //    raw slot-row taps (confirm_slot_* taps continue below and book).
    if (
      knowledge.profile.interactive_enabled &&
      payload.interactiveReplyId &&
      !confirmedTapSlotId &&
      availableSlots !== null
    ) {
      const tappedRow = availableSlots.find((slot) => slot.id === payload.interactiveReplyId);
      if (tappedRow) {
        const confirmText = `Book ${tappedRow.label}?`;
        const textRendering = `${confirmText}\n\nReply "confirm" to book it, or "change" to see other times.`;
        return deterministicTurn({
          actions: [
            {
              action: "show_buttons",
              screen: "booking_confirmation",
              data: {
                text: confirmText,
                buttons: [
                  { id: `confirm_slot_${tappedRow.id}`, title: "Confirm" },
                  { id: "change_slot", title: "Pick another time" },
                ],
              },
            },
          ],
          textRendering,
          stage: "booking",
          collected: { preferred_date: tappedRow.label.split(" – ")[0], preferred_time: tappedRow.label.split(" – ")[1] },
          bookingStatus: transitionBookingStatus(conversation.booking_status, "waiting_for_confirmation"),
          intent: "book_visit",
        });
      }
    }

    const availableSlotsBlock =
      availableSlots !== null ? renderAvailableSlotsBlock(availableSlots) : undefined;

    // Requirement: debug logging showing requested date/time, parsed
    // datetime, and the slots actually returned — see
    // /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7/§8.
    logger.info("Booking request diagnostics", {
      parentMessage: effectiveBody,
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
      schoolName: knowledge.profile.name,
      knowledgeBlock,
      collectedInfoBlock,
      availableSlotsBlock,
      history,
      newMessage: effectiveBody,
    });

    let output: AiOutput;
    try {
      try {
        const raw = await generateReceptionistReply(messages);
        output = parseAiOutput(raw);
      } catch (error) {
        // A malformed output is usually one-off model noise, not a prompt
        // bug — regenerate once before treating it as a real failure.
        // (generateReceptionistReply already retries transient HTTP errors
        // internally; this extra pass covers parse-level failures.)
        if (!(error instanceof AiOutputParseError)) throw error;
        logger.error("AI output failed to parse — regenerating once", { error: error.message });
        const raw = await generateReceptionistReply(messages);
        output = parseAiOutput(raw);
      }
    } catch (error) {
      logger.error("Reply generation/parse failed after retries", {
        error: error instanceof AiOutputParseError ? error.message : String(error),
      });
      // Production incident ("Monday 10am"): a transient failure here used
      // to fail closed to "staff will help you soon" even though the
      // pipeline had ALREADY verified the exact requested slot was free —
      // ejecting a mid-booking parent for no parent-visible reason. When
      // we hold real availability data and the message trips no safety
      // pattern, degrade to deterministically presenting the real slots
      // (zero model involvement, nothing invented) instead of handing off.
      // Safety-flagged or data-less turns still fail closed to staff.
      if (detectSafetyOverride(effectiveBody)) {
        // Safety-flagged content with no reviewed reply available — the only
        // correct move is a real human.
        output = fallbackHandoffOutput();
      } else if (availableSlots !== null && availableSlots.length > 0) {
        logger.info("Degrading to deterministic slot presentation instead of handoff");
        output = {
          reply: "Here are the open times:",
          intent: "book_visit",
          collected: {},
          enquiry_request: null,
          booking_selection: null,
          presenting_slots: true,
          human_handoff: false,
          handoff_reason: null,
        };
      } else {
        // Transient failure on an ordinary message — ask the parent to
        // repeat rather than escalate. Staff are never pulled into normal
        // FAQ/booking traffic; a human handoff needs an explicit request or
        // a safety signal, not an HTTP hiccup.
        logger.info("Degrading to a re-ask instead of handoff (no safety signal)");
        output = {
          reply: "Sorry, I didn't catch that. Could you type it once more?",
          intent: "unknown",
          collected: {},
          enquiry_request: null,
          booking_selection: null,
          presenting_slots: false,
          human_handoff: false,
          handoff_reason: null,
        };
      }
    }
    logger.info("Generated AI reply", { ms: elapsed() });

    output = applySafetyOverride(effectiveBody, output);

    // Prompt-level guardrail backed up in code, per CLAUDE.md §3 ("never rely
    // on the model alone"): these two paths are meant to be mutually
    // exclusive, but a model that ignores the instruction and populates both
    // would otherwise create a duplicate legacy admission_enquiries row
    // alongside the real calendar booking. booking_selection wins because
    // it's calendar-verified; enquiry_request is not.
    if (output.enquiry_request && output.booking_selection) {
      logger.error("Model returned both enquiry_request and booking_selection", {
        intent: output.intent,
      });
      output = { ...output, enquiry_request: null };
    }

    // Prompt-level guardrail backed up in code: the model has, in testing,
    // populated enquiry_request with blank placeholder strings before it
    // actually had the parent's details (e.g. mid-qualifying, before a name
    // was even given). Inserting that would create a garbage
    // admission_enquiries row — require every field to be genuinely filled.
    if (
      output.enquiry_request &&
      (!output.enquiry_request.name.trim() ||
        !output.enquiry_request.preferred_date.trim() ||
        !output.enquiry_request.preferred_time.trim() ||
        !output.enquiry_request.reason.trim())
    ) {
      logger.error("Model returned an incomplete enquiry_request — dropping it", {
        enquiryRequest: output.enquiry_request,
      });
      output = { ...output, enquiry_request: null };
    }

    // V2 interactive: the parent TAPPED a slot row (Meta echoed back the
    // exact id we sent). If the model didn't turn that tap into a
    // booking_selection itself, synthesize one — a physical tap on an
    // offered slot is the least ambiguous booking signal possible, and it
    // must never be lost to model noise. Requires the parent's name to
    // already be collected (the prompt gates slot offers on name+reason).
    const effectiveTapSlotId = confirmedTapSlotId ?? payload.interactiveReplyId ?? null;
    const tappedSlot = effectiveTapSlotId
      ? availableSlots?.find((slot) => slot.id === effectiveTapSlotId)
      : undefined;
    if (tappedSlot && !output.booking_selection && !output.human_handoff) {
      const persisted = conversation.collected_slots as CollectedSlots | undefined;
      const name = output.collected.name ?? persisted?.name;
      const reason =
        output.collected.reason ?? output.collected.enquiry_details ?? persisted?.reason ?? persisted?.enquiry_details;
      if (name) {
        logger.info("Synthesizing booking_selection from tapped slot row", {
          tappedSlotId: tappedSlot.id,
          tappedLabel: tappedSlot.label,
        });
        output = {
          ...output,
          enquiry_request: null,
          booking_selection: {
            name: String(name),
            reason: String(reason ?? "Admission enquiry"),
            selected_slot_id: tappedSlot.id,
          },
        };
      }
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
    // The slots behind whatever bullet list finalReply ends up containing —
    // for interactive schools these render as a tappable WhatsApp list
    // (translateTurnToActions) instead of text bullets. Set alongside every
    // finalReply assignment that renders a slot list.
    let presentedSlots: SchedulingSlot[] | null = null;
    // True when the list follows a failed booking (screen: booking_failed).
    let presentedSlotsAfterFailure = false;
    // Day options when this turn asks "which day?" instead of listing times
    // (day-first booking, PATIENT_EXPERIENCE.md §5).
    let presentedDays: DayOption[] | null = null;

    // Prompt-level guardrail backed up in code: observed in production —
    // the model fabricated an entire fake slot list (a past time, and times
    // on a day the school is closed) instead of faithfully relaying
    // <available_slots>. The model's own free-text slot list can never be
    // trusted; whenever it signals it's presenting times, replace its reply
    // with a deterministic rendering of the real data. See
    // /docs/GOOGLE_CALENDAR_INTEGRATION.md §6.
    if (output.presenting_slots) {
      if (availableSlots !== null) {
        // If the parent asked for a specific date/time, say so explicitly
        // when it's not exactly available, rather than a generic "here's
        // what's open" — matches the "requested slot unavailable" framing
        // required per /docs/GOOGLE_CALENDAR_INTEGRATION.md §6/§7.
        const exactMatchShown =
          requestedTarget !== null &&
          availableSlots.some((slot) => slot.startsAt === requestedTarget!.toUTC().toISO());
        if (requestedTarget && schoolTimezone && !exactMatchShown) {
          finalReply = renderRequestedSlotUnavailable(
            formatRequestedLabel(requestedTarget, schoolTimezone, new Date()),
            availableSlots,
          );
          presentedSlots = availableSlots;
        } else if (
          !requestedTarget &&
          knowledge.profile.interactive_enabled &&
          !["slot_picker", "booking_confirmation"].includes(conversation.current_screen)
        ) {
          // Day-first booking (PATIENT_EXPERIENCE.md §5): the parent hasn't
          // named a day or time, so ask WHICH DAY before showing times —
          // only days with real free slots appear, so closed days (e.g.
          // Sunday) are impossible. A stated day/time still goes straight
          // to the exact/nearest time flow above; a parent already inside
          // a day's times never regresses back to the day picker.
          const days = await listOpenDays(schoolId);
          if (days && days.length > 1) {
            finalReply = renderDayPickerText(days);
            presentedDays = days;
          } else {
            finalReply = renderSlotsPresentation(availableSlots);
            presentedSlots = availableSlots;
          }
        } else {
          finalReply = renderSlotsPresentation(availableSlots);
          presentedSlots = availableSlots;
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
      !output.enquiry_request &&
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
      !output.enquiry_request &&
      !finalHumanHandoff &&
      availableSlotsBlock !== undefined
    ) {
      // Structural backstop, not a wording guess: while <available_slots> is
      // in play, the system prompt's contract gives the model exactly three
      // legal moves — presenting_slots, booking_selection, or a handoff.
      // Anything else is the model inventing its own status update, which is
      // exactly how "I'll confirm the exact slot now with our team" and
      // "I'm just confirming the 6:00 PM slot..." reached parents in
      // production without ever calling bookSlot(). A regex can only ever
      // catch phrasings seen before (CLAIMS_COMPLETION_PATTERN above already
      // needed broadening twice for that reason); this catches all of them by
      // construction. Re-show the real live options rather than let a
      // fabricated "checking..." reply through.
      //
      // Day-first applies here too (self-test finding 2026-07-18: this
      // branch fired on the qualifying-done turn and pushed a TIME list,
      // bypassing the day picker) — but never regress to the day picker
      // when the parent is already inside a day's times or a confirm step.
      logger.error("Model produced a non-actionable reply while slots were offered — replacing with real options", {
        reply: output.reply,
      });
      const midTimeSelection = ["slot_picker", "booking_confirmation"].includes(conversation.current_screen);
      let backstopDays: DayOption[] | null = null;
      if (knowledge.profile.interactive_enabled && !requestedTarget && !midTimeSelection) {
        backstopDays = await listOpenDays(schoolId);
      }
      if (backstopDays && backstopDays.length > 1) {
        finalReply = renderDayPickerText(backstopDays);
        presentedDays = backstopDays;
      } else {
        finalReply = renderSlotsPresentation(availableSlots ?? []);
        presentedSlots = availableSlots;
      }
    }

    if (output.booking_selection && !finalHumanHandoff) {
      const bookingSelection = output.booking_selection;
      const provider = await getSchedulingProvider(schoolId);

      // Production incident (2026-07-04, "Today 7.pm"): the parser resolved
      // the time perfectly and the exact slot was free, but the model echoed
      // a corrupted slot id — the old direct id lookup found nothing,
      // bookSlot was called with garbage, and the parent was told the time
      // was "just taken" when it never was. resolveSelectedSlot recovers
      // deterministically from the PARENT'S own stated time when it
      // identifies exactly one offered slot; anything ambiguous stays
      // unresolved and is re-presented, never guessed.
      const resolution = resolveSelectedSlot({
        selectedSlotId: bookingSelection.selected_slot_id,
        availableSlots: availableSlots ?? [],
        requestedTargetUtcIso: requestedTarget?.toUTC().toISO() ?? null,
        messageText: effectiveBody,
        tappedSlotId: effectiveTapSlotId,
      });
      const candidateSlot = resolution.kind === "unresolved" ? undefined : resolution.slot;
      if (resolution.kind === "recovered") {
        logger.error("Model echoed an unknown slot id — recovered from the parent's stated time", {
          modelSlotId: bookingSelection.selected_slot_id,
          recoveredSlotId: resolution.slot.id,
          recoveredLabel: resolution.slot.label,
        });
      }

      // Requirement: requested_slot must equal selected_slot before any
      // booking is attempted. Full day+time precision when we resolved a
      // specific target this turn; falls back to time-of-day-only when the
      // date was ambiguous (e.g. weekday names we don't parse). Either way,
      // a mismatch aborts the booking — it is never silently overridden to
      // "the first/nearest available slot". A physical TAP is exempt: the
      // parent selected the row itself, and the "message text" is just the
      // row title Meta echoed back — there is nothing to cross-check.
      let mismatch = false;
      if (resolution.kind === "tapped") {
        mismatch = false;
      } else if (candidateSlot && requestedTarget) {
        mismatch = candidateSlot.startsAt !== requestedTarget.toUTC().toISO();
      } else if (candidateSlot) {
        const mentionedTimes = extractTimeMentions(effectiveBody);
        mismatch = mentionedTimes.length > 0 && !slotMatchesTimeMention(candidateSlot, mentionedTimes);
      }

      logger.info("Booking selection validation", {
        requestedTargetIso: requestedTarget?.toUTC().toISO() ?? null,
        selectedSlotId: bookingSelection.selected_slot_id,
        resolution: resolution.kind,
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
        finalReply = "Our school office will confirm this booking for you.\n\nThey will message you soon.";
        logger.error("Scheduling provider unavailable at booking time", { schoolId });
        logger.info("Booking Completed", { conversationId: conversation.id, outcome: "failed", reason: "provider_unavailable" });
      } else if (!candidateSlot) {
        // The model's id is unknown AND the parent's words don't identify
        // exactly one offered slot — never call bookSlot with an id we can't
        // verify, and never claim the time was "taken". Ask again with the
        // real list.
        logger.error("booking_selection id unknown and unrecoverable — re-presenting slots", {
          modelSlotId: bookingSelection.selected_slot_id,
          body: payload.body,
        });
        finalReply = renderSlotsPresentation(availableSlots ?? []);
        presentedSlots = availableSlots;
      } else if (mismatch) {
        // Observed in production: the model resolved a parent's clearly
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
          requestedTarget && schoolTimezone
            ? renderRequestedSlotUnavailable(
                formatRequestedLabel(requestedTarget, schoolTimezone, new Date()),
                availableSlots ?? [],
              )
            : renderSlotsPresentation(availableSlots ?? []);
        presentedSlots = availableSlots;
      } else {
        // Atomic claim, not a read-then-write check: two near-simultaneous
        // inbound messages (e.g. the parent double-tapping "Confirm") each
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
            "We are still booking your visit.\n\nYou don't need to do anything — we will message you as soon as it is done.";
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

          // candidateSlot.id, not the model's raw echo — identical in the
          // normal case, and the verified recovered id when the model
          // garbled its echo (see resolveSelectedSlot above).
          const bookingResult = await provider.bookSlot({
            slotId: candidateSlot.id,
            parentId: parent.id,
            conversationId: conversation.id,
            name: bookingSelection.name,
            mobile: parent.wa_phone,
            reason: bookingSelection.reason,
            waMessageId: payload.waMessageId,
          });
          if (bookingResult.ok) {
            bookingSucceeded = true;
            currentBookingStatus = transitionBookingStatus(currentBookingStatus, "confirmed");
            // Never trust the model's own free-text date/time claim — always
            // state the real, verified slot so a wrong-slot-id mismatch is
            // immediately visible to the parent instead of silently wrong.
            finalReply = renderBookingConfirmation({
              slot: bookingResult.slot,
              schoolName: knowledge.profile.name,
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
            // "Just taken" ONLY when a real insert conflict proved someone
            // else got it (slot_taken). Any other failure must not accuse a
            // phantom parent of taking the slot — production incident: a
            // stale-selection failure was worded "just taken" while the
            // alternatives list showed the same time still open.
            finalReply =
              bookingResult.reason === "slot_taken"
                ? renderSlotConflictReply(bookingResult.alternatives)
                : renderSlotNotOpenReply(bookingResult.alternatives);
            presentedSlots = bookingResult.alternatives;
            presentedSlotsAfterFailure = true;
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
    // the same reply (e.g. explaining school hours while still mid-booking),
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
    // fresh offer this turn should now count as "awaiting the parent's yes".
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

    // Decision Engine migration step 1 (DECISION_ENGINE.md §6): the final
    // v1-shaped outcome is translated into an ordered action list and
    // rendered by the channel adapter. Text-only schools get exactly the
    // same plain text as before; interactive schools get slot offers as a
    // tappable list message (PATIENT_EXPERIENCE.md §7 rollout flag).
    const actions = translateTurnToActions({
      finalReply,
      presentedSlots,
      interactiveEnabled: knowledge.profile.interactive_enabled,
      bookingFailed: presentedSlotsAfterFailure,
      presentedDays,
    });

    // Independent writes/send — run concurrently. The outbound message row
    // (which needs the WhatsApp send result) is inserted right after.
    const [outboundMessageId] = await Promise.all([
      executeActionsOnWhatsApp({
        phoneNumberId: payload.phoneNumberId,
        to: payload.fromWaId,
        actions,
        textFallback: finalReply,
      }),
      updateConversationAfterTurn({
        conversationId: conversation.id,
        stage,
        mergedSlots,
        humanHandoff: finalHumanHandoff,
        handoffReason: finalHandoffReason,
        bookingStatus: finalBookingStatus,
        currentScreen: actions[actions.length - 1]?.screen,
      }),
      output.enquiry_request
        ? insertAdmissionEnquiry({
            schoolId,
            parentId: parent.id,
            conversationId: conversation.id,
            mobile: parent.wa_phone,
            payload: output.enquiry_request,
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
