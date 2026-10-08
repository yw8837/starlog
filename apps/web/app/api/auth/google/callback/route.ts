import type { CookieSpec } from "@/lib/api/http";
import { deleteAccount } from "@/lib/account/deletion";
import { GoogleError, googleConfigProblems, googleLogin, googleRevoke, googleUserKey } from "@/lib/account/google";
import { clearOAuth, oauthCookieName, openOAuthState } from "@/lib/account/oauthState";
import { redirectTo } from "@/lib/account/redirect";
import { openAccountRoute, type AccountContext } from "@/lib/account/request";
import { clearSession, createSession, revokeSession } from "@/lib/account/session";
import { loginKakaoUser, userByKakaoKey } from "@/lib/account/users";
import { grantSignupGift } from "@/lib/pay/ledger";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";
import { tossClient } from "@/lib/pay/toss";

type Back = (flag: string, cookies?: Array<CookieSpec | string>) => Response;

/**
 * GET ?code&state (or ?error&state) from Google: the steps of /api/auth/kakao/callback for a Google account.
 * - The state must match this browser's OAuth state cookie, and the cookie must hold the nonce and the
 *   PKCE verifier /api/auth/google/start keeps there (a state Kakao's start issued has neither). The
 *   Google settings are checked again before the code is used. The account is googleUserKey(sub).
 * - login: find the account, or create one while sales are open for this device (paused: existing
 *   accounts only, else ?login=closed). While sales are open the signup gift is tried on every login
 *   (once per Google account). The nickname is 별손님: Google is asked for nothing but the account id.
 *   Start a session and return with ?login=ok|cancel|failed.
 * - delete: the same Google account as the session must answer. Then deleteAccount() settles, refunds
 *   and erases, the app's access is revoked at Google, and we land on /me?account=deleted (spec 5.8).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return redirectTo(request, "/", { login: "unavailable" }, [clearOAuth()]);
  const intent = await openOAuthState(ctx.cookies[oauthCookieName()], url.searchParams.get("state"), ctx.secret, ctx.now);
  if (!intent?.nonce || !intent.verifier) return redirectTo(request, "/", { login: "failed" }, [clearOAuth()]);
  const { nonce, verifier } = intent;
  const deleting = intent.purpose === "delete";
  const back: Back = (flag, cookies = []) =>
    deleting
      ? redirectTo(request, "/me", { delete: flag }, [clearOAuth(), ...cookies])
      : redirectTo(request, intent.returnTo, { login: flag }, [clearOAuth(), ...cookies]);
  if (url.searchParams.get("error")) return back("cancel");
  const code = url.searchParams.get("code");
  if (!code) return back("failed");
  const problems = googleConfigProblems();
  if (problems.length) {
    console.error(JSON.stringify({ evt: "config.google_invalid", problems }));
    return back("unavailable");
  }

  let login: Awaited<ReturnType<typeof googleLogin>>;
  try {
    login = await googleLogin(code, { nonce, verifier, now: ctx.now });
  } catch (error) {
    console.error(JSON.stringify({ evt: "auth.google_failed", step: error instanceof GoogleError ? error.step : "unknown", status: error instanceof GoogleError ? error.status : 0 }));
    return back("failed");
  }
  const key = await googleUserKey(login.sub, ctx.accountSecret);
  return deleting ? finishDelete(request, ctx, intent.sid, key, login.accessToken, back) : finishLogin(ctx, key, intent.age, back);
}

async function finishLogin(ctx: AccountContext, key: string, age: boolean, back: Back): Promise<Response> {
  const open = salesOpen(paymentsMode(), ctx.owner);
  if (!open && !(await userByKakaoKey(ctx.db, key))) return back("closed");
  const account = await loginKakaoUser(ctx.db, { key, nickname: "", ageConfirmed: age, now: ctx.now });
  if (!account) {
    console.warn(JSON.stringify({ evt: "auth.account_still_erasing" }));
    return back("failed");
  }
  const { user, created } = account;
  const gifted = open ? await grantSignupGift(ctx.db, { userId: user.id, kakaoKey: key, now: ctx.now }) : false;
  if (ctx.session) await revokeSession(ctx.db, ctx.session.id, ctx.now);
  const session = await createSession(ctx.db, user.id, ctx.secret, ctx.now);
  console.info(JSON.stringify({ evt: "auth.login", provider: "google", created, gifted }));
  return back("ok", [session.cookie]);
}

async function finishDelete(request: Request, ctx: AccountContext, sid: string | undefined, key: string, accessToken: string, back: Back): Promise<Response> {
  if (!ctx.session || ctx.session.id !== sid) return back("failed");
  if (ctx.session.user.kakao_key !== key) return back("mismatch");
  const outcome = await deleteAccount(ctx.db, tossClient(), { userId: ctx.session.user.id, now: ctx.now });
  if (!outcome.ok) return back(outcome.code === "PENDING" ? "pending" : outcome.code === "IN_USE" ? "in-use" : "refund-failed");
  // The account is gone either way: a revoke Google refused or never answered is logged, not an error.
  const revoked = await googleRevoke(accessToken).catch(() => false);
  if (!revoked) console.warn(JSON.stringify({ evt: "auth.google_revoke_failed" }));
  return redirectTo(request, "/me", { account: "deleted" }, [clearOAuth(), clearSession()]);
}
