import { isAdminRequestAuthorized } from "@/lib/google/adminAuth";
import { getClinicGoogleAccount } from "@/lib/supabase/queries";

// Lets an operator verify a clinic's Google Calendar connection without ever
// exposing the stored (encrypted) tokens. Same admin-token gate as /connect.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (!isAdminRequestAuthorized(url)) {
    return new Response("Forbidden", { status: 403 });
  }

  const clinicId = url.searchParams.get("clinic_id");
  if (!clinicId) {
    return new Response("Missing clinic_id", { status: 400 });
  }

  const account = await getClinicGoogleAccount(clinicId);
  if (!account) {
    return Response.json({ connected: false });
  }

  return Response.json({
    connected: account.sync_status === "connected",
    google_email: account.google_email,
    calendar_id: account.calendar_id,
    sync_status: account.sync_status,
    connected_at: account.connected_at,
  });
}
