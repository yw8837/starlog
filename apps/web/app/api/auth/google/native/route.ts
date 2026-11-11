import { z } from "zod";
import { deleteAccount } from "@/lib/account/deletion";
import { googleClientId, googleConfigProblems, googleUserKey } from "@/lib/account/google";
import { GoogleIdTokenError, verifyGoogleIdToken } from "@/lib/account/googleIdToken";
import { googleLoginSession } from "@/lib/account/googleSession";
import { clearOAuth, oauthCookieName, openOAuthState } from "@/lib/account/oauthState";
import { openAccountRoute } from "@/lib/account/request";
import { clearSession } from "@/lib/account/session";
import { errorResponse, json, readJson, serializeCookie, type ErrorCode } from "@/lib/api/http";
import { tossClient } from "@/lib/pay/toss";

const FinishBody = z.object({ state: z.string().max(200), idToken: z.string().max(8_000) });

/** The ?login= / ?delete= flags of the web flow, as `reason`, with a status the client reads as a failure. */
const REFUSAL: Record<string, ErrorCode> = {
  failed: "FORBIDDEN",
  mismatch: "FORBIDDEN",
  closed: "NOT_AVAILABLE",
  unavailable: "PAY_UNAVAILABLE",
  pending: "PAY_PENDING",
  "in-use": "NOT_AVAILABLE",
  "refund-failed": "PAY_FAILED",
};

/**
 * POST {state, idToken} (our own pages only): the end of the Starlog app's Google sign-in, the steps of
 * /api/auth/google/callback with the ID token Credential Manager returned instead of a code.
 * - The state must match this browser's OAuth state cookie from /api/auth/google/native/start and hold its nonce; the token
 *   is verified whole (lib/account/googleIdToken.ts: Google's signature, our client id, the issuer, the expiry, that nonce).
 * - login: googleLoginSession, as the callback; answers {ok: true, returnTo} with the session cookie.
 * - delete: the same Google account as the session must answer (else `mismatch`), then deleteAccount() settles, refunds and
 *   erases, and the session ends: {ok: true, deleted: true}. There is no Google access token here, so the revoke at Google
 *   the callback makes is skipped and logged.
 * Every answer clears the OAuth cookie; a refusal carries the web flow's flag as `reason`.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const refuse = (reason: keyof typeof REFUSAL) => errorResponse(REFUSAL[reason]!, { reason }, [serializeCookie(clearOAuth())]);
  const body = FinishBody.safeParse(await readJson(request, 10_000));
  if (!body.success) return refuse("failed");
  const intent = await openOAuthState(ctx.cookies[oauthCookieName()], body.data.state, ctx.secret, ctx.now);
  if (!intent?.nonce) return refuse("failed");
  const problems = googleConfigProblems();
  if (problems.length) {
    console.error(JSON.stringify({ evt: "config.google_invalid", problems }));
    return refuse("unavailable");
  }

  let sub: string;
  try {
    ({ sub } = await verifyGoogleIdToken(body.data.idToken, { audience: googleClientId(), nonce: intent.nonce, now: ctx.now }));
  } catch (error) {
    console.error(JSON.stringify({ evt: "auth.google_failed", step: error instanceof GoogleIdTokenError ? error.step : "unknown", via: "native" }));
    return refuse("failed");
  }
  const key = await googleUserKey(sub, ctx.accountSecret);

  if (intent.purpose === "delete") {
    if (!ctx.session || ctx.session.id !== intent.sid) return refuse("failed");
    if (ctx.session.user.kakao_key !== key) return refuse("mismatch");
    const outcome = await deleteAccount(ctx.db, tossClient(), { userId: ctx.session.user.id, now: ctx.now });
    if (!outcome.ok) return refuse(outcome.code === "PENDING" ? "pending" : outcome.code === "IN_USE" ? "in-use" : "refund-failed");
    // The callback revokes the app's access at Google with the access token; Credential Manager hands out none.
    console.info(JSON.stringify({ evt: "auth.google_revoke_skipped_native" }));
    return json({ ok: true, deleted: true }, { cookies: [serializeCookie(clearOAuth()), serializeCookie(clearSession())] });
  }

  const login = await googleLoginSession(ctx, key, intent.age);
  if (!login.ok) return refuse(login.flag);
  return json({ ok: true, returnTo: intent.returnTo }, { cookies: [serializeCookie(login.cookie), serializeCookie(clearOAuth())] });
}
