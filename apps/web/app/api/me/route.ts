import { openAccount } from "@/lib/account/request";
import { CLEAR_SESSION, SESSION_COOKIE } from "@/lib/account/session";
import { json, parseCookies, serializeCookie } from "@/lib/api/http";
import { walletSummary } from "@/lib/pay/ledger";
import { loginOpen, paymentsMode, salesOpen } from "@/lib/pay/mode";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import { signingSecret } from "@/lib/security/sign";

/**
 * GET → { payments, login, owner, user }:
 * - `payments`: whether sales are open for this device;
 * - `login`: whether this device may log in (also while sales are paused, for existing accounts);
 * - `owner`: whether it holds the owner pass;
 * - `user`: the logged-in user's nickname, 별조각 (with the soonest expiry) and unopened purchases.
 * Without a session cookie it never touches D1, so the site works with no database.
 */
export async function GET(request: Request): Promise<Response> {
  const now = Date.now();
  const cookies = parseCookies(request);
  const secret = signingSecret();
  const owner = secret ? await isOwner(cookies[OWNER_COOKIE], secret, now) : false;
  const mode = paymentsMode();
  const payments = salesOpen(mode, owner);
  const login = loginOpen(mode, owner);
  if (!cookies[SESSION_COOKIE]) return json({ payments, login, owner, user: null });
  const ctx = await openAccount(request, now);
  if (ctx instanceof Response) return json({ payments: false, login: false, owner, user: null });
  if (!ctx.session) return json({ payments, login, owner, user: null }, { cookies: [serializeCookie(CLEAR_SESSION)] });
  const wallet = await walletSummary(ctx.db, ctx.session.user.id, now);
  return json({
    payments,
    login,
    owner,
    user: {
      nickname: ctx.session.user.nickname ?? "별손님",
      stardust: wallet.stardust,
      stardustExpiresAt: wallet.stardustExpiresAt === null ? null : new Date(wallet.stardustExpiresAt).toISOString(),
      unused: wallet.unused,
    },
  });
}
