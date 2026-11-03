import "server-only";
import { openAccount } from "@/lib/account/request";
import { sessionCookieName } from "@/lib/account/session";
import { nextKstMidnight, quotaLimits } from "@/lib/security/quota";
import { keyedHash } from "@/lib/security/sign";
import { errorResponse, parseCookies, type Gate } from "./http";
import { accountCount, recordAccountSpend } from "./spend";

/**
 * Free AI readings need a login (owner 2026-11-04): the tarot and saju 맛보기 (premium previews included) and 오늘의 한 장,
 * viewing and generating. A visitor gets 401 LOGIN_REQUIRED with its `reason` before the browser check (Turnstile) and before
 * anything is generated or counted; a logged-in account is counted on the server, per KST day (spend.ts accountCount), so
 * clearing cookies resets nothing. The owner pass skips the counts, never the login.
 */

export type LoginReason = "teaser" | "daily";

const LOGIN_MESSAGE: Readonly<Record<LoginReason, string>> = {
  teaser: "맛보기 풀이는 로그인하고 볼 수 있어요. 카카오나 Google로 로그인하면 고른 카드와 입력한 정보 그대로 이어서 볼 수 있어요.",
  daily: "오늘의 한 장은 로그인하고 볼 수 있어요. 로그인하면 어느 기기에서든 같은 카드가 보여요.",
};

export const loginRequired = (reason: LoginReason) => errorResponse("LOGIN_REQUIRED", { reason, message: LOGIN_MESSAGE[reason] });

/** The account's pseudonym in the day counters and in 오늘의 한 장: HMAC of users.id under its own subkey, never the id itself. */
const ACCOUNT_KEY_LABEL = "starlog/account-id/v1";

export interface Member {
  /** base64url HMAC-SHA256 of users.id (keyedHash, ACCOUNT_KEY_LABEL) */
  key: string;
}

/**
 * The logged-in account behind this request, or the answer instead: 401 LOGIN_REQUIRED (`reason`) for a visitor (no session
 * cookie: answered without asking D1), and 503 PAY_UNAVAILABLE when the account store cannot be asked (fail closed).
 */
export async function requireMember(request: Request, secret: string, now: number, reason: LoginReason): Promise<Member | Response> {
  if (!parseCookies(request)[sessionCookieName()]) return loginRequired(reason);
  let ctx: Awaited<ReturnType<typeof openAccount>>;
  try {
    ctx = await openAccount(request, now);
  } catch (error) {
    console.error(JSON.stringify({ evt: "member.account_failed", reason, error: error instanceof Error ? error.constructor.name : typeof error }));
    return errorResponse("PAY_UNAVAILABLE");
  }
  if (ctx instanceof Response) return ctx;
  const user = ctx.session?.user;
  if (!user) return loginRequired(reason);
  return { key: await keyedHash(user.id, secret, ACCOUNT_KEY_LABEL) };
}

/**
 * 429 BETA_LIMIT once this account was given its free `kind` for today (quotaLimits: 5 teasers; 오늘의 한 장's
 * regenerations), 503 when the count cannot be read; null to go on. The owner pass skips it.
 */
export async function checkMemberLimit(gate: Gate, member: Member, kind: "teaser" | "daily", extra: Record<string, unknown> = {}): Promise<Response | null> {
  if (gate.owner) return null;
  const used = await accountCount(member.key, kind, gate.now);
  if (used === null) return errorResponse("AI_UNAVAILABLE");
  return used >= quotaLimits()[kind] ? errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now), ...extra }) : null;
}

/** Counts one free `kind` for the account, after a validated generation (none for the owner pass). */
export async function recordMemberSpend(gate: Gate, member: Member, kind: "teaser" | "daily"): Promise<void> {
  if (!gate.owner) await recordAccountSpend(member.key, kind, gate.now);
}
