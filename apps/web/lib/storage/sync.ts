import { useEffect } from "react";
import { parseAccount, type AccountState, type AccountUser } from "@/lib/account/client";
import { getJson, postJson } from "@/lib/reading/api";
import { forgetServerIds, listChapters, mergeServerReadings, removeServerChapters, updateChapter } from "./chapters";
import { dropMatchSeal, matchSeal } from "./matchSeals";
import { forgetPutOff, keepOnDevice } from "./move";

/** The account's saved readings on this device (spec 5.7), and the check after a cut-off paid reading (M4). */

export type SavedReadingJson = { id: string; createdAt: number; chapter: unknown };

/** One page of GET /api/readings, or null when it could not be read. */
export async function fetchReadingsPage(
  query: { before?: string; limit?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<{ readings: SavedReadingJson[]; next: string | null } | null> {
  const params = new URLSearchParams();
  if (query.before) params.set("before", query.before);
  if (query.limit) params.set("limit", String(query.limit));
  const search = params.toString();
  const res = await getJson<{ readings: SavedReadingJson[]; next: string | null }>(`/api/readings${search ? `?${search}` : ""}`, { fetchImpl });
  return res.ok && Array.isArray(res.data.readings) ? { readings: res.data.readings, next: res.data.next ?? null } : null;
}

/**
 * - delivered: the account has the reading;
 * - kept: the purchase or the gift is back, unused, and nothing of this kind is being opened;
 * - none: nothing is being opened, nothing is held and no reading came of it (only with `stopWhenNone`);
 * - unknown: not known yet.
 */
export type DeliveryCheck = { status: "delivered"; reading: SavedReadingJson } | { status: "kept" } | { status: "none" } | { status: "unknown" };

/** The first rounds, while CREDIT_CHECKING shows (ms before each). */
export const FIRST_CHECK_DELAYS = [0, 2_000, 4_000];
/** Then in the background, under creditUnknown: a cut-off generation can still finish for 4 minutes. */
export const LATER_CHECK_DELAYS = [15_000, 30_000, 60_000, 120_000];
/** Server and device clocks differ; a reading this much older than the request still counts. */
const CLOCK_SLACK_MS = 2 * 60_000;
/**
 * A reservation lives 6 minutes (spec 5.4): a reading still being opened was started within this window. A premium
 * opening extends its reservation for each part (lib/pay/ledger.ts extendUnlock), so there the window counts from the
 * last part's start; usePremiumOpen also counts from its own first try.
 */
export const OPENING_WINDOW_MS = 6 * 60_000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

/** What the account held for an opening when it started: this product's purchases (there is only one gift). */
export interface HeldCredit {
  orderIds: string[];
}

/** The account's purchases of this product, counting a reservation of this product as held. */
export function heldCredit(user: AccountUser | null | undefined, productId: string): HeldCredit {
  const opening = (user?.opening ?? []).filter((item) => item.productId === productId);
  return {
    orderIds: [...(user?.unused ?? []).filter((item) => item.productId === productId).map((item) => item.orderId), ...opening.flatMap((item) => (item.orderId ? [item.orderId] : []))],
  };
}

/**
 * After a paid or gift opening failed mid-way (or was refused while what opens it looked held): was it
 * delivered (the account has the reading), was the purchase or the gift kept, or is it not known yet?
 * Kept means nothing of this kind is being opened and what was `held` at the start is back: every
 * purchase unused again (another purchase of the same reading proves nothing), or the gift unused.
 * One round per delay; the first answer wins. Never "kept" on a guess. With `stopWhenNone`, a round
 * where the account is sure nothing is held or being opened and no reading came of it answers "none".
 */
export async function checkDelivery(
  input: { startedAt: number; matches: (chapter: unknown) => boolean; method: "paid" | "free"; productId: string; held?: HeldCredit },
  options: { delays?: readonly number[]; fetchImpl?: typeof fetch; signal?: AbortSignal; stopWhenNone?: boolean } = {},
): Promise<DeliveryCheck> {
  const { delays = FIRST_CHECK_DELAYS, fetchImpl = fetch, signal, stopWhenNone = false } = options;
  const currency = input.method === "paid" ? "paid" : "gift";
  for (const delay of delays) {
    await sleep(delay, signal);
    if (signal?.aborted) break;
    // The account first: a delivery is one batch (reading saved, credit spent), so a reading saved
    // before this answer is surely in the list read after it.
    const me = await getJson<unknown>("/api/me", { fetchImpl });
    const user = me.ok ? parseAccount(me.data)?.user : null;
    const page = await fetchReadingsPage({ limit: 5 }, fetchImpl);
    const found = page?.readings.find((reading) => reading.createdAt >= input.startedAt - CLOCK_SLACK_MS && input.matches(reading.chapter));
    if (found) return { status: "delivered", reading: found };
    if (!user || !page) continue;
    if (user.opening.some((item) => item.productId === input.productId && item.currency === currency)) continue;
    const unused = new Set(user.unused.filter((item) => item.productId === input.productId).map((item) => item.orderId));
    const held = input.held?.orderIds ?? [];
    if (input.method === "paid" && (held.length > 0 ? held.every((id) => unused.has(id)) : unused.size > 0)) return { status: "kept" };
    if (input.method === "free" && user.gift?.status === "unused") return { status: "kept" };
    if (stopWhenNone) return { status: "none" };
  }
  return { status: "unknown" };
}

/** When this tab last pulled the account's readings (ms; "1" from before account sync reads as long ago). */
const SYNCED_KEY = "starlog.account-synced";
/** Account sync: 내 기록 and 내 정보 pull again on a visit once this long has passed, so a reading opened on another device shows without a new tab. */
const PULL_AGAIN_MS = 60_000;
/** 50 readings a page: 1,000 per pull is far beyond any account; the next pull goes on from the top. */
const MAX_PAGES = 20;

/** Brings every reading in the account onto this device, page by page; how many were new here. */
export async function pullAccountReadings(fetchImpl: typeof fetch = fetch): Promise<number> {
  let added = 0;
  let before: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchReadingsPage(before ? { before } : {}, fetchImpl);
    if (!result) break;
    added += mergeServerReadings(result.readings);
    if (!result.next) break;
    before = result.next;
  }
  await restoreMatchTokens(fetchImpl);
  return added;
}

export interface IssuedMatchToken {
  chapterToken: string;
  followUpsLeft: number;
}

/**
 * A 궁합's chapter token again (review 2026-10-17 H3): from the seal this device kept, or right after a cut-off from the
 * tab's input and resume token. "refused" when the server cannot vouch for the partner (400: what was sent will never
 * do), null when it could not answer (try again another time).
 */
export async function requestMatchToken(
  body: { readingId: string; sealed: string } | { readingId: string; resume: string; input: unknown },
  fetchImpl: typeof fetch = fetch,
): Promise<IssuedMatchToken | "refused" | null> {
  const res = await postJson<{ chapterToken?: unknown; followUpsLeft?: unknown }>("/api/premium/match/chapter", body, { fetchImpl });
  if (!res.ok) return res.error.status === 400 ? "refused" : null;
  if (typeof res.data.chapterToken !== "string" || !res.data.chapterToken || typeof res.data.followUpsLeft !== "number") return null;
  return { chapterToken: res.data.chapterToken, followUpsLeft: res.data.followUpsLeft };
}

/** Puts an issued token on the 궁합 this device keeps for that account reading. */
export function giveMatchToken(readingId: string, issued: IssuedMatchToken): void {
  const chapter = listChapters().find((c) => c.kind === "match" && (c.serverId === readingId || c.id === readingId));
  if (chapter) updateChapter(chapter.id, (c) => ({ ...c, chapterToken: issued.chapterToken, followUpsLeft: issued.followUpsLeft }));
}

/** After a pull: every 궁합 that came back without a token and whose seal this device kept gets its token again. */
export async function restoreMatchTokens(fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<void> {
  for (const chapter of listChapters()) {
    if (chapter.kind !== "match" || chapter.chapterToken || !chapter.serverId) continue;
    const sealed = matchSeal(chapter.serverId, now);
    if (!sealed) continue;
    const issued = await requestMatchToken({ readingId: chapter.serverId, sealed }, fetchImpl);
    // A seal the server refused will never open (another secret, past its days): forget it (review 2026-10-17 #10).
    if (issued === "refused") dropMatchSeal(chapter.serverId, now);
    else if (issued) giveMatchToken(chapter.serverId, issued);
  }
}

/**
 * Deletes every reading saved in the account. This device keeps its own copies, which account sync never offers to move
 * back (keepOnDevice): those moved from here and those pulled from another device alike.
 */
export async function deleteAccountReadings(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl("/api/readings?all=1", { method: "DELETE", credentials: "same-origin" });
    if (response.ok) {
      keepOnDevice(listChapters().filter((chapter) => chapter.serverId));
      forgetServerIds();
    }
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * After a successful logout or the account's deletion: the account's readings leave this device
 * (the ones opened here without it stay), and a later login in this tab pulls them again. Returns
 * how many left.
 */
export function forgetAccountOnDevice({ accountDeleted = false }: { accountDeleted?: boolean } = {}): number {
  try {
    sessionStorage.removeItem(SYNCED_KEY);
  } catch {
    // storage blocked: nothing was kept there
  }
  // Account sync: the next login offers to move this device's readings again.
  forgetPutOff();
  // A logout keeps a 궁합's seal for this device's follow-ups; the account's deletion keeps nothing (review 2026-10-17 #5).
  return removeServerChapters({ keepSeals: !accountDeleted });
}

/**
 * While a user is logged in, each visit of 내 기록 or 내 정보 pulls the account's readings onto this device, at most once
 * a minute per tab (account sync: once per tab before, so a phone left open never saw what the web opened).
 */
export function useAccountSync(account: AccountState | null | undefined): void {
  const loggedIn = Boolean(account?.user);
  useEffect(() => {
    if (!loggedIn) return;
    const now = Date.now();
    try {
      const last = Number(sessionStorage.getItem(SYNCED_KEY));
      if (last > 1 && now - last < PULL_AGAIN_MS) return;
      sessionStorage.setItem(SYNCED_KEY, String(now));
    } catch {
      // storage blocked: pull anyway
    }
    void pullAccountReadings();
  }, [loggedIn]);
}
