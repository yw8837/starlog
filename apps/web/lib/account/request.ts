import "server-only";
import { clientKey, errorResponse, parseCookies } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import { rateLimit, type LimiterName } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { accountSecretMatches } from "./secretCheck";
import { accountSecret } from "./secrets";
import { SESSION_COOKIE, readSession, type Session } from "./session";

export interface AccountContext {
  db: D1Binding;
  /** signs cookies and tokens (STARLOG_SIGNING_SECRET) */
  secret: string;
  /** keys Kakao lookups and seals saved readings (STARLOG_ACCOUNT_SECRET) */
  accountSecret: string;
  now: number;
  cookies: Record<string, string>;
  owner: boolean;
  session: Session | null;
}

let loggedUnavailable = false;
let loggedMismatch = false;

/**
 * What an account or payment route needs, or 503 PAY_UNAVAILABLE:
 * - D1 or a secret is missing (logged once, by name);
 * - the account secret is not the one D1 was first used with (logged once). Fail closed: a wrong
 *   secret would hand returning users fresh accounts and lose their saved readings.
 */
export async function openAccount(request: Request, now: number = Date.now()): Promise<AccountContext | Response> {
  const db = accountDb();
  const secret = signingSecret();
  const sealing = accountSecret();
  if (!db || !secret || !sealing) {
    if (!loggedUnavailable) {
      loggedUnavailable = true;
      console.error(JSON.stringify({ evt: "config.account_unavailable", db: Boolean(db), signing: Boolean(secret), account: Boolean(sealing) }));
    }
    return errorResponse("PAY_UNAVAILABLE");
  }
  if (!(await accountSecretMatches(db, sealing, now))) {
    if (!loggedMismatch) {
      loggedMismatch = true;
      console.error(JSON.stringify({ evt: "config.account_secret_mismatch" }));
    }
    return errorResponse("PAY_UNAVAILABLE");
  }
  const cookies = parseCookies(request);
  return {
    db,
    secret,
    accountSecret: sealing,
    now,
    cookies,
    owner: await isOwner(cookies[OWNER_COOKIE], secret, now),
    session: await readSession(db, cookies[SESSION_COOKIE], secret, now),
  };
}

/**
 * The per-IP limiter, then for state-changing requests the same-origin check, then openAccount.
 * Every account and payment route starts here.
 */
export async function openAccountRoute(request: Request, options: { limiter: LimiterName; write?: boolean }): Promise<AccountContext | Response> {
  if (!(await rateLimit(options.limiter, clientKey(request)))) return errorResponse("RATE_LIMIT");
  if (options.write && !sameOrigin(request)) return errorResponse("FORBIDDEN");
  return openAccount(request);
}

export function requireSession(ctx: AccountContext): Session | Response {
  return ctx.session ?? errorResponse("LOGIN_REQUIRED");
}

/**
 * A state-changing request from our own pages: Origin, or else Referer, has this request's origin.
 * With SameSite=Lax cookies and JSON-only bodies this closes cross-site request forgery.
 */
export function sameOrigin(request: Request): boolean {
  const own = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === own;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === own;
  } catch {
    return false;
  }
}
