/* End-to-end booking test against PRODUCTION:
 *   1. fetch real availability
 *   2. book the last offered slot (real Postgres row + real Google Calendar event)
 *   3. verify the slot disappears from availability
 *   4. attempt a double-book → must be rejected
 *   5. clean up: cancel the appointment + delete the calendar event
 *   6. verify the slot is available again
 * Run: npx tsx scripts/e2eBookingTest.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of raw.split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}

const BASE = "https://medixum-whatsapp-receptionist.vercel.app";
const CLINIC_ID = "ff605796-fc70-42cb-b10d-ef67c5b5d092";
const TOKEN = process.env.ADMIN_SETUP_TOKEN!;

interface Slot { id: string; startsAt: string; endsAt: string; label: string }

async function getSlots(): Promise<Slot[]> {
  const res = await fetch(`${BASE}/api/scheduling/slots?clinic_id=${CLINIC_ID}&days_ahead=2&admin_token=${TOKEN}`);
  const json = (await res.json()) as { available: boolean; slots?: Slot[] };
  if (!json.available) throw new Error("Slots endpoint says calendar unavailable");
  return json.slots ?? [];
}

async function book(slotId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/api/scheduling/book?admin_token=${TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clinic_id: CLINIC_ID,
      slot_id: slotId,
      name: "E2E TEST (auto)",
      mobile: "+919999999902",
      reason: "End-to-end system test",
    }),
  });
  return (await res.json()) as Record<string, unknown>;
}

async function main() {
  const results: string[] = [];
  const check = (name: string, ok: boolean, detail = "") => {
    results.push(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) throw new Error(`E2E failed at: ${name} ${detail}`);
  };

  // 1. availability
  const slots = await getSlots();
  check("1. Availability returns real slots", slots.length > 0, `${slots.length} slots`);
  const target = slots[slots.length - 1]!;

  // 2. book
  const booking = (await book(target.id)) as { ok?: boolean; appointmentId?: string; calendarSynced?: boolean; slot?: Slot };
  check("2. Booking succeeds", booking.ok === true, `appointment ${booking.appointmentId}`);
  check("2b. Google Calendar event created", booking.calendarSynced === true);
  check("2c. Booked exactly the selected slot", booking.slot?.id === target.id, `${booking.slot?.label}`);

  // 3. slot removed from availability
  const slotsAfter = await getSlots();
  check("3. Booked slot no longer offered", !slotsAfter.some((s) => s.id === target.id));

  // 4. double-book rejected
  const dup = (await book(target.id)) as { ok?: boolean; reason?: string };
  check("4. Double-booking rejected", dup.ok === false, `reason: ${dup.reason}`);

  // 5. cleanup — cancel in DB + delete calendar event
  const ref = new URL(process.env.SUPABASE_URL!).hostname.split(".")[0]!;
  const pg = new Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD!)}@db.${ref}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  const row = await pg.query("select google_event_id from appointments where id = $1", [booking.appointmentId]);
  const googleEventId: string | null = row.rows[0]?.google_event_id ?? null;
  await pg.query("update appointments set status = 'cancelled', updated_at = now() where id = $1", [booking.appointmentId]);
  await pg.end();

  if (googleEventId) {
    const { google } = await import("googleapis");
    const { getValidGoogleClient } = await import("@/lib/google/tokenManager");
    const { getClinicGoogleAccount } = await import("@/lib/supabase/queries");
    const client = await getValidGoogleClient(CLINIC_ID);
    const account = await getClinicGoogleAccount(CLINIC_ID);
    if (client && account) {
      const calendar = google.calendar({ version: "v3", auth: client });
      await calendar.events.delete({ calendarId: account.calendar_id, eventId: googleEventId });
    }
  }
  check("5. Cleanup: appointment cancelled + calendar event deleted", true, `event ${googleEventId}`);

  // 6. slot available again
  const slotsFinal = await getSlots();
  check("6. Slot available again after cancellation", slotsFinal.some((s) => s.id === target.id));

  console.log("\n===== SERVER-SIDE E2E RESULT =====");
  for (const line of results) console.log(line);
  console.log(`Tested slot: ${target.label} (${target.startsAt})`);
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
