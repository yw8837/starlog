import { z } from "zod";
import { deleteIntentFor } from "@/lib/account/deletion";
import { googleClientId, googleConfigProblems } from "@/lib/account/google";
import { ageChecked, issueOAuthState, type OAuthIntent } from "@/lib/account/oauthState";
import { openAccountRoute } from "@/lib/account/request";
import { safeReturnTo } from "@/lib/account/returnTo";
import { errorResponse, json, readJson, serializeCookie } from "@/lib/api/http";
import { loginOpen, paymentsMode } from "@/lib/pay/mode";
import { randomId } from "@/lib/security/sign";

const StartBody = z.union([
  z.object({ purpose: z.literal("delete"), intent: z.string().max(1_000) }),
  z.object({ returnTo: z.string().max(200).optional(), age: z.string().max(1_000).optional() }),
]);

/**
 * POST (our own pages only), the Starlog app's Google button: {returnTo?, age} for a login, with the gates of
 * /api/auth/google/start (AUTH_LIMITER, login open for this device, the 만 14세 token from POST /api/auth/age), or
 * {purpose: "delete", intent} for the deletion re-check (the intent /api/account/delete-intent handed to this very session).
 * Sets the same signed 10-minute OAuth state cookie, with a fresh OpenID nonce and no PKCE verifier (there is no code to
 * trade, and the web callback refuses a state without one), and answers {state, nonce, clientId} for the app's
 * Credential Manager. A refusal says the ?login= / ?delete= flag the web flow would bring back, as `reason`.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const body = StartBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST", { reason: "failed" });
  const problems = googleConfigProblems();
  if (problems.length) {
    console.error(JSON.stringify({ evt: "config.google_invalid", problems }));
    return errorResponse("PAY_UNAVAILABLE", { reason: "unavailable" });
  }
  let intent: OAuthIntent;
  if ("purpose" in body.data) {
    if (!ctx.session || !(await deleteIntentFor(body.data.intent, ctx.session.id, ctx.secret, ctx.now))) return errorResponse("FORBIDDEN", { reason: "failed" });
    intent = { returnTo: "/me", purpose: "delete", age: false, sid: ctx.session.id };
  } else {
    const returnTo = safeReturnTo(body.data.returnTo);
    if (!loginOpen(paymentsMode(), ctx.owner)) return errorResponse("NOT_AVAILABLE", { reason: "closed" });
    if (!(await ageChecked(body.data.age ?? null, ctx.secret, ctx.now))) return errorResponse("FORBIDDEN", { reason: "failed" });
    intent = { returnTo, purpose: "login", age: true };
  }
  const nonce = randomId(16);
  const { state, cookie } = await issueOAuthState({ ...intent, nonce }, ctx.secret, ctx.now);
  return json({ state, nonce, clientId: googleClientId() }, { cookies: [serializeCookie(cookie)] });
}
