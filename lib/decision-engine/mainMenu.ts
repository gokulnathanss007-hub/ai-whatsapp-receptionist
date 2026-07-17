import type { Action, ListRow } from "@/lib/decision-engine/types";
import type { ClinicDoctor } from "@/lib/knowledge/types";

// The Main Menu — the product's front door (PATIENT_EXPERIENCE.md §3).
// Item ids are backend keys handled deterministically in the pipeline;
// titles/descriptions are the human labels. Static by design: menu items
// map 1:1 onto intents, and adding one is a product decision, not a
// per-clinic customization (clinic knowledge customizes the CONTENT each
// item answers with, never the menu shape).

export const MAIN_MENU_ITEMS: ListRow[] = [
  { id: "menu_book_appointment", title: "📅 Book Appointment", description: "Schedule your consultation" },
  { id: "menu_treatments", title: "💆 Treatments", description: "What we offer" },
  { id: "menu_consultation_fee", title: "💰 Consultation Fee", description: "Fee details" },
  { id: "menu_clinic_timings", title: "🕒 Clinic Timings", description: "Our open hours" },
  { id: "menu_location", title: "📍 Clinic Location", description: "Address and directions" },
  { id: "menu_talk_to_human", title: "👩 Talk to Receptionist", description: "Chat with our team" },
];

const MENU_ITEM_IDS = new Set(MAIN_MENU_ITEMS.map((item) => item.id));

// Deliberately strict: the whole message must be a greeting (plus emoji/
// punctuation), so "Hi, what's the fee?" NEVER gets a menu — a stated
// intent is always answered directly (PATIENT_EXPERIENCE.md §3 "do not
// show" rules).
const GREETING_ONLY_PATTERN =
  /^(hi+|hii+|hello+|hey+|hai|yo|vanakkam|namaste|namaskaram|good\s*(morning|afternoon|evening|night))[\s!.,🙏👋😊🙂❤️]*$/iu;

const MENU_REQUEST_PATTERN = /^(menu|main\s*menu|options?|show\s*menu|help|start)[\s!.]*$/i;

export function isGreetingOnly(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length <= 40 && GREETING_ONLY_PATTERN.test(trimmed);
}

export function isMenuRequest(text: string): boolean {
  return MENU_REQUEST_PATTERN.test(text.trim());
}

/**
 * Resolves an inbound message to a menu item id, or null.
 * - A tap: interactiveReplyId is a menu_* id.
 * - Typed digit 1-6: only honoured when the LAST screen shown was the menu
 *   (conversations.current_screen) — "2" during qualifying means an answer,
 *   not a menu pick. Every tap has a typed equivalent (§4.2).
 */
export function resolveMenuSelection(params: {
  body: string;
  interactiveReplyId: string | null | undefined;
  currentScreen: string;
}): string | null {
  if (params.interactiveReplyId && MENU_ITEM_IDS.has(params.interactiveReplyId)) {
    return params.interactiveReplyId;
  }
  if (params.currentScreen === "main_menu") {
    const digit = /^\s*([1-6])\s*$/.exec(params.body);
    if (digit) return MAIN_MENU_ITEMS[parseInt(digit[1]!, 10) - 1]!.id;
  }
  return null;
}

export function renderMainMenu(params: {
  clinicName: string;
  patientName?: string | null;
}): Extract<Action, { action: "show_main_menu" }> {
  const welcomeText = params.patientName
    ? `Hi ${params.patientName}! Welcome back to ${params.clinicName}. 👋\nHow can we help you today?`
    : `Welcome to ${params.clinicName}! 👋\nHow can we help you today?`;
  return { action: "show_main_menu", screen: "main_menu", data: { welcomeText, items: MAIN_MENU_ITEMS } };
}

/** Text-only clinics get the same menu as a numbered list — reply "1"-"6" works (see resolveMenuSelection). */
export function renderMainMenuText(params: { clinicName: string; patientName?: string | null }): string {
  const welcome = params.patientName
    ? `Hi ${params.patientName}! Welcome back to ${params.clinicName}. 👋`
    : `Welcome to ${params.clinicName}! 👋`;
  const lines = MAIN_MENU_ITEMS.map((item, i) => `${i + 1}. ${item.title}`);
  return `${welcome}\nHow can we help you today?\n\n${lines.join("\n")}\n\nReply with a number, or just type your question.`;
}

/** Shown only when the clinic actually has more than one active doctor — data-driven, never hardcoded. */
export function renderDoctorList(doctors: ClinicDoctor[]): Extract<Action, { action: "show_list" }> {
  return {
    action: "show_list",
    screen: "doctor_selection",
    data: {
      text: "Which doctor would you like to see?",
      buttonLabel: "Choose doctor",
      sections: [
        {
          title: "Our doctors",
          rows: doctors.map((doctor, i) => ({
            id: `doctor_${i}`,
            title: doctor.name,
            ...(doctor.role ? { description: doctor.role } : {}),
          })),
        },
      ],
    },
  };
}
