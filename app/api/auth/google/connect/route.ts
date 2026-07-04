import { isAdminRequestAuthorized } from "@/lib/google/adminAuth";
import { buildGoogleAuthUrl } from "@/lib/google/oauthClient";
import { getClinic } from "@/lib/supabase/queries";

// Staff-facing entry point for "Connect Google Calendar" (Phase 1 — see
// /docs/GOOGLE_CALENDAR_INTEGRATION.md). Gated by a shared admin token in the
// query string since no staff auth/dashboard exists yet; an operator
// generates this link per clinic and sends it to clinic staff to click.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (!isAdminRequestAuthorized(url)) {
    return new Response("Forbidden", { status: 403 });
  }

  const clinicId = url.searchParams.get("clinic_id");
  if (!clinicId) {
    return new Response("Missing clinic_id", { status: 400 });
  }

  const clinic = await getClinic(clinicId);
  if (!clinic) {
    return new Response("Unknown clinic_id", { status: 404 });
  }

  return Response.redirect(buildGoogleAuthUrl(clinicId), 302);
}
