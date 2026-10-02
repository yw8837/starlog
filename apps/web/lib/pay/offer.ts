import type { AccountState } from "@/lib/account/client";
import type { Product, StandardProductId } from "./catalog";

/**
 * What the unlock sheet offers this device for a standard reading (spec section 9). There is one
 * gold primary per mode:
 * - opening: the 오픈 기념 daily free reading (sales closed here, no credit held). `login` adds a
 *   quiet link for buyers while sales are paused;
 * - login: a guest while sales are open;
 * - in-progress: a reading of this kind is being opened with a purchase or 별조각 right now (a
 *   cut-off opening the server may still deliver): nothing to buy or open until it settles;
 * - open-paid: a purchase of this reading is waiting;
 * - stardust: enough 별조각; paying is the secondary choice;
 * - pay.
 * Credit already held always opens, whatever the sales flag says.
 */
export type UnlockOffer =
  | { mode: "opening"; login: boolean }
  | { mode: "login"; priceKrw: number; giftUnits: number }
  | { mode: "in-progress"; currency: "paid" | "stardust" }
  | { mode: "open-paid"; orderId: string }
  | { mode: "stardust"; units: number; balance: number; priceKrw: number }
  | { mode: "pay"; priceKrw: number };

export function unlockOffer(account: AccountState | null | undefined, product: Product, giftUnits: number): UnlockOffer {
  const user = account?.user;
  if (account && user) {
    const busy = user.opening.find((item) => item.productId === product.id);
    if (busy) return { mode: "in-progress", currency: busy.currency };
    const bought = user.unused.find((item) => item.productId === product.id);
    if (bought) return { mode: "open-paid", orderId: bought.orderId };
    if (product.units !== null && user.stardust >= product.units) return { mode: "stardust", units: product.units, balance: user.stardust, priceKrw: product.krw };
    return account.payments ? { mode: "pay", priceKrw: product.krw } : { mode: "opening", login: false };
  }
  if (account?.payments) return { mode: "login", priceKrw: product.krw, giftUnits };
  return { mode: "opening", login: Boolean(account?.login) };
}

export function checkoutHref(productId: StandardProductId, returnTo: string): string {
  return `/pay/checkout?${new URLSearchParams({ product: productId, returnTo })}`;
}
