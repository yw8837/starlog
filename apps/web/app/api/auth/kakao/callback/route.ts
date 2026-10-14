import type { CookieSpec } from "@/lib/api/http";
import { deleteAccount } from "@/lib/account/deletion";
import { KakaoError, kakaoConfigProblems, kakaoLogin, kakaoUnlink } from "@/lib/account/kakao";
import { clearOAuth, oauthCookieName, openOAuthState } from "@/lib/account/oauthState";
import { redirectTo } from "@/lib/account/redirect";
import { openAccountRoute, type AccountContext } from "@/lib/account/request";
import { kakaoKey } from "@/lib/account/secrets";
import { clearSession, createSession, revokeSession } from "@/lib/account/session";
import { loginKakaoUser, userByKakaoKey } from "@/lib/account/users";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";
import { tossClient } from "@/lib/pay/toss";

type Back = (flag: string, cookies?: Array<CookieSpec | string>) => Response;

/**
 * GET ?code&state (or ?error&state) from Kakao. The state must match this browser's OAuth state cookie (oauthCookieName),
 * and the Kakao settings are checked again before the code is used.
 * - login: find the account, or create one while sales are open for this device (paused: existing
 *   accounts only, else ?login=closed). No signup gift (removed, owner 2026-10-14 evening: one person
 *   could join with Kakao and with Google and get two). Start a session and return with ?login=ok|cancel|failed.
 * - delete: the same Kakao account as the session must answer. Then deleteAccount() settles,
 *   refunds and erases, the app is unlinked from Kakao, and we land on /me?account=deleted (spec 5.8).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return redirectTo(request, "/", { login: "unavailable" }, [clearOAuth()]);
  const intent = await openOAuthState(ctx.cookies[oauthCookieName()], url.searchParams.get("state"), ctx.secret, ctx.now);
  if (!intent) return redirectTo(request, "/", { login: "failed" }, [clearOAuth()]);
  const deleting = intent.purpose === "delete";
  const back: Back = (flag, cookies = []) =>
    deleting
      ? redirectTo(request, "/me", { delete: flag }, [clearOAuth(), ...cookies])
      : redirectTo(request, intent.returnTo, { login: flag }, [clearOAuth(), ...cookies]);
  if (url.searchParams.get("error")) return back("cancel");
  const code = url.searchParams.get("code");
  if (!code) return back("failed");
  const problems = kakaoConfigProblems();
  if (problems.length) {
    console.error(JSON.stringify({ evt: "config.kakao_invalid", problems }));
    return back("unavailable");
  }

  let login: Awaited<ReturnType<typeof kakaoLogin>>;
  try {
    login = await kakaoLogin(code);
  } catch (error) {
    console.error(JSON.stringify({ evt: "auth.kakao_failed", step: error instanceof KakaoError ? error.step : "unknown", status: error instanceof KakaoError ? error.status : 0 }));
    return back("failed");
  }
  const key = await kakaoKey(login.profile.id, ctx.accountSecret);
  return deleting ? finishDelete(request, ctx, intent.sid, key, login.accessToken, back) : finishLogin(ctx, key, login.profile.nickname, intent.age, back);
}

async function finishLogin(ctx: AccountContext, key: string, nickname: string, age: boolean, back: Back): Promise<Response> {
  const open = salesOpen(paymentsMode(), ctx.owner);
  if (!open && !(await userByKakaoKey(ctx.db, key))) return back("closed");
  const account = await loginKakaoUser(ctx.db, { key, nickname, ageConfirmed: age, now: ctx.now });
  if (!account) {
    console.warn(JSON.stringify({ evt: "auth.account_still_erasing" }));
    return back("failed");
  }
  const { user, created } = account;
  if (ctx.session) await revokeSession(ctx.db, ctx.session.id, ctx.now);
  const session = await createSession(ctx.db, user.id, ctx.secret, ctx.now);
  console.info(JSON.stringify({ evt: "auth.login", created }));
  return back("ok", [session.cookie]);
}

async function finishDelete(request: Request, ctx: AccountContext, sid: string | undefined, key: string, accessToken: string, back: Back): Promise<Response> {
  if (!ctx.session || ctx.session.id !== sid) return back("failed");
  if (ctx.session.user.kakao_key !== key) return back("mismatch");
  const outcome = await deleteAccount(ctx.db, tossClient(), { userId: ctx.session.user.id, now: ctx.now });
  if (!outcome.ok) return back(outcome.code === "PENDING" ? "pending" : outcome.code === "IN_USE" ? "in-use" : "refund-failed");
  // The account is gone either way: an unlink Kakao refused or never answered is logged, not an error.
  const unlinked = await kakaoUnlink(accessToken).catch(() => false);
  if (!unlinked) console.warn(JSON.stringify({ evt: "auth.kakao_unlink_failed" }));
  return redirectTo(request, "/me", { account: "deleted" }, [clearOAuth(), clearSession()]);
}
