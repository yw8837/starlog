import { useEffect, useSyncExternalStore } from "react";

/**
 * Browser side of accounts: GET /api/me, shared by every component through one small store (one
 * request however many components ask). `undefined` until loaded, `null` when it failed (screens
 * then behave as they do without accounts).
 */

export interface AccountUser {
  nickname: string;
  stardust: number;
  /** ISO time the soonest 별조각 expire; null when there are none */
  stardustExpiresAt: string | null;
  /**
   * paid readings bought and not opened yet (one being opened is in `opening` instead);
   * `refundUntil`: ISO time of the last moment 환불받기 works (the end of the 7th KST day after the payment)
   */
  unused: Array<{ orderId: string; productId: string; refundUntil?: string }>;
  /** readings being opened right now with a purchase (its order) or 별조각; [] when /api/me leaves it out */
  opening: Array<{ productId: string; currency: "paid" | "stardust"; orderId: string | null }>;
  /** the card-company review account (ID and password, no Kakao); absent for everyone else */
  review?: true;
  /** an account that logs in with Google (not Kakao); absent for everyone else */
  google?: true;
}

export interface AccountState {
  /** sales (new orders, sign-up, gift) are open for this device */
  payments: boolean;
  /** this device may log in (also while sales are paused, for existing accounts) */
  login: boolean;
  owner: boolean;
  user: AccountUser | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseUser(v: unknown): AccountUser | null | undefined {
  if (v === null) return null;
  if (!isRecord(v) || typeof v.nickname !== "string" || typeof v.stardust !== "number" || !Array.isArray(v.unused)) return undefined;
  if (v.stardustExpiresAt !== null && typeof v.stardustExpiresAt !== "string") return undefined;
  const unused = v.unused.filter((u): u is { orderId: string; productId: string; refundUntil?: unknown } => isRecord(u) && typeof u.orderId === "string" && typeof u.productId === "string");
  const opening = (Array.isArray(v.opening) ? v.opening : []).flatMap((o): AccountUser["opening"] =>
    isRecord(o) && typeof o.productId === "string" && (o.currency === "paid" || o.currency === "stardust")
      ? [{ productId: o.productId, currency: o.currency, orderId: typeof o.orderId === "string" ? o.orderId : null }]
      : [],
  );
  return {
    nickname: v.nickname,
    stardust: v.stardust,
    stardustExpiresAt: v.stardustExpiresAt,
    unused: unused.map(({ orderId, productId, refundUntil }) => (typeof refundUntil === "string" ? { orderId, productId, refundUntil } : { orderId, productId })),
    opening,
    ...(v.review === true ? { review: true as const } : {}),
    ...(v.google === true ? { google: true as const } : {}),
  };
}

export function parseAccount(value: unknown): AccountState | null {
  if (!isRecord(value) || typeof value.payments !== "boolean" || typeof value.login !== "boolean" || typeof value.owner !== "boolean") return null;
  const user = parseUser(value.user);
  return user === undefined ? null : { payments: value.payments, login: value.login, owner: value.owner, user };
}

let snapshot: AccountState | null | undefined;
let inflight: Promise<AccountState | null> | null = null;
const listeners = new Set<() => void>();

/** Asks /api/me again (after login, a payment, an opened reading); concurrent callers share one request. */
export function refreshAccount(fetchImpl: typeof fetch = fetch): Promise<AccountState | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    let next: AccountState | null = null;
    try {
      const response = await fetchImpl("/api/me", { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" });
      next = response.ok ? parseAccount(await response.json()) : null;
    } catch {
      next = null;
    }
    snapshot = next;
    inflight = null;
    listeners.forEach((listener) => listener());
    return next;
  })();
  return inflight;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useAccount(): AccountState | null | undefined {
  const value = useSyncExternalStore(subscribe, () => snapshot, () => undefined);
  useEffect(() => {
    if (snapshot === undefined) void refreshAccount();
  }, []);
  return value;
}

export function loginHref(returnTo: string): string {
  return `/login?next=${encodeURIComponent(returnTo)}`;
}

export async function logout(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "same-origin" });
    await refreshAccount(fetchImpl);
    return response.ok;
  } catch {
    return false;
  }
}

export { loginMessage } from "./loginMessage";

/** Tests only. */
export function resetAccountForTests(): void {
  snapshot = undefined;
  inflight = null;
  listeners.clear();
}
