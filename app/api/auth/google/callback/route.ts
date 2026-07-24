import { exchangeCodeForTokens, verifyState } from "@/lib/google/oauthClient";
import { encryptToken } from "@/lib/google/tokenCrypto";
import { upsertSchoolGoogleAccount } from "@/lib/supabase/queries";

// Google redirects here after the school grants (or denies) calendar access.
// See /docs/GOOGLE_CALENDAR_INTEGRATION.md §4.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error) {
    return new Response(`Google Calendar connection was not completed: ${error}`, {
      status: 400,
    });
  }
  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }

  const schoolId = verifyState(state);
  if (!schoolId) {
    return new Response("Invalid or expired state", { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    await upsertSchoolGoogleAccount({
      schoolId,
      googleEmail: tokens.googleEmail,
      calendarId: "primary",
      encryptedAccessToken: encryptToken(tokens.accessToken),
      encryptedRefreshToken: encryptToken(tokens.refreshToken),
      tokenExpiry: new Date(tokens.expiryDate).toISOString(),
      scope: tokens.scope,
    });

    return new Response(
      `Google Calendar connected for school ${schoolId} (${tokens.googleEmail}). You can close this tab.`,
      { status: 200 },
    );
  } catch (err) {
    console.error("Google Calendar OAuth callback failed", err);
    return new Response("Failed to complete Google Calendar connection. Please try again.", {
      status: 500,
    });
  }
}
