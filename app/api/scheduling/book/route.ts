import { randomUUID } from "node:crypto";
import { isAdminRequestAuthorized } from "@/lib/google/adminAuth";
import { getSchedulingProvider } from "@/lib/scheduling";
import { getOrCreateOpenConversation, getOrCreatePatient } from "@/lib/supabase/queries";

interface BookRequestBody {
  clinic_id?: string;
  slot_id?: string;
  name?: string;
  mobile?: string;
  reason?: string;
}

// Phase 3 verification endpoint — exercises the exact booking path Phase 4
// will later call from the WhatsApp reply pipeline, but driven manually so
// it can be tested before any AI wiring exists. Reuses getOrCreatePatient /
// getOrCreateOpenConversation, the same functions the real pipeline uses.
export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!isAdminRequestAuthorized(url)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as BookRequestBody | null;
  const clinicId = body?.clinic_id;
  const slotId = body?.slot_id;
  const name = body?.name;
  const mobile = body?.mobile;
  const reason = body?.reason;

  if (!clinicId || !slotId || !name || !mobile || !reason) {
    return new Response("Missing one of: clinic_id, slot_id, name, mobile, reason", {
      status: 400,
    });
  }

  const provider = await getSchedulingProvider(clinicId);
  if (!provider) {
    return Response.json(
      { ok: false, reason: "provider_unavailable", alternatives: [] },
      { status: 409 },
    );
  }

  const patient = await getOrCreatePatient(clinicId, mobile);
  const conversation = await getOrCreateOpenConversation(clinicId, patient.id);

  const result = await provider.bookSlot({
    slotId,
    patientId: patient.id,
    conversationId: conversation.id,
    name,
    mobile,
    reason,
    // No real inbound WhatsApp message drives this manual/admin endpoint —
    // a fresh synthetic id per call still satisfies the idempotent-retry
    // correlation in bookSlot.ts (see /lib/scheduling/bookSlot.ts) without
    // colliding with the unique index on appointments.wa_message_id.
    waMessageId: `manual:${randomUUID()}`,
  });

  return Response.json(result, { status: result.ok ? 200 : 409 });
}
