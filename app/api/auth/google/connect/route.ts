import { isAdminRequestAuthorized } from "@/lib/google/adminAuth";
import { buildGoogleAuthUrl } from "@/lib/google/oauthClient";
import { getSchool } from "@/lib/supabase/queries";

// Staff-facing entry point for "Connect Google Calendar" (Phase 1 — see
// /docs/GOOGLE_CALENDAR_INTEGRATION.md). Gated by a shared admin token in the
// query string since no staff auth/dashboard exists yet; an operator
// generates this link per school and sends it to school staff to click.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (!isAdminRequestAuthorized(url)) {
    return new Response("Forbidden", { status: 403 });
  }

  const schoolId = url.searchParams.get("school_id");
  if (!schoolId) {
    return new Response("Missing school_id", { status: 400 });
  }

  const school = await getSchool(schoolId);
  if (!school) {
    return new Response("Unknown school_id", { status: 404 });
  }

  return Response.redirect(buildGoogleAuthUrl(schoolId), 302);
}
