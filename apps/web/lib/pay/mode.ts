import "server-only";

/**
 * Feature flags for accounts and payments (spec section 12):
 * - `STARLOG_PAYMENTS`:
 *   - `off` (default): no login, no payments; the site as it is today;
 *   - `owner`: sales, sign-up and gifts open for owner-pass devices only;
 *   - `on`: open for everyone;
 *   - `paused` (the rollback): no new orders, accounts or gifts, but existing accounts can still log
 *     in to open, refund or delete what they hold.
 * - 오픈 기념 무료 (the free first tarot reading, until SITE.beta.openingEndsAt) applies in every mode (owner 2026-10-14).
 * - Spending credit a user already holds is never gated by it.
 * - `STARLOG_PAY=mock` swaps Toss for the in-memory mock (tests, e2e, local dev); refused in production.
 */

export type PaymentsMode = "off" | "owner" | "on" | "paused";

export function paymentsMode(env: NodeJS.ProcessEnv = process.env): PaymentsMode {
  const value = env.STARLOG_PAYMENTS?.trim().toLowerCase();
  return value === "on" || value === "owner" || value === "paused" ? value : "off";
}

/**
 * New orders, new accounts and signup gifts are open for this device. A production deploy on test
 * keys sells to the owner only, whatever STARLOG_PAYMENTS says: a test payment charges nobody, so the
 * public must never be able to buy credit with one (security M1).
 */
export function salesOpen(mode: PaymentsMode, owner: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production" && payKeyMode(env) === "test") return owner && (mode === "on" || mode === "owner");
  return mode === "on" || (mode === "owner" && owner);
}

/** An existing account may log in on this device (a new one only while salesOpen). */
export function loginOpen(mode: PaymentsMode, owner: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  return salesOpen(mode, owner, env) || mode === "paused";
}

export type PayProvider = "toss" | "mock";

export function payProvider(env: NodeJS.ProcessEnv = process.env): PayProvider {
  return env.STARLOG_PAY?.trim().toLowerCase() === "mock" ? "mock" : "toss";
}

/** What `payments.mode` a payment made now records. */
export type PayKeyMode = "test" | "live" | "mock";

/**
 * The Toss keys this deploy runs with, by TOSS_SECRET_KEY's prefix (the mock outside production);
 * null without one. Paid credit is spent only from payments made in this mode (ledger reserveUnlock),
 * and Toss is only asked about those (refunds).
 */
export function payKeyMode(env: NodeJS.ProcessEnv = process.env): PayKeyMode | null {
  if (payProvider(env) === "mock") return env.NODE_ENV === "production" ? null : "mock";
  const secret = env.TOSS_SECRET_KEY?.trim() ?? "";
  return secret.startsWith("live_") ? "live" : secret.startsWith("test_") ? "test" : null;
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
