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
