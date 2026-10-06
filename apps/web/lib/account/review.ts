import "server-only";
import { cloudflareEnv } from "@/lib/cloudflare";
import { keyedHash } from "@/lib/security/sign";
import type { UserRow } from "./users";

/**
 * The card-company review account (Toss contract review): reviewers log in at the hidden
 * /login/review with an ID and password, because Toss refuses social-login test accounts, and walk
 * the real purchase path. It exists only while the Worker secrets REVIEW_LOGIN_ID and
 * REVIEW_LOGIN_PASSWORD are both set; the page and POST /api/auth/review answer 404 otherwise.
 * - One account per ID and password: users.kakao_key is "review:" and a keyed hash of both (never
 *   either value; a Kakao key is base64url, never ":"). New credentials make a new account, so the
 *   sessions on the old one lose the sales right at once, as a new STARLOG_OWNER_CODE revokes the old
 *   owner passes.
 * - It sells like the owner pass (lib/pay/mode.ts salesOpen), so it can pay on a production deploy
 *   on test keys; it gets no signup gift and nothing else of the owner's.
 * - Removing either secret closes it at once, existing sessions included (isReviewer): they lose the
 *   sales and every opening (lib/api/unlock.ts), and can still delete the account (delete-intent).
 */

const KEY_PREFIX = "review:";
/** A shorter password keeps review login off (the runbook's command makes 22 characters). */
const MIN_PASSWORD_LENGTH = 20;

type ReviewEnv = CloudflareEnv | NodeJS.ProcessEnv;

/**
 * The configured ID and password (trimmed), or null when review login is off (either is missing, or
 * the password is shorter than MIN_PASSWORD_LENGTH). On Workers only the Worker's own secrets count
 * (cloudflareEnv): OpenNext also fills process.env from .env values a build baked in (next-env.mjs),
 * and deleting a secret must close it whatever a build held. Outside Workers (tests, plain
 * `next dev`) it reads process.env.
 */
export function reviewLogin(env: ReviewEnv = cloudflareEnv() ?? process.env): { id: string; password: string } | null {
  const id = env.REVIEW_LOGIN_ID?.trim();
  const password = env.REVIEW_LOGIN_PASSWORD?.trim();
  return id && password && password.length >= MIN_PASSWORD_LENGTH ? { id, password } : null;
}

/** users.kakao_key of the review account for these credentials (keyed by STARLOG_ACCOUNT_SECRET). */
export async function reviewUserKey(login: { id: string; password: string }, accountSecret: string): Promise<string> {
  return KEY_PREFIX + (await keyedHash(`${login.id}\u0000${login.password}`, accountSecret, "starlog/review-account/v1"));
}

/** A review account, of the credentials set now or of earlier ones (review login on or not). */
export function isReviewAccount(user: Pick<UserRow, "kakao_key"> | null | undefined): boolean {
  return Boolean(user?.kakao_key?.startsWith(KEY_PREFIX));
}

/** This account is the review account of the credentials set now (so review login is on). */
export async function isReviewer(user: Pick<UserRow, "kakao_key"> | null | undefined, accountSecret: string, env?: ReviewEnv): Promise<boolean> {
  const login = reviewLogin(env);
  if (!login || !user?.kakao_key?.startsWith(KEY_PREFIX)) return false;
  return user.kakao_key === (await reviewUserKey(login, accountSecret));
}
