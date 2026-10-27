import type { AccountState } from "@/lib/account/client";
import { openingFreeOn } from "@/lib/config";
import { GIFT_PRODUCT, type Product, type ProductId } from "./catalog";

/**
 * What the unlock sheet offers this device for a standard reading (spec section 9). There is one
 * gold primary per mode:
 * - opening: 오픈 기념 무료, one free tarot reading per logged-in account and per device (a visitor logs in first, owner
 *   2026-10-27; sales closed here, nothing held), until
 *   SITE.beta.openingEndsAt. `login` adds a quiet link for buyers while sales are paused;
 * - closed: saju while sales are closed here, and tarot once 오픈 기념 무료 has ended: no free reading
 *   and nothing to pay with, so nothing opens (the owner pass still does). `login` as for opening;
 * - login: a guest while sales are open (signing up brings no gift any more, owner 2026-10-14 evening);
 * - in-progress: a reading of this kind is being opened with a purchase or the gift right now (a
 *   cut-off opening the server may still deliver): nothing to buy or open until it settles;
 * - open-paid: a purchase of this reading is waiting; `refundable: false` when it was given back after its
 *   reading was cut off while written (it opens again, but is never refunded);
 * - gift: an unused signup gift granted before it was removed opens this reading (tarot only), usable
 *   until `until`; paying is the secondary choice;
 * - pay.
 * An account that took 오픈 기념 무료 (`openingUsed`, on any device) is offered it no more, as once it has ended.
 * `first` on login, gift and pay: this device has not used 오픈 기념 무료 yet and it has not ended, so
 * the free first tarot reading is the gold choice and the mode's own choices follow it (owner
 * 2026-10-14: it stays after sales open).
 * What the account already holds always opens, whatever the sales flag says.
 */
export type UnlockOffer =
  | { mode: "opening"; login: boolean }
  | { mode: "closed"; login: boolean }
  | { mode: "login"; priceKrw: number; first?: true }
  | { mode: "in-progress"; currency: "paid" | "gift" }
  | { mode: "open-paid"; orderId: string; refundable?: false }
  | { mode: "gift"; until: string | null; priceKrw: number; first?: true }
  | { mode: "pay"; priceKrw: number; first?: true };

/** `firstUnused`: this device has not used 오픈 기념 무료 (as far as it knows). */
export function unlockOffer(account: AccountState | null | undefined, product: Product, firstUnused = false): UnlockOffer {
  const user = account?.user;
  const giftable = product.id === GIFT_PRODUCT;
  const free = product.id === "tarot" && openingFreeOn() && !user?.openingUsed;
  const welcome = firstUnused && free ? { first: true as const } : {};
  // Sales closed here: tarot's first reading is free until 오픈 기념 무료 ends; otherwise nothing to open.
  const unsold = (login: boolean): UnlockOffer => (free ? { mode: "opening", login } : { mode: "closed", login });
  if (account && user) {
    const busy = user.opening.find((item) => item.productId === product.id);
    if (busy) return { mode: "in-progress", currency: busy.currency };
    const bought = user.unused.find((item) => item.productId === product.id);
    if (bought) return { mode: "open-paid", orderId: bought.orderId, ...(bought.refundable === false ? { refundable: false as const } : {}) };
    if (giftable && user.gift?.status === "unused") return { mode: "gift", until: user.gift.until, priceKrw: product.krw, ...welcome };
    return account.payments ? { mode: "pay", priceKrw: product.krw, ...welcome } : unsold(false);
  }
  if (account?.payments) return { mode: "login", priceKrw: product.krw, ...welcome };
  return unsold(Boolean(account?.login));
}

export function checkoutHref(productId: ProductId, returnTo: string): string {
  return `/pay/checkout?${new URLSearchParams({ product: productId, returnTo })}`;
}
