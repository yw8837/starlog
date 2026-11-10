import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Browser side of accounts: GET /api/me, shared by every component through one small store (one
 * request however many components ask). `undefined` until loaded, `null` when it failed (a lost
 * connection, an error status or an odd body; never a logged-out account, which is `user: null`).
 * Most screens then behave as they do without accounts; 내 정보 says it could not load and offers
 * 다시 시도 (refreshAccount), so a member never sees the logged-out view by mistake (F-11).
 */

export interface AccountUser {
  nickname: string;
  /**
   * The signup gift (one free standard tarot reading): unused until `until` (ISO, its last moment;
   * null without one), used, or null when there is none (never given, or expired).
   */
  gift: { status: "unused"; until: string | null } | { status: "used" } | null;
  /**
   * paid readings bought and not opened yet (one being opened is in `opening` instead);
   * `refundUntil`: ISO time of the last moment 환불받기 works (the end of the 7th KST day after the payment);
   * `refundAmount`: what 환불받기 on its payment refunds, in 원 (from the server's catalog);
   * `refundable: false` instead: it opens but refunds nothing now; `noRefund` says why (`refunding`: a set's other part is being
   * refunded; `refunded`: what was cancelled already covers it; `other`), and without it, it was given back after its reading
   * was cut off while written (never refunded);
   * `set: true`: one reading of a 2027 신년운세 + 프리미엄 궁합 set: refunded whole with the other while neither is opened,
   * or its own part once the other was opened (owner 2026-11-10); `otherRefunded: true`: that other reading was refunded, not opened
   */
  unused: Array<{
    orderId: string; productId: string; refundUntil?: string; refundAmount?: number; refundable?: false; noRefund?: "refunding" | "refunded" | "other";
    set?: true; otherRefunded?: true;
  }>;
  /** readings being opened right now with a purchase (its order) or the gift; [] when /api/me leaves it out */
  opening: Array<{ productId: string; currency: "paid" | "gift"; orderId: string | null }>;
  /** the card-company review account (ID and password, no Kakao); absent for everyone else */
  review?: true;
  /** an account that logs in with Google (not Kakao); absent for everyone else */
  google?: true;
  /** this account took 오픈 기념 무료 (on any device, owner 2026-10-27): it is not offered again; absent otherwise */
  openingUsed?: true;
}

/** How an account logs in, for "… 계정으로 로그인돼 있어요": the review account has neither Kakao nor Google (review 2026-10-30). */
export const loginKind = (user: AccountUser): "kakao" | "google" | "review" => (user.review ? "review" : user.google ? "google" : "kakao");

