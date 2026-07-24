import { isAdminRequestAuthorized } from "@/lib/google/adminAuth";
import { listAvailableSlots } from "@/lib/scheduling/listAvailableSlots";

const MAX_DAYS_AHEAD = 7;

// Phase 2 verification endpoint — lets an operator see real, calendar-checked
// availability before anything is wired into the AI conversation. Same
// admin-token gate as /api/auth/google/*.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (!isAdminRequestAuthorized(url)) {
    return new Response("Forbidden", { status: 403 });
  }

  const schoolId = url.searchParams.get("school_id");
  if (!schoolId) {
    return new Response("Missing school_id", { status: 400 });
  }

  const daysAheadParam = url.searchParams.get("days_ahead");
  const daysAhead = daysAheadParam ? Number(daysAheadParam) : undefined;
  if (daysAhead !== undefined && (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > MAX_DAYS_AHEAD)) {
    return new Response(`days_ahead must be an integer between 1 and ${MAX_DAYS_AHEAD}`, {
      status: 400,
    });
  }

  const slots = await listAvailableSlots({ schoolId, daysAhead });
  if (slots === null) {
    return Response.json({
      available: false,
      reason: "School has no connected (or currently working) Google Calendar",
    });
  }

  return Response.json({ available: true, slots });
}
