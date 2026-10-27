import { isGoogleAccount } from "@/lib/account/google";
import { openingClaimed } from "@/lib/account/openingClaim";
import { openAccount } from "@/lib/account/request";
import { isReviewer } from "@/lib/account/review";
import { clearSession, sessionCookieName } from "@/lib/account/session";
import { clientKey, errorResponse, json, parseCookies, serializeCookie } from "@/lib/api/http";
import { openingFreeOn } from "@/lib/config";
import { entitlements } from "@/lib/pay/ledger";
import { loginOpen, paymentsMode, salesOpen } from "@/lib/pay/mode";
import { refundDeadline } from "@/lib/pay/refunds";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import { rateLimit } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";

/**
 * GET → { payments, login, owner, user }:
 * - `payments`: whether sales are open for this device (or for the review account logged in on it);
 * - `login`: whether this device may log in (also while sales are paused, for existing accounts);
 * - `owner`: whether it holds the owner pass;
 * - `user`: the logged-in user's nickname, `gift` (the signup gift: `{ status: "unused", until }` with
 *   its last moment, `{ status: "used" }`, or null when there is none), unopened purchases (each with
 *   `refundUntil`, the last moment 환불받기 works, or `refundable: false` instead for one given back
 *   after its client left, SEC-02) and `opening`, the readings being opened right now
 *   (a paid one is never also in `unused`); `review: true` only on the review account, `google: true`
 *   only on a Google account; `openingUsed: true` once the account took 오픈 기념 무료 (owner 2026-10-27), while it runs.
 * Without a session cookie it never touches D1, so the site works with no database. Rate-limited per
 * network (ME_LIMITER, generous: every page with an account line asks it).
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await rateLimit("ME_LIMITER", clientKey(request)))) return errorResponse("RATE_LIMIT");
  const now = Date.now();
  const cookies = parseCookies(request);
  const secret = signingSecret();
  const owner = secret ? await isOwner(cookies[OWNER_COOKIE], secret, now) : false;
  const mode = paymentsMode();
  const payments = salesOpen(mode, owner);
  const login = loginOpen(mode, owner);
  if (!cookies[sessionCookieName()]) return json({ payments, login, owner, user: null });
  const ctx = await openAccount(request, now);
  if (ctx instanceof Response) return json({ payments: false, login: false, owner, user: null });
  if (!ctx.session) return json({ payments, login, owner, user: null }, { cookies: [serializeCookie(clearSession())] });
  const held = await entitlements(ctx.db, ctx.session.user.id, now);
  const { gift } = held;
  // The review account buys like the owner pass (lib/account/review.ts); `owner` stays the device's pass.
  const review = await isReviewer(ctx.session.user, ctx.accountSecret);
  const openingUsed = openingFreeOn(now) && (await openingClaimed(ctx.db, ctx.session.user.kakao_key));
  return json({
    payments: salesOpen(mode, owner || review),
    login: loginOpen(mode, owner || review),
    owner,
    user: {
      nickname: ctx.session.user.nickname ?? "별손님",
      gift:
        gift?.status === "unused"
          ? { status: "unused", until: gift.expiresAt === null ? null : new Date(gift.expiresAt).toISOString() }
          : gift,
      unused: held.unused.map(({ orderId, productId, paidAt, refundable }) =>
        refundable ? { orderId, productId, refundUntil: new Date(refundDeadline(paidAt)).toISOString() } : { orderId, productId, refundable: false },
      ),
      opening: held.opening,
      ...(review ? { review: true } : {}),
      ...(isGoogleAccount(ctx.session.user) ? { google: true } : {}),
      ...(openingUsed ? { openingUsed: true } : {}),
    },
  });
}
