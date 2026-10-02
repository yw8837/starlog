import { deleteIntentFor } from "@/lib/account/deletion";
import { MOCK_CODE_PREFIX, authorizeUrl, isKakaoTalkInApp, kakaoConfigProblems, kakaoMode } from "@/lib/account/kakao";
import { ageChecked, issueOAuthState } from "@/lib/account/oauthState";
import { redirectTo } from "@/lib/account/redirect";
import { openAccountRoute } from "@/lib/account/request";
import { safeReturnTo } from "@/lib/account/returnTo";
import { loginOpen, paymentsMode } from "@/lib/pay/mode";
import { randomId } from "@/lib/security/sign";

/**
 * GET ?returnTo=/path&age=<token> → Kakao's consent screen, with a signed 10-minute state cookie
 * guarding the way back. It works only while login is open for this device (STARLOG_PAYMENTS on, owner
 * mode with the owner pass, or paused for existing accounts), and only after the 만 14세 check on
 * /login: `age` is the 5-minute token POST /api/auth/age signs for it. With STARLOG_KAKAO=mock it goes straight to the callback with a
 * `mock:<mockUser>` code (tests, e2e). Without `mockUser` each login is a fresh mock account, so
 * repeated e2e runs on the same local D1 each start with the signup gift.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return redirectTo(request, returnTo, { login: ctx.status === 429 ? "busy" : "unavailable" });
  const problems = kakaoConfigProblems();
  if (problems.length) {
    console.error(JSON.stringify({ evt: "config.kakao_invalid", problems }));
    return redirectTo(request, returnTo, { login: "unavailable" });
  }
  if (url.searchParams.get("purpose") === "delete") {
    // KakaoTalk's in-app browser logs in with the app's own session: no real re-check there (?delete=in-app).
    if (isKakaoTalkInApp(request)) return redirectTo(request, "/me", { delete: "in-app" });
    // Only with the intent a same-origin POST handed to this very session.
    if (!ctx.session || !(await deleteIntentFor(url.searchParams.get("intent"), ctx.session.id, ctx.secret, ctx.now))) {
      return redirectTo(request, "/me", { delete: "failed" });
    }
    const { state, cookie } = await issueOAuthState({ returnTo: "/me", purpose: "delete", age: false, sid: ctx.session.id }, ctx.secret, ctx.now);
    const target =
      kakaoMode() === "mock"
        ? `/api/auth/kakao/callback?code=${encodeURIComponent(MOCK_CODE_PREFIX + (url.searchParams.get("mockUser") ?? `e2e${randomId(6)}`))}&state=${state}`
        : authorizeUrl(state, "delete");
    return redirectTo(request, target, {}, [cookie]);
  }
  if (!loginOpen(paymentsMode(), ctx.owner)) return redirectTo(request, returnTo, { login: "closed" });
  if (!(await ageChecked(url.searchParams.get("age"), ctx.secret, ctx.now))) return redirectTo(request, "/login", { next: returnTo });
  const { state, cookie } = await issueOAuthState({ returnTo, purpose: "login", age: true }, ctx.secret, ctx.now);
  const target =
    kakaoMode() === "mock"
      ? `/api/auth/kakao/callback?code=${encodeURIComponent(MOCK_CODE_PREFIX + (url.searchParams.get("mockUser") ?? `e2e${randomId(6)}`))}&state=${state}`
      : authorizeUrl(state, "login");
  return redirectTo(request, target, {}, [cookie]);
}
