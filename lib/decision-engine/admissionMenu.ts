import type { Action, ListRow } from "@/lib/decision-engine/types";
import type { SchoolService } from "@/lib/knowledge/types";

// The Admission Desk — a fully deterministic (no AI call) sub-flow reached
// only via the "Admission Enquiry" main-menu item. Isolated from every other
// menu item on purpose (product decision 2026-07-23): admissions is the
// highest-intent conversation a parent has, so it gets a guided, step-by-step
// experience with a maximum of 5-6 options per screen, mirroring how a real
// admission counselor would walk a parent through it — never more than one
// question per message, always a way back.
//
// Text-only schools get the exact same options as a numbered list (see the
// *Text() sibling of every render function below) — every tap here has a
// typed equivalent, same convention as lib/decision-engine/mainMenu.ts.
//
// Mobile-readability formatting rules (product decision 2026-07-23): short
// lines (max ~2 per paragraph), a blank line between every distinct idea/step
// (never a wall of text), bullets instead of comma-separated lists, and a
// "━━━" divider before a trailing call-to-action. Bold (*text*) marks real
// section headings only, via WhatsApp's single-asterisk markdown.

export const ADMISSION_MENU_ITEMS: ListRow[] = [
  { id: "adm_open", title: "Is Admission Open?", description: "Check current admission status" },
  { id: "adm_process", title: "Admission Process", description: "Steps to apply" },
  { id: "adm_documents", title: "Required Documents", description: "What to keep ready" },
  { id: "adm_talk_office", title: "Admission Office", description: "Talk to our admission team" },
  { id: "adm_back_main", title: "Back to Main Menu", description: "Return to the main menu" },
];

/**
 * "What's left to explore" continuation rows shown after each info screen
 * (product decision 2026-07-24) — every item AFTER `afterId` in the fixed
 * ADMISSION_MENU_ITEMS order, so "Is Admission Open?" offers 4 more options,
 * "Admission Process" offers 3, "Required Documents" offers 2, and starting
 * "Talk to Admission Office" offers just "Back to Main Menu". Reuses the SAME
 * row ids as ADMISSION_MENU_ITEMS, so a tap on any of them is already routed
 * correctly by the top-level admSelection check in replyPipeline.ts
 * regardless of which screen the parent is actually on — no separate tap
 * handling needed, only a per-screen typed-digit resolver for text-only
 * schools (see the resolve*ContinueSelection functions below).
 */
function continueMenuRows(afterId: string): ListRow[] {
  const index = ADMISSION_MENU_ITEMS.findIndex((item) => item.id === afterId);
  return ADMISSION_MENU_ITEMS.slice(index + 1);
}

/** Generic: resolves a tap or typed digit (1-N) against a known row list, only when currentScreen matches. Mirrors resolveMenuSelection in mainMenu.ts. */
export function resolveListSelection(params: {
  body: string;
  interactiveReplyId: string | null | undefined;
  currentScreen: string;
  expectedScreen: string;
  rows: ListRow[];
}): string | null {
  const rowIds = new Set(params.rows.map((r) => r.id));
  if (params.interactiveReplyId && rowIds.has(params.interactiveReplyId)) {
    return params.interactiveReplyId;
  }
  if (params.currentScreen === params.expectedScreen) {
    const digit = /^\s*(\d{1,2})\s*$/.exec(params.body);
    if (digit) {
      const index = parseInt(digit[1]!, 10) - 1;
      if (index >= 0 && index < params.rows.length) return params.rows[index]!.id;
    }
  }
  return null;
}

function renderListAction(params: { screen: Action["screen"]; text: string; buttonLabel: string; sectionTitle: string; rows: ListRow[] }): Extract<Action, { action: "show_list" }> {
  return {
    action: "show_list",
    screen: params.screen,
    data: { text: params.text, buttonLabel: params.buttonLabel, sections: [{ title: params.sectionTitle, rows: params.rows }] },
  };
}

function renderNumberedText(intro: string, rows: ListRow[], outro: string): string {
  const lines = rows.map((row, i) => `${i + 1}. ${row.title}`);
  return `${intro}\n\n${lines.join("\n")}\n\n${outro}`;
}

