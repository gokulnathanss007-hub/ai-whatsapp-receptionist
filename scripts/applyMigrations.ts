/* One-off migration runner for migrations 0005-0008 + the working-hours
 * seed, using the direct Supabase Postgres connection. Idempotent: each
 * migration is skipped if its column/function already exists. Run with:
 *   npx tsx scripts/applyMigrations.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]!] = match[2]!;
  }
  return env;
}

async function columnExists(client: Client, table: string, column: string): Promise<boolean> {
  const res = await client.query(
    `select 1 from information_schema.columns where table_name = $1 and column_name = $2`,
    [table, column],
  );
  return (res.rowCount ?? 0) > 0;
}

async function main() {
  const env = loadEnvLocal();
  const ref = new URL(env.SUPABASE_URL!).hostname.split(".")[0]!;
  const password = env.SUPABASE_DB_PASSWORD!;

  const candidates = [
    `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`,
  ];

  let client: Client | null = null;
  for (const conn of candidates) {
    const attempt = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12_000 });
    try {
      await attempt.connect();
      client = attempt;
      console.log(`connected via ${conn.includes("pooler") ? "pooler" : "direct"}`);
      break;
    } catch (err) {
      console.log(`connection failed (${conn.split("@")[1]?.split(":")[0]}): ${(err as Error).message}`);
    }
  }
  if (!client) throw new Error("Could not connect to Supabase Postgres via any candidate host");

  const migration = (file: string) =>
    readFileSync(path.join(process.cwd(), "supabase", "migrations", file), "utf-8");

  // 0005 — clinics.opening_hours as single source of truth
  if (await columnExists(client, "clinics", "opening_hours")) {
    console.log("0005 already applied — skipping");
  } else {
    await client.query(migration("0005_clinic_opening_hours.sql"));
    console.log("0005 applied (clinics.opening_hours/slot_duration_minutes/timezone)");
  }

  // 0006 — conversations.booking_status state machine
  if (await columnExists(client, "conversations", "booking_status")) {
    console.log("0006 already applied — skipping");
  } else {
    await client.query(migration("0006_conversation_booking_status.sql"));
    console.log("0006 applied (conversations.booking_status)");
  }

  // 0007 — create or replace, inherently idempotent
  await client.query(migration("0007_claim_booking_attempt.sql"));
  console.log("0007 applied (claim_booking_attempt function)");

  // 0008 — appointments.wa_message_id
  if (await columnExists(client, "appointments", "wa_message_id")) {
    console.log("0008 already applied — skipping");
  } else {
    await client.query(migration("0008_appointments_wa_message_id.sql"));
    console.log("0008 applied (appointments.wa_message_id)");
  }

  // Seed working hours (only where still empty, so re-runs never clobber)
  const seeded = await client.query(`
    update clinics
    set opening_hours = '{
        "mon": [["10:00", "20:00"]],
        "tue": [["10:00", "20:00"]],
        "wed": [["10:00", "20:00"]],
        "thu": [["10:00", "20:00"]],
        "fri": [["10:00", "20:00"]],
        "sat": [["10:00", "20:00"]]
      }'::jsonb,
      slot_duration_minutes = 30,
      timezone = 'Asia/Kolkata'
    where name = 'Glow Skin Clinic' and opening_hours = '{}'::jsonb
    returning id`);
  console.log(seeded.rowCount ? "seeded Glow Skin Clinic opening_hours" : "opening_hours already set — seed skipped");

  const clinics = await client.query(`
    select c.id, c.name, c.timezone, c.opening_hours != '{}'::jsonb as has_hours,
           g.sync_status, g.google_email is not null as has_google
    from clinics c left join clinic_google_accounts g on g.clinic_id = c.id`);
  console.log("clinics:", JSON.stringify(clinics.rows, null, 2));

  await client.end();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
