import "server-only";
import { SET_PRODUCT_ID, lotProducts, productById, sellable } from "@/lib/pay/catalog";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";
import { PREMIUM, inWindow, isPremiumId, type PremiumId } from "./products";

/**
 * `STARLOG_PREMIUM` (spec §8): `off` (default), `owner` (owner-pass devices only), `on`. New orders
 * and free previews need it, payments open for this device (P4 `salesOpen`) and the sales window.
 * The owner pass skips the window and the payments flag here (QA before a product opens), but a new
 * order still needs the catalog's sales window (lib/pay/catalog.ts sellable, owner included). Opening a
 * reading the user already paid for is never gated by any of this.
 */

export type PremiumMode = "off" | "owner" | "on";

export function premiumMode(env: NodeJS.ProcessEnv = process.env): PremiumMode {
  const value = env.STARLOG_PREMIUM?.trim().toLowerCase();
  return value === "on" || value === "owner" ? value : "off";
}

export function premiumOpen(id: PremiumId, owner: boolean, now: number, env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = premiumMode(env);
  if (owner) return mode !== "off";
  return mode === "on" && salesOpen(paymentsMode(env), false, env) && inWindow(PREMIUM[id], now);
}

/**
 * The 2027 신년운세 + 프리미엄 궁합 set (owner 2026-11-10) may be ordered at `now`: inside its own sales window (from
 * 2026-12-01 00:00 KST, for the owner pass too: it takes 오픈 기념 무료's place at that moment) and while each of its
 * readings may be (premiumOpen). Opening a reading the set bought is never gated by this.
 */
export function setOpen(owner: boolean, now: number, env: NodeJS.ProcessEnv = process.env): boolean {
  const set = productById(SET_PRODUCT_ID)!;
  return sellable(set, now) && lotProducts(set).every((id) => isPremiumId(id) && premiumOpen(id, owner, now, env));
}

/**
 * Whether this device may see premium screens and entries at all (the 다리 화면's 켈틱 크로스, the saju
 * list's premium rows, the home row, the product pages): `on` for everyone, `owner` for the owner pass
 * only, `off` for nobody. Unlike premiumOpen it ignores payments and the sales window, so a product
 * before its window still shows its opening date. Opening a reading already paid for never asks it.
 */
export function premiumVisible(_id: PremiumId, owner: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = premiumMode(env);
  return mode === "on" || (mode === "owner" && owner);
}