const DIVIDER = "━━━━━━━━━━━━━━";

/** Interactive-mode trailer: a divider, the "need help" heading, then a hint to tap the (already "Continue"-labeled) list button. */
function continueTrailer(heading: string): string {
  return `${DIVIDER}\n\n${heading}\n\nTap *Continue* below.`;
}

interface SelectionInput {
  body: string;
  interactiveReplyId: string | null | undefined;
  currentScreen: string;
}

/** Resolves a tap/digit against the top-level Admission Desk menu (ADMISSION_MENU_ITEMS). */
export function resolveAdmissionMenuSelection(params: SelectionInput): string | null {
  return resolveListSelection({ ...params, expectedScreen: "admission_menu", rows: ADMISSION_MENU_ITEMS });
}

// ── Admission Desk menu ─────────────────────────────────────────────────────

const ADMISSION_MENU_INTRO =
  "🎓 *Admission Enquiry*\n\n" +
  "Welcome to the Admission Desk.\n" +
  "I'd be happy to help you.\n\n" +
  "Please choose an option below.";

export function renderAdmissionMenu(): Extract<Action, { action: "show_list" }> {
  return renderListAction({ screen: "admission_menu", text: ADMISSION_MENU_INTRO, buttonLabel: "Admission Desk", sectionTitle: "Admission Desk", rows: ADMISSION_MENU_ITEMS });
}

export function renderAdmissionMenuText(): string {
  return renderNumberedText(ADMISSION_MENU_INTRO, ADMISSION_MENU_ITEMS, "Reply with a number, or just type your question.");
}

// ── Is Admission Open ───────────────────────────────────────────────────────
// Redesigned 2026-07-23: a single status message covering every category's
// admission window, replacing the old per-class picker (schools' admission
// windows are staggered by category, not a simple open/closed per class —
// see /docs for the source of these dates; update this block when the
// windows change for a new academic year).

/**
 * Rows are the school's currently-offered classes/programs (knowledge.services)
 * plus a Back row. `prefix` namespaces the row ids per picker context so a
 * tapped id is unambiguous by itself — never relies on currentScreen to
 * disambiguate which picker a tap belongs to, only to resolve a typed digit.
 *
 * NOTE: despite the id, "adm_back_admission_menu" now opens the MAIN menu,
 * not the Admission Desk menu (product decision 2026-07-23 — every "Back"
 * inside this sub-flow is one tap home, not a nested up-one-level). The id
 * itself is kept unchanged everywhere it's already used as a shared constant.
 */
function classPickerRows(services: SchoolService[], prefix: string): ListRow[] {
  return [
    ...services.slice(0, 9).map((s) => ({ id: `${prefix}${s.service_key}`, title: s.display_name })),
    { id: "adm_back_admission_menu", title: "Back" },
  ];
}

export const ADM_COLLECT_CLASS_PREFIX = "adm_collect_class_";

// "Admissions open for the upcoming year" (not "admission started for the up
// coming year") — product decision 2026-07-23: clearer, correctly spelled,
// same meaning.
const ADMISSIONS_OPEN_NOW = "Admissions open for the upcoming year.";

const ADMISSION_STATUS_BODY =
  "✅ *Admission Status*\n\n" +
  `🧑‍🏫 Kindergarten (Pre-KG, LKG, UKG) — ${ADMISSIONS_OPEN_NOW}\n\n` +
  `🎒 Primary School (Grades 1 to 5) — ${ADMISSIONS_OPEN_NOW}\n\n` +
  `🏫 Middle School (Grades 6 to 8) — ${ADMISSIONS_OPEN_NOW}\n\n` +
  "🎒 High School (Grades 9 & 10) — November to January.\n\n" +
  "🎓 Senior Secondary (Grades 11 & 12) — April to May.\n\n" +
  "(The Senior Secondary window opens immediately after Class 10 Board Exam results are announced.)";