export interface AccountState {
  /** sales (new orders, sign-up, gift) are open for this device */
  payments: boolean;
  /** this device may log in (also while sales are paused, for existing accounts) */
  login: boolean;
  owner: boolean;
  user: AccountUser | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The gift as /api/me sends it; anything else (missing, odd) is none, so nothing is offered on a guess. */
function parseGift(v: unknown): AccountUser["gift"] {
  if (!isRecord(v)) return null;
  if (v.status === "used") return { status: "used" };
  if (v.status === "unused" && (v.until === null || typeof v.until === "string")) return { status: "unused", until: v.until };
  return null;
}

function parseUser(v: unknown): AccountUser | null | undefined {
  if (v === null) return null;
  if (!isRecord(v) || typeof v.nickname !== "string" || !Array.isArray(v.unused)) return undefined;
  const unused = v.unused.filter(
    (u): u is { orderId: string; productId: string; refundUntil?: unknown; refundAmount?: unknown; refundable?: unknown; noRefund?: unknown; set?: unknown; otherRefunded?: unknown } =>
      isRecord(u) && typeof u.orderId === "string" && typeof u.productId === "string",
  );
  const opening = (Array.isArray(v.opening) ? v.opening : []).flatMap((o): AccountUser["opening"] =>
    isRecord(o) && typeof o.productId === "string" && (o.currency === "paid" || o.currency === "gift")
      ? [{ productId: o.productId, currency: o.currency, orderId: typeof o.orderId === "string" ? o.orderId : null }]
      : [],
  );
  return {
    nickname: v.nickname,
    gift: parseGift(v.gift),
    unused: unused.map(({ orderId, productId, refundUntil, refundAmount, refundable, noRefund, set, otherRefunded }) => ({
      orderId,
      productId,
      ...(typeof refundUntil === "string" ? { refundUntil } : {}),
      ...(typeof refundAmount === "number" && refundAmount > 0 ? { refundAmount } : {}),
      ...(refundable === false ? { refundable } : {}),
      ...(refundable === false && (noRefund === "refunding" || noRefund === "refunded" || noRefund === "other") ? { noRefund } : {}),
      ...(set === true ? { set } : {}),
      ...(otherRefunded === true ? { otherRefunded } : {}),
    })),
    opening,
    ...(v.review === true ? { review: true as const } : {}),
    ...(v.google === true ? { google: true as const } : {}),
    ...(v.openingUsed === true ? { openingUsed: true as const } : {}),
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
/** When /api/me was last asked, for the re-check when a page comes back. */
let askedAt = 0;
const RECHECK_MS = 30_000;

/**
 * Asks /api/me again (after login, a payment, an opened reading); concurrent callers share one request. With `keep`, a failed
 * answer changes nothing: only a real answer does.
 */
export function refreshAccount(fetchImpl: typeof fetch = fetch, { keep = false }: { keep?: boolean } = {}): Promise<AccountState | null> {
  if (inflight) return inflight;
  askedAt = Date.now();
  inflight = (async () => {
    let next: AccountState | null = null;
    try {
      const response = await fetchImpl("/api/me", { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" });
      next = response.ok ? parseAccount(await response.json()) : null;
    } catch {
      next = null;
    }
    if (next !== null || !keep) snapshot = next;
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

/**
 * The account may have changed while this page was away (a logout in another tab, a session that ended), and it asks only once
 * otherwise. A tab shown again asks, at most once in RECHECK_MS; a page restored from the back/forward cache asks at once,
 * because it may be showing what only a session may see. Neither blanks the screen on a flaky network (`keep`).
 */
const onTabShown = () => {
  if (document.visibilityState === "visible" && snapshot !== undefined && Date.now() - askedAt >= RECHECK_MS) void refreshAccount(undefined, { keep: true });
};
const onPageShown = (event: PageTransitionEvent) => {
  if (event.persisted && snapshot !== undefined) void refreshAccount(undefined, { keep: true });
};
let watching = false;
function watchForReturn() {
  if (watching) return;
  watching = true;
  document.addEventListener("visibilitychange", onTabShown);
  window.addEventListener("pageshow", onPageShown);
}

export function useAccount(): AccountState | null | undefined {
  const value = useSyncExternalStore(subscribe, () => snapshot, () => undefined);
  useEffect(() => {
    watchForReturn();
    if (snapshot === undefined) void refreshAccount();
  }, []);
  return value;
}

/** A kept reading shows only with a session (owner 2026-11-05): hidden from a visitor, not deleted. */
export const keptForMember = <T>(account: AccountState | null | undefined, kept: T | null): T | null => (account?.user ? kept : null);

/**
 * What a screen shows of a 맛보기 or a card: what was written here a moment ago (`fresh`), else what is kept. Once a real answer
 * says the viewer is a visitor (a logout in another tab, seen on return) the fresh one is hidden too, `loggedOut` says to show the
 * login in its place, and nothing is asked for again: a login brings the same one back (code review 2026-11-06). When /api/me
 * failed it stays. A session-only answer cannot reach a visitor, so a "visitor" that holds one may be out of date: asked once more.
 */
export function useShown<T>(account: AccountState | null | undefined, fresh: T | null, kept: T | null) {
  const loggedOut = Boolean(fresh && account && !account.user);
  useEffect(() => {
    if (loggedOut) void refreshAccount(undefined, { keep: true });
  }, [loggedOut]);
  return { shown: loggedOut ? null : (fresh ?? keptForMember(account, kept)), asks: !fresh && asksServer(account, kept), loggedOut };
}

/**
 * Runs `onChange` when a real answer says the viewer logged in or out while the screen is open (code review 2026-11-06): not for
 * the first answer (the screen has just read itself) and not when /api/me failed. Follows the boolean, so it cannot loop.
 */
export function useOnSignedInChange(onChange: () => void): void {
  const account = useAccount();
  const signedIn = account ? Boolean(account.user) : null;
  const last = useRef(signedIn);
  useEffect(() => {
    if (signedIn === null) return;
    const before = last.current;
    last.current = signedIn;
    if (before !== null && before !== signedIn) onChange();
  }, [signedIn, onChange]);
}

/**
 * Whether a screen asks the server for its 맛보기: nothing kept, or kept and this viewer is a known visitor (the server answers
 * the login, or the care screen first). When /api/me failed, what is kept neither shows nor is asked for again: a logged-in
 * reader would spend one of the day's 맛보기 on it. keptUnknown says so: the screen offers 다시 시도 (SessionRetry).
 */
export const asksServer = (account: AccountState | null | undefined, kept: unknown): boolean => !kept || Boolean(account && !account.user);
export const keptUnknown = (account: AccountState | null | undefined, kept: unknown): boolean => account === null && Boolean(kept);

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

/** Tests only: the account as if /api/me had answered it. */
export function setAccountForTests(state: AccountState | null | undefined): void {
  snapshot = state;
}

/** Tests only. */
export function resetAccountForTests(): void {
  snapshot = undefined;
  inflight = null;
  listeners.clear();
  askedAt = 0;
  if (watching && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onTabShown);
    window.removeEventListener("pageshow", onPageShown);
  }
  watching = false;
}
