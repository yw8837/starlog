import "server-only";
import type { CookieSpec } from "@/lib/api/http";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";
import type { AccountContext } from "./request";
import { createSession, revokeSession } from "./session";
import { loginKakaoUser, userByKakaoKey } from "./users";

/**
 * The login policy of a checked Google account (`key` = googleUserKey(sub)), shared by the web callback
 * (api/auth/google/callback) and the Starlog app's native sign-in (api/auth/google/native): find the account, or create
 * one while sales are open for this device (paused: existing accounts only, else "closed"); no signup gift; the nickname is
 * 별손님. A session this browser held is revoked and a new one started; its cookie comes back for the caller to set.
 */
export async function googleLoginSession(ctx: AccountContext, key: string, age: boolean): Promise<{ ok: true; cookie: CookieSpec } | { ok: false; flag: "closed" | "failed" }> {
  const open = salesOpen(paymentsMode(), ctx.owner);
  if (!open && !(await userByKakaoKey(ctx.db, key))) return { ok: false, flag: "closed" };
  const account = await loginKakaoUser(ctx.db, { key, nickname: "", ageConfirmed: age, now: ctx.now });
  if (!account) {
    console.warn(JSON.stringify({ evt: "auth.account_still_erasing" }));
    return { ok: false, flag: "failed" };
  }
  const { user, created } = account;
  if (ctx.session) await revokeSession(ctx.db, ctx.session.id, ctx.now);
  const session = await createSession(ctx.db, user.id, ctx.secret, ctx.now);
  console.info(JSON.stringify({ evt: "auth.login", provider: "google", created }));
  return { ok: true, cookie: session.cookie };
}
