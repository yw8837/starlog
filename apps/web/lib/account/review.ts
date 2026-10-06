import "server-only";
import type { UserRow } from "./users";

/**
 * The card-company review account (Toss contract review): reviewers log in at the hidden
 * /login/review with an ID and password, because Toss refuses social-login test accounts, and walk
 * the real purchase path. It exists only while the Worker secrets REVIEW_LOGIN_ID and
 * REVIEW_LOGIN_PASSWORD are both set; the page and POST /api/auth/review answer 404 otherwise.
 * - One fixed account: users.kakao_key holds REVIEW_USER_KEY (a Kakao key is base64url, never ":").
 * - It sells like the owner pass (lib/pay/mode.ts salesOpen), so it can pay on a production deploy
 *   on test keys; it gets no signup gift and nothing else of the owner's.
 * - Removing either secret closes it at once, existing sessions included (isReviewer).
 */

export const REVIEW_USER_KEY = "review:card-review";

/** The configured ID and password (trimmed), or null when review login is off. */
export function reviewLogin(env: NodeJS.ProcessEnv = process.env): { id: string; password: string } | null {
  const id = env.REVIEW_LOGIN_ID?.trim();
  const password = env.REVIEW_LOGIN_PASSWORD?.trim();
  return id && password ? { id, password } : null;
}

/** This account is the review account, and review login is on. */
export function isReviewer(user: Pick<UserRow, "kakao_key"> | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return user?.kakao_key === REVIEW_USER_KEY && reviewLogin(env) !== null;
}
