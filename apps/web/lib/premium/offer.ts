import type { AccountState } from "@/lib/account/client";
import { PREMIUM, type PremiumId } from "./products";

/**
 * What a premium preview's open panel offers this device (P4's unlockOffer, for premium; P5 spec §7).
 * One gold primary per mode:
 * - loading: the account or the sales state has not answered yet: nothing to press;
 * - in-progress: a reading of this product is being opened with a purchase right now (another tab, a
 *   lost resume token): nothing to buy or open until it settles;
 * - open-paid: a purchase of this product is waiting (it opens whatever the sales flag says);
 *   `refundable: false` when it was given back after its reading was cut off while written;
 * - login / pay: on sale for this device;
 * - soon: not on sale yet, opening at `opensAt` (2027 신년운세 before 2026-11-15);
 * - closed: not on sale;
 * - unknown: the sales state could not be read (null): say so and ask again, sell nothing on a guess.
 * The owner pass adds its own quiet choice in the panel; the signup gift never opens premium.
 */
export type PremiumOffer =
  | { mode: "loading" }
  | { mode: "in-progress" }
  | { mode: "open-paid"; refundable?: false }
  | { mode: "login"; priceKrw: number }
  | { mode: "pay"; priceKrw: number }
  | { mode: "soon"; opensAt: number }
  | { mode: "closed" }
  | { mode: "unknown" };

export function premiumOffer(
  account: AccountState | null | undefined,
  id: PremiumId,
  status: { open: boolean; opensAt: number | null } | null | undefined,
  now: number = Date.now(),
): PremiumOffer {
  if (account === undefined) return { mode: "loading" };
  const user = account?.user;
  if (user) {
    if (user.opening.some((item) => item.productId === id)) return { mode: "in-progress" };
    const bought = user.unused.find((item) => item.productId === id);
    if (bought) return { mode: "open-paid", ...(bought.refundable === false ? { refundable: false as const } : {}) };
  }
  if (status === undefined) return { mode: "loading" };
  if (status === null) return { mode: "unknown" };
  if (!status.open) return status.opensAt !== null && status.opensAt > now ? { mode: "soon", opensAt: status.opensAt } : { mode: "closed" };
  return user ? { mode: "pay", priceKrw: PREMIUM[id].krw } : { mode: "login", priceKrw: PREMIUM[id].krw };
}

/** "11월 15일 0시에 열려요" (Korean time). */
export function opensAtText(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${d.getUTCHours()}시에 열려요`;
}

/** "11월 15일 열려요" (Korean date): an entry's line before its product opens. */
export function opensOnText(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 열려요`;
}
