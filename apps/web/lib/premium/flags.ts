import "server-only";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";
import { PREMIUM, inWindow, type PremiumId } from "./products";

/**
 * `STARLOG_PREMIUM` (spec §8): `off` (default), `owner` (owner-pass devices only), `on`. New orders
 * and free previews need it, payments open for this device (P4 `salesOpen`) and the sales window.
 * The owner pass skips the window and the payments flag (QA before a product opens). Opening a
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
 * Whether this device may see premium screens and entries at all (the 다리 화면's 켈틱 크로스, the saju
 * list's premium rows, the home row, the product pages): `on` for everyone, `owner` for the owner pass
 * only, `off` for nobody. Unlike premiumOpen it ignores payments and the sales window, so a product
 * before its window still shows its opening date. Opening a reading already paid for never asks it.
 */
export function premiumVisible(_id: PremiumId, owner: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = premiumMode(env);
  return mode === "on" || (mode === "owner" && owner);
}
