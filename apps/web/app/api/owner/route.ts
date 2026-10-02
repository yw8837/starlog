import { clientKey, errorResponse, json, readJson, setCookie } from "@/lib/api/http";
import { OwnerBody } from "@/lib/api/inputs";
import { OWNER_COOKIE, OWNER_COOKIE_MAX_AGE, ownerCode, ownerCookie } from "@/lib/security/owner";
import { rateLimit } from "@/lib/security/rateLimit";
import { safeEqual, signingSecret } from "@/lib/security/sign";

/**
 * POST {code} → sets the owner pass (signed httpOnly cookie, 365 days) when the code equals
 * STARLOG_OWNER_CODE. The owner pass skips every beta quota; the rate limiter still applies (5x).
 * The code is compared in constant time and only ever travels in a POST body.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = signingSecret();
  if (!secret) return errorResponse("AI_UNAVAILABLE");
  if (!(await rateLimit("OWNER_LOGIN_LIMITER", clientKey(request)))) return errorResponse("RATE_LIMIT");
  const body = OwnerBody.safeParse(await readJson(request, 1_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const expected = ownerCode();
  if (!expected || !(await safeEqual(body.data.code.trim(), expected, secret))) return errorResponse("BAD_TOKEN", { message: "코드가 맞지 않아요." });
  const now = Date.now();
  // The pass carries the code's fingerprint: a new STARLOG_OWNER_CODE revokes it.
  return json({ ok: true }, { cookies: [setCookie(OWNER_COOKIE, await ownerCookie(secret, now, expected), OWNER_COOKIE_MAX_AGE)] });
}
