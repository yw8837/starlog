import "server-only";
import { headers } from "next/headers";
import { openAccount } from "@/lib/account/request";
import { parseCookies } from "@/lib/api/http";
import { entitlements } from "@/lib/pay/ledger";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import { signingSecret } from "@/lib/security/sign";
import { premiumOpen, premiumVisible } from "./flags";
import type { PremiumId } from "./products";

/**
 * The premium screens' gate on the server (plan-reconciled §4.7): a server page reads this request's
 * cookies (so it renders per request) and answers notFound() or a redirect when the screen may not show.
 * While STARLOG_PREMIUM is off nothing of premium shows to a visitor.
 */

async function thisRequest(): Promise<Request> {
  return new Request("https://starlog.local/", { headers: await headers() });
}

/** The owner pass, read from this request's cookie. */
async function ownerHere(now: number): Promise<boolean> {
  const secret = signingSecret();
  return secret ? isOwner(parseCookies(await thisRequest())[OWNER_COOKIE], secret, now) : false;
}

/** This device may see the product's entries and screens (premiumVisible with the owner pass read from the cookie). */
export async function premiumVisibleHere(id: PremiumId, now: number = Date.now()): Promise<boolean> {
  return premiumVisible(id, await ownerHere(now));
}

/** A product page's state here (plan-reconciled §4.6): whether it shows at all, and whether 시작하기 may start it now. */
export async function premiumStateHere(id: PremiumId, now: number = Date.now()): Promise<{ visible: boolean; open: boolean }> {
  const owner = await ownerHere(now);
  return { visible: premiumVisible(id, owner), open: premiumOpen(id, owner, now) };
}

/**
 * A flow page (preview, reading) may show: visible here, or the logged-in user holds a purchase of this
 * very product (unopened or being opened), which always opens whatever the switch says (the server rule).
 * A visitor without a session never reaches the database.
 */
export async function premiumPageOpen(id: PremiumId, now: number = Date.now()): Promise<boolean> {
  if (await premiumVisibleHere(id, now)) return true;
  const request = await thisRequest();
  if (!request.headers.get("cookie")) return false;
  const ctx = await openAccount(request, now);
  if (ctx instanceof Response || !ctx.session?.user) return false;
  const held = await entitlements(ctx.db, ctx.session.user.id, now);
  return held.unused.some((item) => item.productId === id) || held.opening.some((item) => item.productId === id);
}