export function renderAdmissionStatus(): Extract<Action, { action: "show_list" }> {
  return renderListAction({
    screen: "admission_open_result",
    text: `${ADMISSION_STATUS_BODY}\n\n${continueTrailer("How would you like to continue?")}`,
    buttonLabel: "Continue",
    sectionTitle: "Next step",
    rows: continueMenuRows("adm_open"),
  });
}

export function renderAdmissionStatusText(): string {
  return renderNumberedText(`${ADMISSION_STATUS_BODY}\n\nHow would you like to continue?`, continueMenuRows("adm_open"), "Reply with a number.");
}

export function resolveAdmissionOpenContinueSelection(params: SelectionInput): string | null {
  return resolveListSelection({ ...params, expectedScreen: "admission_open_result", rows: continueMenuRows("adm_open") });
}

// ── Admission Process ────────────────────────────────────────────────────────
// The school follows an OFFLINE admission process (product decision
// 2026-07-23) — no online application form, document upload, portal, or
// online payment link. This screen only ever explains the in-person steps;
// it never collects any admission details itself (that's the separate "Talk
// to Admission Office" flow, its own item on the Admission Desk menu).

const ADMISSION_PROCESS_BODY =
  "📋 *Admission Process*\n\n" +
  "Getting admission is simple.\n\n" +
  "Please follow these steps:\n\n" +
  "1️⃣ Collect the Admission Application Form from the school office.\n\n" +
  "2️⃣ Fill in the application form.\n\n" +
  "Submit it with the required documents.\n\n" +
  "3️⃣ The school reviews your application.\n\n" +
  "If needed, a parent meeting or student interaction may be scheduled.\n\n" +
  "4️⃣ After approval, complete the admission fee payment.\n\n" +
  "5️⃣ 🎉 Admission confirmed!";

export function renderAdmissionProcess(): Extract<Action, { action: "show_list" }> {
  return renderListAction({
    screen: "admission_process",
    text: `${ADMISSION_PROCESS_BODY}\n\n${continueTrailer("Need more help?")}`,
    buttonLabel: "Continue",
    sectionTitle: "Need further assistance?",
    rows: continueMenuRows("adm_process"),
  });
}

export function renderAdmissionProcessText(): string {
  return renderNumberedText(`${ADMISSION_PROCESS_BODY}\n\nNeed more help?`, continueMenuRows("adm_process"), "Reply with a number.");
}

export function resolveAdmissionProcessContinueSelection(params: SelectionInput): string | null {
  return resolveListSelection({ ...params, expectedScreen: "admission_process", rows: continueMenuRows("adm_process") });
}

// ── Required Documents ───────────────────────────────────────────────────────

const REQUIRED_DOCUMENTS_BODY =
  "📄 *Required Documents*\n\n" +
  "Please keep these documents ready:\n\n" +
  "• Birth Certificate\n\n" +
  "• Aadhaar Card\n\n" +
  "• Passport-size Photographs\n\n" +
  "• Transfer Certificate (if applicable)\n\n" +
  "• Previous Academic Mark Sheet (if applicable)";

export function renderRequiredDocuments(): Extract<Action, { action: "show_list" }> {
  return renderListAction({
    screen: "admission_documents",
    text: `${REQUIRED_DOCUMENTS_BODY}\n\n${continueTrailer("Need further assistance?")}`,
    buttonLabel: "Continue",
    sectionTitle: "Further assistance",
    rows: continueMenuRows("adm_documents"),
  });
}

export function renderRequiredDocumentsText(): string {
  return renderNumberedText(`${REQUIRED_DOCUMENTS_BODY}\n\nNeed further assistance?`, continueMenuRows("adm_documents"), "Reply with a number.");
}

export function resolveRequiredDocumentsContinueSelection(params: SelectionInput): string | null {
  return resolveListSelection({ ...params, expectedScreen: "admission_documents", rows: continueMenuRows("adm_documents") });
}

// ── Talk to Admission Office — one question at a time ───────────────────────

/**
 * Opens the "Talk to Admission Office" collector — includes a direct contact
 * number + hours when the school has one configured (schools.reception_phone),
 * so a parent who'd rather just call isn't only offered the WhatsApp form.
 * Never hardcoded: falls back to the plain opener for any school that hasn't
 * set a number. Mirrors renderHandoffText's phone/hours pattern in
 * mainMenu.ts (product decision 2026-07-23).
 */
