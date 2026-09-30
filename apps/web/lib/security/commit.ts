import "server-only";
import { sha256, signToken, verifyToken, type SignedPayload } from "./sign";

/**
 * A streamed response sends its headers before the reading is validated, so the cookies that spend
 * quota cannot ride on it. The `done` event carries a commit token instead, and the client posts it
 * to /api/commit, which sets those cookies. The token names the cookie values it expects to replace
 * (by digest), so replaying an old token after later spends changes nothing.
 */

export const COMMIT_TTL_MS = 10 * 60 * 1000;
/** Only these cookies may be set through a commit (never the owner pass). */
export const COMMITTABLE = new Set(["sl_q", "sl_daily"]);

export interface CommitCookie {
  name: string;
  value: string;
  maxAge: number;
}

interface CommitPayload extends SignedPayload {
  k: "commit";
  set: CommitCookie[];
  /** digest of each cookie's value when the request started; null = the cookie was absent */
  prev: Record<string, string | null>;
  exp: number;
}

const digest = async (value: string | undefined) => (value === undefined ? null : sha256(value));

export async function issueCommit(set: CommitCookie[], current: Record<string, string>, secret: string, now: number): Promise<string> {
  const allowed = set.filter((c) => COMMITTABLE.has(c.name));
  const prev: Record<string, string | null> = {};
  for (const cookie of allowed) prev[cookie.name] = await digest(current[cookie.name]);
  const payload: CommitPayload = { k: "commit", set: allowed, prev, exp: now + COMMIT_TTL_MS };
  return signToken(payload, secret);
}

/** The cookies to set, or null when the token is forged, expired or stale (the cookies moved on). */
export async function openCommit(token: unknown, current: Record<string, string>, secret: string, now: number): Promise<CommitCookie[] | null> {
  const p = await verifyToken<CommitPayload>(token, "commit", secret, now);
  if (!p || !Array.isArray(p.set) || typeof p.prev !== "object" || p.prev === null) return null;
  for (const cookie of p.set) {
    if (!COMMITTABLE.has(cookie.name)) return null;
    if ((await digest(current[cookie.name])) !== (p.prev[cookie.name] ?? null)) return null;
  }
  return p.set;
}
