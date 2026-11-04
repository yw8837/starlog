import "server-only";
import { openAccount } from "@/lib/account/request";
import { sessionCookieName } from "@/lib/account/session";
import { accountDb } from "@/lib/db";
import { kstDay, nextKstMidnight, quotaLimits } from "@/lib/security/quota";
import { keyedHash } from "@/lib/security/sign";
import { errorResponse, parseCookies, type Gate } from "./http";

/**
 * Free AI readings need a login (owner 2026-11-04): the tarot and saju 맛보기 (premium previews included) and 오늘의 한 장,
 * viewing and generating. A visitor gets 401 LOGIN_REQUIRED with its `reason` before the browser check (Turnstile) and before
 * anything is generated or counted; a logged-in account is counted on the server, per KST day (takePlace, in D1), so
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

export type CountKind = "teaser" | "daily";

/** A place taken among the account's free `kind` of one KST day; giveBackPlace returns it. */
export interface Place {
  key: string;
  day: string;
  kind: CountKind;
}

/**
 * Takes this account's next place among today's free `kind` (quotaLimits: 5 맛보기; 오늘의 한 장's 2 regenerations) before the
 * generation starts, in one atomic UPSERT in D1 (migrations/0021_account_day_counts.sql), so requests sent together each get a
 * number of their own and never pass the cap (code review 2026-11-04: the KV count read and wrote back). Null for the owner pass
 * (no count); 429 BETA_LIMIT once the day's places are taken; 503 when the count cannot be read or written.
 */
export async function takePlace(gate: Gate, member: Member, kind: CountKind): Promise<Place | null | Response> {
  if (gate.owner) return null;
  const limit = quotaLimits()[kind];
  const taken = () => errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now) });
  if (limit <= 0) return taken();
  const db = accountDb();
  if (!db) return errorResponse("AI_UNAVAILABLE");
  const day = kstDay(gate.now);
  let row: { n: number } | null;
  try {
    row = await db
      .prepare(
        `INSERT INTO account_day_counts (account_key, kst_day, kind, n) VALUES (?, ?, ?, 1)
         ON CONFLICT (account_key, kst_day, kind) DO UPDATE SET n = account_day_counts.n + 1 WHERE account_day_counts.n < ?
         RETURNING n`,
      )
      .bind(member.key, day, kind, limit)
      .first<{ n: number }>();
  } catch (error) {
    console.error(JSON.stringify({ evt: "member.count_failed", kind, error: error instanceof Error ? error.constructor.name : typeof error }));
    return errorResponse("AI_UNAVAILABLE");
  }
  return row ? { key: member.key, day, kind } : taken();
}

/** A generation that failed gives its place back (never below 0). Best effort: a lost write costs the account one place. */
export async function giveBackPlace(place: Place | null): Promise<void> {
  if (!place) return;
  try {
    await accountDb()
      ?.prepare("UPDATE account_day_counts SET n = n - 1 WHERE account_key = ? AND kst_day = ? AND kind = ? AND n > 0")
      .bind(place.key, place.day, place.kind)
      .run();
  } catch (error) {
    console.error(JSON.stringify({ evt: "member.give_back_failed", kind: place.kind, error: error instanceof Error ? error.constructor.name : typeof error }));
  }
}

/** The marker of this account a device keeps with its 오늘의 한 장 (code review 2026-11-04): neither users.id nor its key. */
export const dailyViewer = (member: Member, secret: string) => keyedHash(member.key, secret, "starlog/daily-viewer/v1");
