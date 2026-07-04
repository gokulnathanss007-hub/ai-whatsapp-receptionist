import {
  getClinic,
  getClinicDoctors,
  getClinicFaqs,
  getClinicServices,
} from "@/lib/supabase/queries";
import {
  clinicDoctorSchema,
  clinicFaqEntrySchema,
  clinicProfileSchema,
  clinicServiceSchema,
  type ClinicKnowledge,
} from "@/lib/knowledge/types";

/**
 * Loads a clinic's full knowledge (profile, doctors, services, FAQs) from
 * Supabase and validates every row. Callers should key any caching on
 * `clinicId` + `profile.knowledge_version` — see /docs/KNOWLEDGE_STRUCTURE.md §7.
 */
export async function loadClinicKnowledge(clinicId: string): Promise<ClinicKnowledge> {
  const [clinicRow, doctorRows, serviceRows, faqRows] = await Promise.all([
    getClinic(clinicId),
    getClinicDoctors(clinicId),
    getClinicServices(clinicId),
    getClinicFaqs(clinicId),
  ]);

  if (!clinicRow) {
    throw new Error(`No clinic found for id ${clinicId}`);
  }

  const profile = clinicProfileSchema.parse(clinicRow);
  const doctors = doctorRows.map((d) => clinicDoctorSchema.parse(d));
  const services = serviceRows.map((s) => clinicServiceSchema.parse(s));
  const faqs = faqRows.map((f) => clinicFaqEntrySchema.parse(f));

  return { profile, doctors, services, faqs };
}

/** Renders the clinic knowledge block injected into the system prompt. */
export function renderClinicKnowledgeBlock(knowledge: ClinicKnowledge): string {
  const { profile, doctors, services, faqs } = knowledge;
  const lines: string[] = [];

  lines.push("CLINIC KNOWLEDGE");
  lines.push(`Clinic: ${profile.name}${profile.city ? ` (${profile.city})` : ""}`);
  if (profile.address) lines.push(`Address: ${profile.address}`);
  if (profile.maps_url) lines.push(`Maps: ${profile.maps_url}`);
  if (profile.timings) lines.push(`Timings: ${profile.timings}`);
  if (profile.parking_info) lines.push(`Parking: ${profile.parking_info}`);
  lines.push(`Languages: ${profile.languages.join(", ") || "English"}.`);
  if (profile.consultation_fee !== null) {
    lines.push(`Consultation fee: ₹${profile.consultation_fee}.`);
  }
  if (profile.payment_methods.length > 0) {
    lines.push(`Payment methods: ${profile.payment_methods.join(", ")}.`);
  }
  if (profile.follow_up_policy) lines.push(`Follow-up policy: ${profile.follow_up_policy}`);
  if (profile.cancellation_policy) lines.push(`Cancellation: ${profile.cancellation_policy}`);
  if (profile.rescheduling_policy) lines.push(`Rescheduling: ${profile.rescheduling_policy}`);
  lines.push(
    `Auto-confirm appointments: ${profile.auto_confirm_enabled ? "YES" : "NO"}${
      profile.auto_confirm_enabled ? "." : " (record requests; staff confirm)."
    }`,
  );

  if (doctors.length > 0) {
    lines.push("", "Doctors:");
    for (const doctor of doctors) {
      lines.push(`- ${doctor.name}${doctor.role ? ` — ${doctor.role}` : ""}`);
    }
  }

  if (services.length > 0) {
    lines.push("", "Services offered (high-level only):");
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

/** Cache key that must invalidate whenever clinic knowledge changes. */
export function knowledgeCacheKey(clinicId: string, knowledgeVersion: number): string {
  return `${clinicId}:${knowledgeVersion}`;
}
