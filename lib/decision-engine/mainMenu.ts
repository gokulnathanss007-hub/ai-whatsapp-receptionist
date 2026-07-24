import type { Action, ListRow } from "@/lib/decision-engine/types";
import type { SchoolService } from "@/lib/knowledge/types";

// The Main Menu — the product's front door (PATIENT_EXPERIENCE.md §3).
// Item ids are backend keys handled deterministically in the pipeline;
// titles/descriptions are the human labels. Static by design: menu items
// map 1:1 onto intents, and adding one is a product decision, not a
// per-school customization (school knowledge customizes the CONTENT each
// item answers with, never the menu shape).

export const MAIN_MENU_ITEMS: ListRow[] = [
  { id: "menu_admission_enquiry", title: "📝 Admission Enquiry", description: "Start an admission enquiry" },
  { id: "menu_fee_structure", title: "💰 Fee Structure", description: "Fee details" },
  { id: "menu_school_timings", title: "🕒 School Timings", description: "Our open hours" },
  { id: "menu_transport", title: "🚌 Transport", description: "Bus routes and pickup" },
  { id: "menu_facilities", title: "🏫 Facilities", description: "Our campus facilities" },
  { id: "menu_contact_office", title: "☎️ Contact School Office", description: "Talk to our team" },
  { id: "menu_certificates", title: "📄 Certificates", description: "Transfer / bonafide certificates" },
  { id: "menu_location", title: "📍 School Location", description: "Address and directions" },
  { id: "menu_ask_anything", title: "💬 Ask Anything", description: "Type your own question" },
];

const MENU_ITEM_IDS = new Set(MAIN_MENU_ITEMS.map((item) => item.id));

/**
 * "Contact School Office" handoff text — includes a direct contact number
 * when the school has one configured (schools.reception_phone), so the
 * parent isn't just told "staff will reply here soon" with no way to reach
 * a real person now. Never hardcoded: falls back to the generic message for
 * any school that hasn't set a number. School hours are included alongside
 * the number so the parent knows when a call will actually be answered.
 *
 * Deliberately does NOT promise "they will reply to you here soon" — there
 * is no in-thread staff-reply feature built yet, so that line was a promise
 * the product couldn't keep (product decision 2026-07-21).
 */
export function renderHandoffText(params: { receptionPhone: string | null; openingHoursText: string | null }): string {
  const { receptionPhone, openingHoursText } = params;
  if (!receptionPhone) {
    return "I will connect you with our school office team.";
  }
  const lines = [
    "I will connect you with our school office team.",
    "",
    `📞 You can call our school office directly at ${receptionPhone} for immediate assistance.`,
  ];
  if (openingHoursText) {
    // openingHoursText may already be a full sentence (e.g. school-authored
    // schools.timings free text ending in its own period) — never double up.
    const hours = openingHoursText.trim().replace(/\.+$/, "");
    lines.push("", `🕒 We are available: ${hours}.`);
  }
  return lines.join("\n");
}

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
 * - Typed digit 1-N (N = MAIN_MENU_ITEMS.length): only honoured when the LAST
 *   screen shown was the menu (conversations.current_screen) — "2" during
 *   qualifying means an answer, not a menu pick. Every tap has a typed
 *   equivalent (§4.2).
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
    const digit = /^\s*(\d{1,2})\s*$/.exec(params.body);
    if (digit) {
      const index = parseInt(digit[1]!, 10) - 1;
      if (index >= 0 && index < MAIN_MENU_ITEMS.length) return MAIN_MENU_ITEMS[index]!.id;
    }
  }
  return null;
}

export function renderMainMenu(params: {
  schoolName: string;
  parentName?: string | null;
}): Extract<Action, { action: "show_main_menu" }> {
  const welcomeText = params.parentName
    ? `Hi ${params.parentName}! Welcome back to ${params.schoolName}. 👋\n\nHow may I assist you today?`
    : `Welcome to ${params.schoolName}. 👋\n\nHow may I assist you today?`;
  return { action: "show_main_menu", screen: "main_menu", data: { welcomeText, items: MAIN_MENU_ITEMS } };
}

/** Text-only schools get the same menu as a numbered list — reply "1"-"N" works (see resolveMenuSelection). */
export function renderMainMenuText(params: { schoolName: string; parentName?: string | null }): string {
  const welcome = params.parentName
    ? `Hi ${params.parentName}! Welcome back to ${params.schoolName}. 👋`
    : `Welcome to ${params.schoolName}. 👋`;
  const lines = MAIN_MENU_ITEMS.map((item, i) => `${i + 1}. ${item.title}`);
  return `${welcome}\n\nHow may I assist you today?\n\n${lines.join("\n")}\n\nReply with a number, or just type your question.`;
}

/**
 * School programs/grades as a tappable list (rows come from school
 * knowledge, never hardcoded). Row ids carry the service_key — tapping one
 * shows that program's info, and the tapped program is captured as the
 * parent's enquiry details so booking continues without re-asking.
 */
export function renderSchoolServicesList(services: SchoolService[]): Extract<Action, { action: "show_list" }> {
  return {
    action: "show_list",
    screen: "school_service_info",
    data: {
      text: "Here is what we offer.\n\nTap one to know more.",
      buttonLabel: "Programs",
      sections: [
        {
          title: "Our programs",
          rows: services.slice(0, 10).map((service) => ({
            id: `service_${service.service_key}`,
            title: service.display_name,
            ...(service.high_level_info ? { description: service.high_level_info } : {}),
          })),
        },
      ],
    },
  };
}

// ── Facilities — a single terminal text reply, not an interactive picker
// (product decision 2026-07-24). Categories are static/product-level, same
// reasoning as MAIN_MENU_ITEMS: the list of facility TYPES a school can have
// is a fixed product shape, not per-school knowledge. "Back to Main Menu" is
// the only functional option (isFacilitiesBackSelection) — the other 8 are
// informational only for now.
const FACILITIES_TEXT =
  "🏫 *Facilities*\n\n" +
  "1️⃣ Smart Classrooms\n\n" +
  "2️⃣ Library\n\n" +
  "3️⃣ Laboratories\n\n" +
  "4️⃣ Sports & Playground\n\n" +
  "5️⃣ Transport\n\n" +
  "6️⃣ Hostel\n\n" +
  "7️⃣ Safety & Security\n\n" +
  "8️⃣ Other Facilities\n\n" +
  "9️⃣ Back to Main Menu";

export function renderFacilitiesText(): string {
  return FACILITIES_TEXT;
}

/** True when the parent typed "9" while the Facilities list was the last screen shown. */
export function isFacilitiesBackSelection(body: string): boolean {
  return /^\s*9\s*$/.test(body.trim());
}
