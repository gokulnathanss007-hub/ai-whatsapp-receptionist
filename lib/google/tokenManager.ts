import { getGoogleOAuthClient } from "@/lib/google/oauthClient";
import { decryptToken, encryptToken } from "@/lib/google/tokenCrypto";
import {
  getClinicGoogleAccount,
  markClinicGoogleAccountError,
  updateClinicGoogleAccountTokens,
} from "@/lib/supabase/queries";

/**
 * Returns an authenticated OAuth2Client for a clinic's connected Google
 * account, refreshing the access token first if it's expired. Returns null
 * if the clinic has no connection, or if the refresh itself fails (e.g. the
 * clinic revoked access) — in which case sync_status is set to 'error' so
 * callers can fall back gracefully rather than throw.
 */
export async function getValidGoogleClient(
  clinicId: string,
): Promise<ReturnType<typeof getGoogleOAuthClient> | null> {
  const account = await getClinicGoogleAccount(clinicId);
  if (!account || account.sync_status !== "connected") return null;

  const client = getGoogleOAuthClient();
  client.setCredentials({
    access_token: decryptToken(account.access_token),
    refresh_token: decryptToken(account.refresh_token),
    expiry_date: new Date(account.token_expiry).getTime(),
    scope: account.scope,
  });

  // googleapis fires this whenever it silently refreshes during a call below —
  // persist the rotated token so we don't re-refresh unnecessarily next time.
  client.on("tokens", (tokens) => {
    void persistRefreshedTokens(clinicId, tokens);
  });

  try {
    // Forces a refresh now if the current access token is expired/near-expiry,
    // rather than waiting for it to fail mid-API-call.
    await client.getAccessToken();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error refreshing Google token";
    await markClinicGoogleAccountError(clinicId, message);
    return null;
  }

  return client;
}

interface RefreshedTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}

async function persistRefreshedTokens(clinicId: string, tokens: RefreshedTokens): Promise<void> {
  if (!tokens.access_token || !tokens.expiry_date) return;
  try {
    await updateClinicGoogleAccountTokens({
      clinicId,
      encryptedAccessToken: encryptToken(tokens.access_token),
      encryptedRefreshToken: tokens.refresh_token
        ? encryptToken(tokens.refresh_token)
        : undefined,
      tokenExpiry: new Date(tokens.expiry_date).toISOString(),
    });
  } catch (err) {
    console.error("Failed to persist refreshed Google tokens", err);
  }
}
