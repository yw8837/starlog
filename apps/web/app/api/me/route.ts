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
 *   `refundUntil`, the last moment 환불받기 works, and `refundAmount`, what it refunds in 원: a set's whole price, or once
 *   its other reading was opened its own part; or `refundable: false` instead, with `noRefund` saying why unless it was given
 *   back after its client left (SEC-02, the meaning without it): `refunding` (its order is being refunded), `refunded` (what was
 *   cancelled already covers it) or `other`; `otherRefunded: true` on a set's reading whose other reading was refunded, not
 *   opened; `provider: "play"` on one paid with Google Play in the Starlog app, and `noRefund: "play-part"` on such a set's
 *   reading once the other is opened: refunded on request, never by 환불받기) and `opening`, the readings being opened right now
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
  // Paid on Google Play in the Starlog app (payments.mode 'play', migration 0024): the screen words its refund for Google Play.
  const orderIds = [...new Set(held.unused.map((item) => item.orderId))];
  const onPlay = new Set(
    orderIds.length
      ? (
          await ctx.db
            .prepare(`SELECT order_id FROM payments WHERE mode = 'play' AND order_id IN (${orderIds.map(() => "?").join(", ")})`)
            .bind(...orderIds)
            .all<{ order_id: string }>()
        ).results.map((row) => row.order_id)
      : [],
  );
  // A set paid with Google Play whose other reading is no longer refundable (opened, or being opened): Google refunds a Play
  // order whole only, so 환불받기 would always be refused (lib/pay/playOrders.ts refundUnusedPlayOrder); the operator
  // refunds that part on request (`play-part`).
  const playPart = (item: (typeof held.unused)[number]) =>
    onPlay.has(item.orderId) && Boolean(item.set) && item.refundable > 0 && !held.unused.some((other) => other.orderId === item.orderId && other.productId !== item.productId && other.refundable > 0);
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
      unused: held.unused.map((item) => {
        const { orderId, productId, paidAt, refundable, noRefund, set, otherRefunded } = item;
        return {
          ...(playPart(item)
            ? { orderId, productId, refundable: false, noRefund: "play-part" }
            : refundable > 0
              ? { orderId, productId, refundUntil: new Date(refundDeadline(paidAt)).toISOString(), refundAmount: refundable }
              : { orderId, productId, refundable: false, ...(noRefund && noRefund !== "left" ? { noRefund } : {}) }),
          ...(set ? { set } : {}),
          ...(otherRefunded ? { otherRefunded } : {}),
          ...(onPlay.has(orderId) ? { provider: "play" } : {}),
        };
      }),
      opening: held.opening,
      ...(review ? { review: true } : {}),
      ...(isGoogleAccount(ctx.session.user) ? { google: true } : {}),
      ...(openingUsed ? { openingUsed: true } : {}),
    },
  });
}
