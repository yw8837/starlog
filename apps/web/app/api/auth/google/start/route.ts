import { deleteIntentFor } from "@/lib/account/deletion";
import { googleAuthorizeUrl, googleConfigProblems, googleMode } from "@/lib/account/google";
import { MOCK_CODE_PREFIX } from "@/lib/account/kakao";
import { isInAppBrowser } from "@/lib/inApp";
import { ageChecked, issueOAuthState, type OAuthIntent } from "@/lib/account/oauthState";
import { redirectTo } from "@/lib/account/redirect";
import { openAccountRoute } from "@/lib/account/request";
import { safeReturnTo } from "@/lib/account/returnTo";
import { loginOpen, paymentsMode } from "@/lib/pay/mode";
import { randomId, sha256 } from "@/lib/security/sign";

/**
 * GET ?returnTo=/path&age=<token> → Google's sign-in page, with the gates of /api/auth/kakao/start:
 * login open for this device, the 만 14세 token from POST /api/auth/age, and the signed 10-minute state
 * cookie, which here also keeps the OpenID nonce and the PKCE verifier (Google gets its S256 hash).
 * `purpose=delete&intent=…` is the account deletion re-check (lib/account/google.ts: the account
 * chooser). KakaoTalk's in-app browser goes back with ?login=in-app or ?delete=in-app: Google refuses
 * to sign in inside an in-app browser. With STARLOG_GOOGLE=mock it goes straight to the callback with a
 * `mock:<mockUser>` code (tests, e2e).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return redirectTo(request, returnTo, { login: ctx.status === 429 ? "busy" : "unavailable" });
  const problems = googleConfigProblems();
  if (problems.length) {
    console.error(JSON.stringify({ evt: "config.google_invalid", problems }));
    return redirectTo(request, returnTo, { login: "unavailable" });
  }
  const mockUser = url.searchParams.get("mockUser");
  if (url.searchParams.get("purpose") === "delete") {
    if (isInAppBrowser(request.headers.get("user-agent") ?? "")) return redirectTo(request, "/me", { delete: "in-app" });
    // Only with the intent a same-origin POST handed to this very session.
    if (!ctx.session || !(await deleteIntentFor(url.searchParams.get("intent"), ctx.session.id, ctx.secret, ctx.now))) {
      return redirectTo(request, "/me", { delete: "failed" });
    }
    return toGoogle(request, { returnTo: "/me", purpose: "delete", age: false, sid: ctx.session.id }, mockUser, ctx);
  }
  if (!loginOpen(paymentsMode(), ctx.owner)) return redirectTo(request, returnTo, { login: "closed" });
  if (!(await ageChecked(url.searchParams.get("age"), ctx.secret, ctx.now))) return redirectTo(request, "/login", { next: returnTo });
  // Google refuses to sign in inside apps' browsers (KakaoTalk, Instagram, Threads…): back to /login, where Kakao works.
  if (isInAppBrowser(request.headers.get("user-agent") ?? "")) return redirectTo(request, "/login", { next: returnTo, login: "in-app" });
  return toGoogle(request, { returnTo, purpose: "login", age: true }, mockUser, ctx);
}

async function toGoogle(request: Request, intent: OAuthIntent, mockUser: string | null, ctx: { secret: string; now: number }): Promise<Response> {
  const nonce = randomId(16);
  const verifier = randomId(32);
  const { state, cookie } = await issueOAuthState({ ...intent, nonce, verifier }, ctx.secret, ctx.now);
  const target =
    googleMode() === "mock"
      ? `/api/auth/google/callback?code=${encodeURIComponent(MOCK_CODE_PREFIX + (mockUser ?? `e2e${randomId(6)}`))}&state=${state}`
      : googleAuthorizeUrl({ state, nonce, challenge: await sha256(verifier), purpose: intent.purpose });
  return redirectTo(request, target, {}, [cookie]);
}
