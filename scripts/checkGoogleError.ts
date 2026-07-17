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
  const r = await c.query("select sync_status, last_sync_error, token_expiry, updated_at from clinic_google_accounts");
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
