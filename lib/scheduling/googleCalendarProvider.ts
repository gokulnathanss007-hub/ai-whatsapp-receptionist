import { bookSlot } from "@/lib/scheduling/bookSlot";
import { listAvailableSlots } from "@/lib/scheduling/listAvailableSlots";
import type {
  BookSlotParams,
  BookSlotResult,
  SchedulingProvider,
  SchedulingSlot,
} from "@/lib/scheduling/types";

export class GoogleCalendarProvider implements SchedulingProvider {
  constructor(private readonly clinicId: string) {}

  async listAvailableSlots(params?: { daysAhead?: number }): Promise<SchedulingSlot[]> {
    const slots = await listAvailableSlots({ clinicId: this.clinicId, daysAhead: params?.daysAhead });
    return slots ?? [];
  }

  async bookSlot(params: BookSlotParams): Promise<BookSlotResult> {
    return bookSlot(this.clinicId, params);
  }
}
