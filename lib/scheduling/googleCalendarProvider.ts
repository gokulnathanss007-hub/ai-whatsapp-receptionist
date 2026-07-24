import { bookSlot } from "@/lib/scheduling/bookSlot";
import { listAvailableSlots } from "@/lib/scheduling/listAvailableSlots";
import type {
  BookSlotParams,
  BookSlotResult,
  SchedulingProvider,
  SchedulingSlot,
} from "@/lib/scheduling/types";

export class GoogleCalendarProvider implements SchedulingProvider {
  constructor(private readonly schoolId: string) {}

  async listAvailableSlots(params?: { daysAhead?: number; requestHint?: string }): Promise<SchedulingSlot[]> {
    const slots = await listAvailableSlots({
      schoolId: this.schoolId,
      daysAhead: params?.daysAhead,
      requestHint: params?.requestHint,
    });
    return slots ?? [];
  }

  async bookSlot(params: BookSlotParams): Promise<BookSlotResult> {
    return bookSlot(this.schoolId, params);
  }
}
