/* One-off: close all open conversations for the pilot clinic so testing
 * starts from a clean greeting → Main Menu state. Patient records persist;
 * only conversation state (stage/collected scheduling prefs) is retired.
 * Run: npx tsx scripts/closeTestConversations.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

async function main() {
  const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]!] = m[2]!;
  }
  const ref = new URL(env.SUPABASE_URL!).hostname.split(".")[0]!;
  const c = new Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(env.SUPABASE_DB_PASSWORD!)}@db.${ref}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`
    update conversations
    set stage = 'closed', booking_status = 'none', current_screen = 'free_text'
    where stage != 'closed' and booking_status != 'booking_in_progress'
    returning id`);
  console.log(`closed ${r.rowCount} open conversation(s)`);
  await c.end();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
