/* Diagnostic: why did the production pipeline have no availability data? */
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

async function main() {
  const env = loadEnvLocal();
  const ref = new URL(env.SUPABASE_URL!).hostname.split(".")[0]!;
  const client = new Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(env.SUPABASE_DB_PASSWORD!)}@db.${ref}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const school = await client.query(
    `select id, name, auto_confirm_enabled, timezone, opening_hours != '{}'::jsonb as has_hours from schools`,
  );
  console.log("school:", JSON.stringify(school.rows));

  const convos = await client.query(`
    select c.id, p.wa_phone, c.stage, c.booking_status, c.human_handoff, c.last_message_at
    from conversations c join parents p on p.id = c.parent_id
    order by c.last_message_at desc limit 5`);
  console.log("recent conversations:", JSON.stringify(convos.rows, null, 2));

  const msgs = await client.query(`
    select direction, left(body, 90) as body, created_at
    from messages order by created_at desc limit 8`);
  console.log("recent messages:", JSON.stringify(msgs.rows, null, 2));

  await client.end();
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
