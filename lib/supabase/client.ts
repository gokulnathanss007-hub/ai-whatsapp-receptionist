import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import NodeWebSocket from "ws";

// @supabase/supabase-js's realtime module expects a global WebSocket, which
// is only built into Node 22+. Trigger.dev's runtime container is on Node
// 21, so polyfill it — even though this app never uses realtime features,
// the client eagerly initializes that module.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof NodeWebSocket }).WebSocket = NodeWebSocket;
}

let cachedClient: SupabaseClient | null = null;

// Server-only client using the service-role key. Never import this from
// client components — it bypasses row-level security by design (see
// /supabase/migrations/0001_init.sql "Row-level security" note).
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}