function askParentNameBody(params: { receptionPhone: string | null; openingHoursText: string | null }): string {
  const lines = ["🙋 Sure, let's get your admission enquiry started."];
  if (params.receptionPhone) {
    lines.push("", `📞 You can also call our admission office directly at ${params.receptionPhone}.`);
    if (params.openingHoursText) {
      // openingHoursText may already be a full sentence (e.g. school-authored
      // schools.timings free text ending in its own period) — never double up.
      const hours = params.openingHoursText.trim().replace(/\.+$/, "");
      lines.push("", `🕒 We are available: ${hours}.`);
    }
  }
  lines.push("", "What is your name?");
  return lines.join("\n");
}

/** Interactive variant — adds the "Back to Main Menu" continuation option (product decision 2026-07-24) so a parent who opens the collector isn't stuck if they change their mind. */
export function renderAskParentName(params: { receptionPhone: string | null; openingHoursText: string | null }): Extract<Action, { action: "show_list" }> {
  return renderListAction({
    screen: "admission_collect_parent_name",
    text: `${askParentNameBody(params)}\n\n${continueTrailer("Changed your mind?")}`,
    buttonLabel: "Continue",
    sectionTitle: "Other options",
    rows: continueMenuRows("adm_talk_office"),
  });
}

export function renderAskParentNameText(params: { receptionPhone: string | null; openingHoursText: string | null }): string {
  return renderNumberedText(`${askParentNameBody(params)}\n\nChanged your mind?`, continueMenuRows("adm_talk_office"), "Reply with a number, or just type your name to continue.");
}

export function resolveAdmissionOfficeContinueSelection(params: SelectionInput): string | null {
  return resolveListSelection({ ...params, expectedScreen: "admission_collect_parent_name", rows: continueMenuRows("adm_talk_office") });
}
export const ASK_STUDENT_NAME_TEXT = "Thank you!\n\nWhat is your child's name?";
const ASK_CLASS_INTRO = "Which class are you applying for?";
export const ASK_MESSAGE_TEXT = "Any additional message for our admission office?\n\n(Optional — reply with your message, or type \"skip\".)";

export function renderAskClass(services: SchoolService[]): Extract<Action, { action: "show_list" }> | null {
  if (services.length === 0) return null;
  return renderListAction({ screen: "admission_collect_class", text: ASK_CLASS_INTRO, buttonLabel: "Select class", sectionTitle: "Classes", rows: classPickerRows(services, ADM_COLLECT_CLASS_PREFIX) });
}

export function renderAskClassText(services: SchoolService[]): string {
  if (services.length === 0) return `${ASK_CLASS_INTRO} (please type it)`;
  return renderNumberedText(ASK_CLASS_INTRO, classPickerRows(services, ADM_COLLECT_CLASS_PREFIX), "Reply with a number, or type the class name.");
}

/** Resolves a tap/digit against the class list shown during "Talk to Admission Office" collection. Returns null (not a picker match) when the parent just typed a free-text class name instead — callers should accept that as-is. */
export function resolveAskClassSelection(services: SchoolService[], params: SelectionInput): string | null {
  return resolveListSelection({ ...params, expectedScreen: "admission_collect_class", rows: classPickerRows(services, ADM_COLLECT_CLASS_PREFIX) });
}

export const ADMISSION_ENQUIRY_CONFIRMATION_TEXT =
  "✅ Thank you.\n\n" +
  "Your admission enquiry has been submitted successfully.\n\n" +
  "Our Admission Office will contact you shortly.\n\n" +
  "If you have any additional questions, simply send a message anytime.";

const SKIP_MESSAGE_PATTERN = /^(skip|no|none|n\/a|na)\.?$/i;

/** True if the parent's optional-message reply means "nothing to add" — stored as null rather than the literal word "skip". */
export function isSkipMessage(text: string): boolean {
  return SKIP_MESSAGE_PATTERN.test(text.trim());
}
