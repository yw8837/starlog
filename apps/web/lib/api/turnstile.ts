import "server-only";
import { BOT_TOKEN_HEADER } from "@/lib/reading/api";
import { errorResponse, type Gate } from "./http";

/**
 * Cloudflare Turnstile before the free generations that cost model money (the tarot and saju
 * teasers, 오늘의 한 장, the 오픈 기념 무료 reading, the premium previews): the browser proves itself
 * with a single-use token in the `x-turnstile-token` header, checked with Siteverify before anything
 * is generated or counted.
 * - Off unless both TURNSTILE_SITE_KEY (public, a wrangler var) and TURNSTILE_SECRET_KEY (a Worker
 *   secret) are set: dev, unit tests and e2e run without it. Only one of them set is logged once per
 *   isolate, by name (an error in production when the site key is set and the secret is not).
 * - No token, or one Siteverify does not pass: 403 BOT_CHECK carrying the site key, so the page runs
 *   the challenge and tries once more (lib/reading/api.ts postGeneration).
 * - Siteverify cannot answer (network error, timeout, 5xx, not JSON) or the failure is ours (its
 *   internal error, a secret it does not accept): the request passes, logged as an error.
 *   Availability over strictness: an outage or a slip on our side must not close the free readings
 *   to everyone; the per-network limiters and day counts still hold.
 * - The owner pass skips it. Logs never carry the token, the secret or the IP.
 */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5_000;
/** Siteverify's limit: a longer token is never valid. */
const MAX_TOKEN_LENGTH = 2048;
/** Siteverify error codes that are not the visitor's doing. */
const OUR_FAILURES = new Set(["internal-error", "missing-input-secret", "invalid-input-secret"]);

export interface TurnstileConfig {
  siteKey: string;
  secret: string;
}

let warned = false;

/** Both keys, or null when the check is off. */
export function turnstileConfig(env: NodeJS.ProcessEnv = process.env): TurnstileConfig | null {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() ?? "";
  const secret = env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  if (siteKey && secret) return { siteKey, secret };
  if ((siteKey || secret) && !warned) {
    warned = true;
    const line = JSON.stringify({ evt: "config.turnstile_off", missing: siteKey ? "TURNSTILE_SECRET_KEY" : "TURNSTILE_SITE_KEY" });
    if (siteKey && env.NODE_ENV === "production") console.error(line);
    else console.warn(line);
  }
  return null;
}

type Siteverify = { success?: unknown; "error-codes"?: unknown };

/** Siteverify's answer, or null when it cannot be had. */
async function siteverify(secret: string, token: string, ip: string | undefined): Promise<Siteverify | null> {
  try {
    const response = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (response.status >= 500) {
      console.error(JSON.stringify({ evt: "bot_check.unverified", status: response.status }));
      return null;
    }
    return (await response.json()) as Siteverify;
  } catch (error) {
    console.error(JSON.stringify({ evt: "bot_check.unverified", error: error instanceof Error ? error.name : typeof error }));
    return null;
  }
}

/** Null when the request may go on; the 403 BOT_CHECK otherwise. */
export async function checkBot(request: Request, gate: Gate): Promise<Response | null> {
  const config = turnstileConfig();
  if (!config || gate.owner) return null;
  const refused = () => errorResponse("BOT_CHECK", { siteKey: config.siteKey });
  const token = request.headers.get(BOT_TOKEN_HEADER)?.trim() ?? "";
  if (!token || token.length > MAX_TOKEN_LENGTH) return refused();
  const result = await siteverify(config.secret, token, request.headers.get("cf-connecting-ip")?.trim() || undefined);
  if (!result || result.success === true) return null;
  const codes = Array.isArray(result["error-codes"]) ? result["error-codes"].filter((code): code is string => typeof code === "string") : [];
  if (codes.some((code) => OUR_FAILURES.has(code))) {
    console.error(JSON.stringify({ evt: "bot_check.unverified", codes }));
    return null;
  }
  console.info(JSON.stringify({ evt: "bot_check.refused", codes }));
  return refused();
}
