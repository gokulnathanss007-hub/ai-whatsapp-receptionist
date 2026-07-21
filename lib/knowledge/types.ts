import { z } from "zod";

// Validates a single row before it's allowed into the rendered knowledge
// block — the block is trusted input to the model, so malformed clinic data
// must fail loudly here rather than reach the prompt.

const weekdayHoursSchema = z.array(z.tuple([z.string(), z.string()]));

/** Mirrors lib/supabase/types.ts WorkingHours — the clinic's single source of truth for hours. */
export const openingHoursSchema = z.object({
  mon: weekdayHoursSchema.optional(),
  tue: weekdayHoursSchema.optional(),
  wed: weekdayHoursSchema.optional(),
  thu: weekdayHoursSchema.optional(),
  fri: weekdayHoursSchema.optional(),
  sat: weekdayHoursSchema.optional(),
  sun: weekdayHoursSchema.optional(),
});

export const clinicProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  city: z.string().nullable(),
  address: z.string().nullable(),
  maps_url: z.string().nullable(),
  timings: z.string().nullable(),
  parking_info: z.string().nullable(),
  languages: z.array(z.string()),
  consultation_fee: z.number().nullable(),
  payment_methods: z.array(z.string()),
  follow_up_policy: z.string().nullable(),
  cancellation_policy: z.string().nullable(),
  rescheduling_policy: z.string().nullable(),
  auto_confirm_enabled: z.boolean(),
  interactive_enabled: z.boolean(),
  reception_phone: z.string().nullable(),
  opening_hours: openingHoursSchema,
  slot_duration_minutes: z.number().int(),
  timezone: z.string(),
  knowledge_version: z.number().int(),
});
export type ClinicProfile = z.infer<typeof clinicProfileSchema>;

export const clinicDoctorSchema = z.object({
  name: z.string().min(1),
  role: z.string().nullable(),
});
export type ClinicDoctor = z.infer<typeof clinicDoctorSchema>;

export const clinicServiceSchema = z.object({
  service_key: z.string().min(1),
  display_name: z.string().min(1),
  high_level_info: z.string().nullable(),
});
export type ClinicService = z.infer<typeof clinicServiceSchema>;

export const clinicFaqEntrySchema = z.object({
  faq_id: z.string().min(1),
  category: z.string(),
  question: z.string(),
  answer: z.string().min(1),
  requires_staff: z.boolean(),
});
export type ClinicFaqEntry = z.infer<typeof clinicFaqEntrySchema>;

export interface ClinicKnowledge {
  profile: ClinicProfile;
  doctors: ClinicDoctor[];
  services: ClinicService[];
  faqs: ClinicFaqEntry[];
}
