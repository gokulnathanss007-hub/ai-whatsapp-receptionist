/* One-off: set the pilot clinic's direct reception contact number, shown on
 * the "Talk to Receptionist" handoff. Data-only. Run:
 *   npx tsx scripts/setReceptionPhone.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const CLINIC_ID = "ff605796-fc70-42cb-b10d-ef67c5b5d092";
const RECEPTION_PHONE = "8778303075";

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

  await c.query(
    `update clinics set reception_phone = $1, knowledge_version = knowledge_version + 1 where id = $2`,
    [RECEPTION_PHONE, CLINIC_ID],
  );

  const check = await c.query(`select name, reception_phone from clinics where id = $1`, [CLINIC_ID]);
  console.log("clinic now:", JSON.stringify(check.rows[0], null, 2));
  await c.end();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
