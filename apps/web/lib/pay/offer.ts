import type { AccountState } from "@/lib/account/client";
import { GIFT_PRODUCT, type Product, type ProductId } from "./catalog";

/**
 * What the unlock sheet offers this device for a standard reading (spec section 9). There is one
 * gold primary per mode:
 * - opening: 첫 이용 무료, the device's one free tarot reading (sales closed here, nothing held).
 *   `login` adds a quiet link for buyers while sales are paused;
 * - closed: saju while sales are closed here: no free reading (owner 2026-10-14) and nothing to pay
 *   with, so nothing opens (the owner pass still does). `login` as for opening;
 * - login: a guest while sales are open; `gift` when signing up brings a free reading of this kind
 *   (the signup gift, tarot only);
 * - in-progress: a reading of this kind is being opened with a purchase or the gift right now (a
 *   cut-off opening the server may still deliver): nothing to buy or open until it settles;
 * - open-paid: a purchase of this reading is waiting;
 * - gift: the unused signup gift opens this reading (tarot only), usable until `until`; paying is
 *   the secondary choice;
 * - pay.
 * `first` on login, gift and pay: this device has not used 첫 이용 무료 yet, so the free first tarot
 * reading is the gold choice and the mode's own choices follow it (owner 2026-10-14: 첫 이용 무료
 * stays after sales open).
 * What the account already holds always opens, whatever the sales flag says.
 */
export type UnlockOffer =
  | { mode: "opening"; login: boolean }
  | { mode: "closed"; login: boolean }
  | { mode: "login"; priceKrw: number; gift: boolean; first?: true }
  | { mode: "in-progress"; currency: "paid" | "gift" }
  | { mode: "open-paid"; orderId: string }
  | { mode: "gift"; until: string | null; priceKrw: number; first?: true }
  | { mode: "pay"; priceKrw: number; first?: true };

/** `firstUnused`: this device has not used 첫 이용 무료 (as far as it knows). */
export function unlockOffer(account: AccountState | null | undefined, product: Product, firstUnused = false): UnlockOffer {
  const user = account?.user;
  const giftable = product.id === GIFT_PRODUCT;
  const welcome = firstUnused && product.id === "tarot" ? { first: true as const } : {};
  // Sales closed here: tarot's first reading is free, saju has nothing to open.
  const unsold = (login: boolean): UnlockOffer => (product.id === "tarot" ? { mode: "opening", login } : { mode: "closed", login });
  if (account && user) {
    const busy = user.opening.find((item) => item.productId === product.id);
    if (busy) return { mode: "in-progress", currency: busy.currency };
    const bought = user.unused.find((item) => item.productId === product.id);
    if (bought) return { mode: "open-paid", orderId: bought.orderId };
    if (giftable && user.gift?.status === "unused") return { mode: "gift", until: user.gift.until, priceKrw: product.krw, ...welcome };
    return account.payments ? { mode: "pay", priceKrw: product.krw, ...welcome } : unsold(false);
  }
  if (account?.payments) return { mode: "login", priceKrw: product.krw, gift: giftable, ...welcome };
  return unsold(Boolean(account?.login));
}

export function checkoutHref(productId: ProductId, returnTo: string): string {
  return `/pay/checkout?${new URLSearchParams({ product: productId, returnTo })}`;
}
