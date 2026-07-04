import { createHmac, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";

// Calendar read/write (needed for freebusy + event creation in Phase 2) plus
// userinfo.email so we can record *which* Google account got connected —
// useful for a clinic to confirm "yes, that's Dr. Priya's calendar."
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];

const STATE_TTL_MS = 10 * 60 * 1000;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

export function getGoogleOAuthClient() {
  return new google.auth.OAuth2(
    getEnv("GOOGLE_CLIENT_ID"),
    getEnv("GOOGLE_CLIENT_SECRET"),
    getEnv("GOOGLE_OAUTH_REDIRECT_URI"),
  );
}

// Signs `clinicId` into the OAuth `state` param so the callback can trust it
// without a session, and an attacker can't attach their own Google tokens to
// an arbitrary clinic_id by hand-crafting a callback URL. Reuses
// GOOGLE_TOKEN_ENCRYPTION_KEY as the HMAC key — same trust boundary
// (server-only secret) as token encryption, no need for a third secret.
export function signState(clinicId: string): string {
  const payload = Buffer.from(JSON.stringify({ clinicId, ts: Date.now() })).toString(
    "base64url",
  );
  const signature = createHmac("sha256", getEnv("GOOGLE_TOKEN_ENCRYPTION_KEY"))
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyState(state: string): string | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", getEnv("GOOGLE_TOKEN_ENCRYPTION_KEY"))
    .update(payload)
    .digest("base64url");

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signature);
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    return null;
  }

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof (decoded as { clinicId?: unknown }).clinicId !== "string" ||
      typeof (decoded as { ts?: unknown }).ts !== "number"
    ) {
      return null;
    }
    const { clinicId, ts } = decoded as { clinicId: string; ts: number };
    if (Date.now() - ts > STATE_TTL_MS) return null;
    return clinicId;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(clinicId: string): string {
  return getGoogleOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state: signState(clinicId),
  });
}

export interface GoogleTokenResult {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  scope: string;
  googleEmail: string;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResult> {
  const client = getGoogleOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date || !tokens.scope) {
    // Google only issues a refresh_token on the *first* consent for a given
    // account+app. A clinic reconnecting after already granting access once
    // can silently get no refresh_token back — prompt:"consent" above forces
    // re-consent to avoid this, but this is a clear error if it still happens.
    throw new Error(
      "Google did not return a full token set (access_token, refresh_token, expiry_date, " +
        "scope). If this account connected before, revoke access at " +
        "https://myaccount.google.com/permissions and try again.",
    );
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const userinfo = await oauth2.userinfo.get();
  const googleEmail = userinfo.data.email;
  if (!googleEmail) throw new Error("Google did not return an account email");

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date,
    scope: tokens.scope,
    googleEmail,
  };
}
