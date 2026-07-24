import { describe, expect, it } from "vitest";
import {
  isGreetingOnly,
  isMenuRequest,
  MAIN_MENU_ITEMS,
  renderHandoffText,
  renderMainMenu,
  renderMainMenuText,
  resolveMenuSelection,
} from "@/lib/decision-engine/mainMenu";
import { buildListMessagePayload } from "@/lib/whatsapp/sendInteractive";

describe("greeting detection — menu only for greeting-ONLY messages", () => {
  it.each(["Hi", "hii", "Hello!", "hey", "Good morning", "good evening 🙏", "Vanakkam", "HI"])(
    "'%s' is a greeting",
    (text) => expect(isGreetingOnly(text)).toBe(true),
  );

  it.each([
    "Hi, what is the fee structure?",
    "hello i want to start an admission enquiry",
    "good morning, is 5pm free?",
    "hi there can you help me with admissions",
  ])("'%s' states an intent — NO menu", (text) => expect(isGreetingOnly(text)).toBe(false));

  it("explicit menu requests are honoured", () => {
    expect(isMenuRequest("menu")).toBe(true);
    expect(isMenuRequest("Main Menu")).toBe(true);
    expect(isMenuRequest("options")).toBe(true);
    expect(isMenuRequest("what programs do you have")).toBe(false);
  });
});

describe("menu selection resolution — every tap has a typed equivalent", () => {
  it("resolves a tapped menu row id", () => {
    expect(
      resolveMenuSelection({ body: "📝 Admission Enquiry", interactiveReplyId: "menu_admission_enquiry", currentScreen: "main_menu" }),
    ).toBe("menu_admission_enquiry");
  });

  it("resolves a typed digit ONLY when the menu was the last screen", () => {
    expect(resolveMenuSelection({ body: "1", interactiveReplyId: null, currentScreen: "main_menu" })).toBe(
      "menu_admission_enquiry",
    );
    expect(resolveMenuSelection({ body: "6", interactiveReplyId: null, currentScreen: "main_menu" })).toBe(
      "menu_contact_office",
    );
    // "2" during qualifying is an answer (e.g. child's age), never a menu pick.
    expect(resolveMenuSelection({ body: "2", interactiveReplyId: null, currentScreen: "qualifying_question" })).toBeNull();
  });

  it("unknown ids resolve to nothing", () => {
    expect(resolveMenuSelection({ body: "x", interactiveReplyId: "menu_unknown_thing", currentScreen: "main_menu" })).toBeNull();
  });
});

describe("menu rendering", () => {
  it("interactive menu envelope: screen main_menu, all eight items, ids intact", () => {
    const action = renderMainMenu({ schoolName: "Sunrise Public School", parentName: "Gokul" });
    expect(action.action).toBe("show_main_menu");
    expect(action.screen).toBe("main_menu");
    expect(action.data.items).toHaveLength(8);
    expect(action.data.items.map((i) => i.id)).toContain("menu_contact_office");
    expect(action.data.welcomeText).toContain("Gokul");
    expect(action.data.welcomeText).toContain("Sunrise Public School");
  });

  it("menu rows fit Meta list limits as a real payload", () => {
    const payload = buildListMessagePayload({
      to: "919",
      bodyText: "Welcome!",
      buttonLabel: "Main Menu",
      sections: [{ title: "School Services", rows: MAIN_MENU_ITEMS }],
    }) as any;
    const rows = payload.interactive.action.sections[0].rows;
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row.title.length).toBeLessThanOrEqual(24);
      expect((row.description ?? "").length).toBeLessThanOrEqual(72);
    }
    expect(payload.interactive.action.button.length).toBeLessThanOrEqual(20);
  });

  it("text-only schools get the same menu as numbered text", () => {
    const text = renderMainMenuText({ schoolName: "Sunrise Public School" });
    expect(text).toContain("1. 📝 Admission Enquiry");
    expect(text).toContain("6. ☎️ Contact School Office");
    expect(text).toContain("Reply with a number");
  });
});

describe("confirm-button id round-trip (stateless slot carry)", () => {
  it("confirm_slot_<id> strips back to the exact slot id", () => {
    const slotId = "MjAyNi0wNy0wNlQwNDozMDowMC4wMDBa";
    const buttonId = `confirm_slot_${slotId}`;
    expect(buttonId.startsWith("confirm_slot_")).toBe(true);
    expect(buttonId.slice("confirm_slot_".length)).toBe(slotId);
  });
});

describe("renderHandoffText — direct contact number + hours on Contact School Office", () => {
  it("includes the school's reception number and hours when both are set", () => {
    const text = renderHandoffText({ receptionPhone: "8778303075", openingHoursText: "Mon-Sat: 10:00 AM-8:00 PM" });
    expect(text).toContain("call our school office directly at 8778303075 for immediate assistance");
    expect(text).toContain("We are available: Mon-Sat: 10:00 AM-8:00 PM.");
  });

  it("includes the number without an hours line when hours aren't known", () => {
    const text = renderHandoffText({ receptionPhone: "8778303075", openingHoursText: null });
    expect(text).toContain("8778303075");
    expect(text).not.toContain("We are available");
  });

  it("falls back to the generic message when no number is configured (never hardcoded per-school)", () => {
    const text = renderHandoffText({ receptionPhone: null, openingHoursText: "Mon-Sat: 10:00 AM-8:00 PM" });
    expect(text).toBe("I will connect you with our school office team.");
    expect(text).not.toContain("call our school office");
  });

  it("never promises an in-thread staff reply — that feature doesn't exist", () => {
    expect(renderHandoffText({ receptionPhone: "8778303075", openingHoursText: null })).not.toContain(
      "reply to you here",
    );
    expect(renderHandoffText({ receptionPhone: null, openingHoursText: null })).not.toContain("reply to you here");
  });
});
