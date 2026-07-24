/* One-off: rebrand the pilot school for demos with a presentable name and
 * address. Data-only; the receptionist reads school identity from the DB
 * every turn, so no deploy is needed. Run: npx tsx scripts/renameClinic.ts
 * NOTE: SCHOOL_ID below is a stale clinic-era pilot value — point it at a
 * real schools.id before running.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const SCHOOL_ID = "ff605796-fc70-42cb-b10d-ef67c5b5d092";
const NEW_NAME = "Sunrise Public School";
const NEW_ADDRESS = "No. 1/211, Sourasra Colony Minibus Stand, Meenakshi Nagar, Sakkimangalam, Madurai - 625 201";
// The school's real Google Maps pin (owner-provided short link).
const NEW_MAPS_URL = "https://maps.app.goo.gl/RUWQQbPhXMLhmU8J8";

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
    `update schools
     set name = $1, address = $2, maps_url = $3, knowledge_version = knowledge_version + 1
     where id = $4`,
    [NEW_NAME, NEW_ADDRESS, NEW_MAPS_URL, SCHOOL_ID],
  );

  await c.query(
    `update school_faqs
     set answer = $1
     where school_id = $2 and faq_id = 'location'`,
    [`We are at ${NEW_ADDRESS}.`, SCHOOL_ID],
  );

  const check = await c.query(
    `select name, address, maps_url, city from schools where id = $1`,
    [SCHOOL_ID],
  );
  console.log("school now:", JSON.stringify(check.rows[0], null, 2));
  const faq = await c.query(
    `select answer from school_faqs where school_id = $1 and faq_id = 'location'`,
    [SCHOOL_ID],
  );
  console.log("location FAQ:", faq.rows[0]?.answer);
  await c.end();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
