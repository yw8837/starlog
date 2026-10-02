import type { CookieSpec } from "@/lib/api/http";
import { KakaoError, kakaoConfigProblems, kakaoLogin } from "@/lib/account/kakao";
import { CLEAR_OAUTH, OAUTH_COOKIE, openOAuthState } from "@/lib/account/oauthState";
import { redirectTo } from "@/lib/account/redirect";
import { openAccountRoute } from "@/lib/account/request";
import { kakaoKey } from "@/lib/account/secrets";
import { createSession, revokeSession } from "@/lib/account/session";
import { loginKakaoUser, userByKakaoKey } from "@/lib/account/users";
import { SITE } from "@/lib/config";
import { grantSignupGift } from "@/lib/pay/ledger";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";

/**
 * GET ?code&state (or ?error&state) from Kakao. The state must match this browser's sl_oauth cookie.
 * - Login: find the account, or create one while sales are open for this device (paused: existing
 *   accounts only, else ?login=closed). While sales are open the signup gift is tried on every login
 *   (once per Kakao account). Start a session and return with ?login=ok|cancel|failed.
 * - The Kakao settings are checked again here: the code is never used against a half-configured app.
 * - The account-deletion re-check (purpose "delete") is handled in Task 12.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return redirectTo(request, "/", { login: "unavailable" }, [CLEAR_OAUTH]);
  const intent = await openOAuthState(ctx.cookies[OAUTH_COOKIE], url.searchParams.get("state"), ctx.secret, ctx.now);
  if (!intent) return redirectTo(request, "/", { login: "failed" }, [CLEAR_OAUTH]);
  const back = (flag: string, cookies: Array<CookieSpec | string> = []) => redirectTo(request, intent.returnTo, { login: flag }, [CLEAR_OAUTH, ...cookies]);
  if (url.searchParams.get("error")) return back("cancel");
  const code = url.searchParams.get("code");
  if (!code) return back("failed");
  if (intent.purpose !== "login") return redirectTo(request, "/me", { delete: "failed" }, [CLEAR_OAUTH]);
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
  const open = salesOpen(paymentsMode(), ctx.owner);
  if (!open && !(await userByKakaoKey(ctx.db, key))) return back("closed");
  const account = await loginKakaoUser(ctx.db, { key, nickname: login.profile.nickname, ageConfirmed: intent.age, now: ctx.now });
  if (!account) {
    console.warn(JSON.stringify({ evt: "auth.account_still_erasing" }));
    return back("failed");
  }
  const { user, created } = account;
  const gifted = open ? await grantSignupGift(ctx.db, { userId: user.id, kakaoKey: key, units: SITE.price.signupGiftFree, now: ctx.now }) : false;
  if (ctx.session) await revokeSession(ctx.db, ctx.session.id, ctx.now);
  const session = await createSession(ctx.db, user.id, ctx.secret, ctx.now);
  console.info(JSON.stringify({ evt: "auth.login", created, gifted }));
  return back("ok", [session.cookie]);
}
