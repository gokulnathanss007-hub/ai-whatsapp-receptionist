import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Meta's X-Hub-Signature-256 header over the raw request body.
 * Must run on the raw (unparsed) body bytes — see /docs/PROJECT_ARCHITECTURE.md §2.1.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) throw new Error("META_APP_SECRET must be set");

  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf-8").digest("hex");

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== receivedBuf.length) return false;

  return timingSafeEqual(expectedBuf, receivedBuf);
}

/** Handles Meta's GET verification handshake. Returns the challenge to echo, or null if invalid. */
export function verifyWebhookHandshake(
  mode: string | null,
  token: string | null,
  challenge: string | null,
): string | null {
  const verifyToken = process.env.META_VERIFY_TOKEN;
  if (!verifyToken) throw new Error("META_VERIFY_TOKEN must be set");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return challenge;
  }
  return null;
}
