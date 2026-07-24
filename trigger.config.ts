import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@trigger.dev/sdk";
import { additionalFiles, syncEnvVars } from "@trigger.dev/build/extensions/core";

// Pushes this project's own .env.local into the Trigger.dev project's "prod"
// environment on every deploy — this project was repointed at the school's
// own Supabase project (2026-07-23) while reusing the clinic's Trigger.dev
// project id, so the Trigger.dev-side env vars must be kept in sync
// separately from Vercel's (they are not shared automatically).
const SYNCED_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "META_WHATSAPP_TOKEN",
  "META_APP_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
  "GOOGLE_OAUTH_REDIRECT_URI",
];

function loadLocalEnv(): Record<string, string> {
  const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]!] = m[2]!.replace(/^"|"$/g, "");
  }
  return env;
}

export default defineConfig({
  project: "proj_nqbpvemckwtqbfysizvp",
  dirs: ["./trigger"],
  maxDuration: 60,
  build: {
    extensions: [
      additionalFiles({ files: ["./prompts/**/*.md"] }),
      syncEnvVars(async () => {
        const env = loadLocalEnv();
        return SYNCED_KEYS.filter((k) => env[k]).map((k) => ({ name: k, value: env[k]! }));
      }),
    ],
  },
});
