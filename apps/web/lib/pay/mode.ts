import "server-only";

/**
 * Feature flags for accounts and payments (spec section 12):
 * - `STARLOG_PAYMENTS`:
 *   - `off` (default): no login, no payments; the site as it is today;
 *   - `owner`: sales, sign-up and gifts open for owner-pass devices only;
 *   - `on`: open for everyone. The 오픈 기념 free daily full reading ends; the signup gift replaces it;
 *   - `paused` (the rollback): no new orders, accounts or gifts, but existing accounts can still log
 *     in to open, refund or delete what they hold, and the 오픈 기념 reading comes back.
 * - Spending credit a user already holds is never gated by it.
 * - `STARLOG_PAY=mock` swaps Toss for the in-memory mock (tests, e2e, local dev); refused in production.
 */

export type PaymentsMode = "off" | "owner" | "on" | "paused";

export function paymentsMode(env: NodeJS.ProcessEnv = process.env): PaymentsMode {
  const value = env.STARLOG_PAYMENTS?.trim().toLowerCase();
  return value === "on" || value === "owner" || value === "paused" ? value : "off";
}

/** New orders, new accounts and signup gifts are open for this device. */
export function salesOpen(mode: PaymentsMode, owner: boolean): boolean {
  return mode === "on" || (mode === "owner" && owner);
}

/** An existing account may log in on this device (a new one only while salesOpen). */
export function loginOpen(mode: PaymentsMode, owner: boolean): boolean {
  return salesOpen(mode, owner) || mode === "paused";
}

/** The 오픈 기념 free daily full reading applies until sales open for everyone. */
export function openingOffer(mode: PaymentsMode): boolean {
  return mode !== "on";
}

export type PayProvider = "toss" | "mock";

export function payProvider(env: NodeJS.ProcessEnv = process.env): PayProvider {
  return env.STARLOG_PAY?.trim().toLowerCase() === "mock" ? "mock" : "toss";
}

/**
 * The widget client key, read at run time through `env` (a literal `process.env.NEXT_PUBLIC_…` would
 * be inlined at build time). It must change together with TOSS_SECRET_KEY, so the server hands it
 * to the checkout page.
 */
export function tossClientKey(env: NodeJS.ProcessEnv = process.env): string {
  return env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "";
}

/** What stops payments from running, by variable name (never a value); empty when fine. */
export function payConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (payProvider(env) === "mock") return env.NODE_ENV === "production" ? ["STARLOG_PAY=mock in production"] : [];
  const client = tossClientKey(env);
  const secret = env.TOSS_SECRET_KEY?.trim() ?? "";
  const problems: string[] = [];
  if (!/^(test|live)_gck_\S+$/.test(client)) problems.push("NEXT_PUBLIC_TOSS_CLIENT_KEY");
  if (!/^(test|live)_gsk_\S+$/.test(secret)) problems.push("TOSS_SECRET_KEY");
  if (problems.length === 0 && client.split("_")[0] !== secret.split("_")[0]) problems.push("TOSS keys mix test and live");
  return problems;
}
