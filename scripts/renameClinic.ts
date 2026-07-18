/* One-off: rebrand the pilot clinic for demos — "Medixum Clinic" (agency
 * name, presentable to any prospect) with the new address. Data-only; the
 * receptionist reads clinic identity from the DB every turn, so no deploy
 * is needed. Run: npx tsx scripts/renameClinic.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const CLINIC_ID = "ff605796-fc70-42cb-b10d-ef67c5b5d092";
const NEW_NAME = "Medixum Clinic";
const NEW_ADDRESS = "No. 1/211, Sourasra Colony Minibus Stand, Meenakshi Nagar, Sakkimangalam, Madurai - 625 201";
const NEW_MAPS_URL =
  "https://maps.google.com/?q=Sourasra+Colony+Minibus+Stand,+Meenakshi+Nagar,+Sakkimangalam,+Madurai+625201";

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
    `update clinics
     set name = $1, address = $2, maps_url = $3, knowledge_version = knowledge_version + 1
     where id = $4`,
    [NEW_NAME, NEW_ADDRESS, NEW_MAPS_URL, CLINIC_ID],
  );

  await c.query(
    `update clinic_faqs
     set answer = $1
     where clinic_id = $2 and faq_id = 'location'`,
    [`We are at ${NEW_ADDRESS}.`, CLINIC_ID],
  );

  const check = await c.query(
    `select name, address, maps_url, city from clinics where id = $1`,
    [CLINIC_ID],
  );
  console.log("clinic now:", JSON.stringify(check.rows[0], null, 2));
  const faq = await c.query(
    `select answer from clinic_faqs where clinic_id = $1 and faq_id = 'location'`,
    [CLINIC_ID],
  );
  console.log("location FAQ:", faq.rows[0]?.answer);
  await c.end();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
