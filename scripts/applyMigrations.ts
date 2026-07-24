/* One-off migration runner for migrations 0005-0012 + the working-hours
 * seed, using the direct Supabase Postgres connection. Idempotent: each
 * migration is skipped if its column/function/table already exists. Run
 * with: npx tsx scripts/applyMigrations.ts
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

async function tableExists(client: Client, table: string): Promise<boolean> {
  const res = await client.query(`select 1 from information_schema.tables where table_name = $1`, [table]);
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

  // 0005-0011 predate the school rename (0012) and were written against the
  // original `clinics` table name — they must run BEFORE 0012 renames it.
  // Once `clinics` is gone, 0012 has already run and renamed it to `schools`,
  // so 0005-0011 are necessarily already applied too (they altered the same
  // table 0012 later renamed) — skip the whole block rather than querying a
  // table that no longer exists.
  if (!(await tableExists(client, "clinics"))) {
    console.log("0005-0011 already applied — clinics table already renamed to schools, skipping");
  } else {
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

    // 0009 — clinics.interactive_enabled (V2 interactive rollout flag)
    if (await columnExists(client, "clinics", "interactive_enabled")) {
      console.log("0009 already applied — skipping");
    } else {
      await client.query(migration("0009_clinic_interactive_flag.sql"));
      console.log("0009 applied (clinics.interactive_enabled)");
    }

    // 0010 — conversations.current_screen (Parent Experience journey state)
    if (await columnExists(client, "conversations", "current_screen")) {
      console.log("0010 already applied — skipping");
    } else {
      await client.query(migration("0010_conversation_current_screen.sql"));
      console.log("0010 applied (conversations.current_screen)");
    }

    // 0011 — clinics.reception_phone (direct contact number on handoff)
    if (await columnExists(client, "clinics", "reception_phone")) {
      console.log("0011 already applied — skipping");
    } else {
      await client.query(migration("0011_clinic_reception_phone.sql"));
      console.log("0011 applied (clinics.reception_phone)");
    }

    // 0012 — clinic → school domain rename (renames clinics→schools,
    // patients→parents, appointment_requests→admission_enquiries, etc.)
    await client.query(migration("0012_rename_clinic_to_school.sql"));
    console.log("0012 applied (clinics→schools, patients→parents, and related renames)");
  }

  // Pilot school targeted by ID, never by name — the demo school may be
  // renamed again for demos; name-based updates silently become no-ops
  // after that.
  const PILOT_SCHOOL_ID = "ff605796-fc70-42cb-b10d-ef67c5b5d092";

  const interactive = await client.query(
    `update schools set interactive_enabled = true where id = $1 and interactive_enabled = false returning id`,
    [PILOT_SCHOOL_ID],
  );
  console.log(interactive.rowCount ? "enabled interactive_enabled for pilot school" : "interactive flag already set — skipped");

  // Seed working hours (only where still empty, so re-runs never clobber)
  const seeded = await client.query(
    `update schools
    set opening_hours = '{
        "mon": [["09:00", "16:00"]],
        "tue": [["09:00", "16:00"]],
        "wed": [["09:00", "16:00"]],
        "thu": [["09:00", "16:00"]],
        "fri": [["09:00", "16:00"]],
        "sat": [["09:00", "16:00"]]
      }'::jsonb,
      slot_duration_minutes = 30,
      timezone = 'Asia/Kolkata'
    where id = $1 and opening_hours = '{}'::jsonb
    returning id`,
    [PILOT_SCHOOL_ID],
  );
  console.log(seeded.rowCount ? "seeded pilot school opening_hours" : "opening_hours already set — seed skipped");

  const schools = await client.query(`
    select s.id, s.name, s.timezone, s.opening_hours != '{}'::jsonb as has_hours,
           g.sync_status, g.google_email is not null as has_google
    from schools s left join school_google_accounts g on g.school_id = s.id`);
  console.log("schools:", JSON.stringify(schools.rows, null, 2));

  await client.end();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
