import {
  getSchool,
  getSchoolStaff,
  getSchoolFaqs,
  getSchoolServices,
} from "@/lib/supabase/queries";
import {
  schoolStaffSchema,
  schoolFaqEntrySchema,
  schoolProfileSchema,
  schoolServiceSchema,
  type SchoolKnowledge,
} from "@/lib/knowledge/types";
import { formatOpeningHours } from "@/lib/scheduling/formatOpeningHours";

/**
 * Loads a school's full knowledge (profile, staff, services, FAQs) from
 * Supabase and validates every row. Callers should key any caching on
 * `schoolId` + `profile.knowledge_version` — see /docs/03-engineering/KNOWLEDGE_STRUCTURE.md §7.
 */
export async function loadSchoolKnowledge(schoolId: string): Promise<SchoolKnowledge> {
  const [schoolRow, staffRows, serviceRows, faqRows] = await Promise.all([
    getSchool(schoolId),
    getSchoolStaff(schoolId),
    getSchoolServices(schoolId),
    getSchoolFaqs(schoolId),
  ]);

  if (!schoolRow) {
    throw new Error(`No school found for id ${schoolId}`);
  }

  const profile = schoolProfileSchema.parse(schoolRow);
  const staff = staffRows.map((s) => schoolStaffSchema.parse(s));
  const services = serviceRows.map((s) => schoolServiceSchema.parse(s));
  const faqs = faqRows.map((f) => schoolFaqEntrySchema.parse(f));

  return { profile, staff, services, faqs };
}

/** Renders the school knowledge block injected into the system prompt. */
export function renderSchoolKnowledgeBlock(knowledge: SchoolKnowledge): string {
  const { profile, staff, services, faqs } = knowledge;
  const lines: string[] = [];

  lines.push("SCHOOL KNOWLEDGE");
  lines.push(`School: ${profile.name}${profile.city ? ` (${profile.city})` : ""}`);
  if (profile.address) lines.push(`Address: ${profile.address}`);
  if (profile.maps_url) lines.push(`Maps: ${profile.maps_url}`);
  // opening_hours is the single source of truth also used to generate
  // bookable Google Calendar slots (see lib/scheduling/listAvailableSlots.ts)
  // — deriving the stated timings from it means the receptionist can never
  // quote hours the booking engine doesn't actually honor. Falls back to the
  // freeform `timings` text only for schools with no structured hours set.
  const derivedTimings = formatOpeningHours(profile.opening_hours);
  const timingsText = derivedTimings ?? profile.timings;
  if (timingsText) lines.push(`Timings: ${timingsText}`);
  if (profile.parking_info) lines.push(`Parking: ${profile.parking_info}`);
  lines.push(`Languages: ${profile.languages.join(", ") || "English"}.`);
  if (profile.payment_methods.length > 0) {
    lines.push(`Payment methods: ${profile.payment_methods.join(", ")}.`);
  }
  if (profile.follow_up_policy) lines.push(`Follow-up policy: ${profile.follow_up_policy}`);
  if (profile.cancellation_policy) lines.push(`Cancellation: ${profile.cancellation_policy}`);
  if (profile.rescheduling_policy) lines.push(`Rescheduling: ${profile.rescheduling_policy}`);
  lines.push(
    `Auto-confirm visits: ${profile.auto_confirm_enabled ? "YES" : "NO"}${
      profile.auto_confirm_enabled ? "." : " (record requests; office confirms)."
    }`,
  );

  if (staff.length > 0) {
    lines.push("", "Staff:");
    for (const member of staff) {
      lines.push(`- ${member.name}${member.role ? ` — ${member.role}` : ""}`);
    }
  }

  if (services.length > 0) {
    lines.push("", "Programs offered (high-level only):");
    for (const service of services) {
      lines.push(
        `- ${service.display_name}${service.high_level_info ? ` — ${service.high_level_info}` : ""}`,
      );
    }
  }

  if (faqs.length > 0) {
    lines.push("", "FAQs:");
    for (const faq of faqs) {
      const suffix = faq.requires_staff ? " [defer to staff]" : "";
      lines.push(`- ${faq.question}: ${faq.answer}${suffix}`);
    }
  }

  return lines.join("\n");
}

/** Cache key that must invalidate whenever school knowledge changes. */
export function knowledgeCacheKey(schoolId: string, knowledgeVersion: number): string {
  return `${schoolId}:${knowledgeVersion}`;
}
