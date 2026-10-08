import type { AccountState } from "@/lib/account/client";
import { GIFT_PRODUCT, type Product, type ProductId } from "./catalog";

/**
 * What the unlock sheet offers this device for a standard reading (spec section 9). There is one
 * gold primary per mode:
 * - opening: the 오픈 기념 daily free reading (sales closed here, nothing held). `login` adds a
 *   quiet link for buyers while sales are paused;
 * - login: a guest while sales are open; `gift` when signing up brings a free reading of this kind
 *   (the signup gift, tarot only);
 * - in-progress: a reading of this kind is being opened with a purchase or the gift right now (a
 *   cut-off opening the server may still deliver): nothing to buy or open until it settles;
 * - open-paid: a purchase of this reading is waiting;
 * - gift: the unused signup gift opens this reading (tarot only), usable until `until`; paying is
 *   the secondary choice;
 * - pay.
 * What the account already holds always opens, whatever the sales flag says.
 */
export type UnlockOffer =
  | { mode: "opening"; login: boolean }
  | { mode: "login"; priceKrw: number; gift: boolean }
  | { mode: "in-progress"; currency: "paid" | "gift" }
  | { mode: "open-paid"; orderId: string }
  | { mode: "gift"; until: string | null; priceKrw: number }
  | { mode: "pay"; priceKrw: number };

export function unlockOffer(account: AccountState | null | undefined, product: Product): UnlockOffer {
  const user = account?.user;
  const giftable = product.id === GIFT_PRODUCT;
  if (account && user) {
    const busy = user.opening.find((item) => item.productId === product.id);
    if (busy) return { mode: "in-progress", currency: busy.currency };
    const bought = user.unused.find((item) => item.productId === product.id);
    if (bought) return { mode: "open-paid", orderId: bought.orderId };
    if (giftable && user.gift?.status === "unused") return { mode: "gift", until: user.gift.until, priceKrw: product.krw };
    return account.payments ? { mode: "pay", priceKrw: product.krw } : { mode: "opening", login: false };
  }
  if (account?.payments) return { mode: "login", priceKrw: product.krw, gift: giftable };
  return { mode: "opening", login: Boolean(account?.login) };
}

export function checkoutHref(productId: ProductId, returnTo: string): string {
  return `/pay/checkout?${new URLSearchParams({ product: productId, returnTo })}`;
}
