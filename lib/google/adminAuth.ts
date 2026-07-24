import { timingSafeEqual } from "node:crypto";

// MVP-only gate for the Google Calendar setup routes (connect/status), since
// no staff auth/dashboard exists yet in this codebase. Not a real auth
// system — see /docs/GOOGLE_CALENDAR_INTEGRATION.md §9. Operators generate a
// per-school connect link manually using ADMIN_SETUP_TOKEN.
export function isAdminRequestAuthorized(url: URL): boolean {
  const expected = process.env.ADMIN_SETUP_TOKEN;
  const provided = url.searchParams.get("admin_token");
  if (!expected || !provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
