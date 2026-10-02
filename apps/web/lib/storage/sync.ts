import { useEffect } from "react";
import { parseAccount, type AccountState, type AccountUser } from "@/lib/account/client";
import { getJson } from "@/lib/reading/api";
import { forgetServerIds, mergeServerReadings, removeServerChapters } from "./chapters";

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
 * - kept: the credit is back, unused, and nothing of this kind is being opened;
 * - none: nothing is being opened, the credit is not there and no reading came of it (only with `stopWhenNone`);
 * - unknown: not known yet.
 */
export type DeliveryCheck = { status: "delivered"; reading: SavedReadingJson } | { status: "kept" } | { status: "none" } | { status: "unknown" };

/** The first rounds, while CREDIT_CHECKING shows (ms before each). */
export const FIRST_CHECK_DELAYS = [0, 2_000, 4_000];
/** Then in the background, under creditUnknown: a cut-off generation can still finish for 4 minutes. */
export const LATER_CHECK_DELAYS = [15_000, 30_000, 60_000, 120_000];
/** Server and device clocks differ; a reading this much older than the request still counts. */
const CLOCK_SLACK_MS = 2 * 60_000;
/** A reservation lives at most 6 minutes (spec 5.4): a reading still being opened was started within this window. */
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

/** What the account held for an opening when it started: this product's purchases and the 별조각. */
export interface HeldCredit {
  orderIds: string[];
  stardust: number;
}

/** The account's purchases of this product and its 별조각, counting a reservation of this product as held. */
export function heldCredit(user: AccountUser | null | undefined, productId: string, units: number): HeldCredit {
  const opening = (user?.opening ?? []).filter((item) => item.productId === productId);
  return {
    orderIds: [...(user?.unused ?? []).filter((item) => item.productId === productId).map((item) => item.orderId), ...opening.flatMap((item) => (item.orderId ? [item.orderId] : []))],
    stardust: (user?.stardust ?? 0) + units * opening.filter((item) => item.currency === "stardust").length,
  };
}

/**
 * After a paid or 별조각 opening failed mid-way (or was refused while its credit looked held): was it
 * delivered (the account has the reading), was the credit kept, or is it not known yet? Kept means
 * nothing of this kind is being opened and everything `held` at the start is back: every purchase
 * unused again (another purchase of the same reading proves nothing), all the 별조각. One round per
 * delay; the first answer wins. Never "kept" on a guess. With `stopWhenNone`, a round where the
 * account is sure nothing is held or being opened and no reading came of it answers "none".
 */
export async function checkDelivery(
  input: { startedAt: number; matches: (chapter: unknown) => boolean; method: "paid" | "free"; productId: string; units: number; held?: HeldCredit },
  options: { delays?: readonly number[]; fetchImpl?: typeof fetch; signal?: AbortSignal; stopWhenNone?: boolean } = {},
): Promise<DeliveryCheck> {
  const { delays = FIRST_CHECK_DELAYS, fetchImpl = fetch, signal, stopWhenNone = false } = options;
  const currency = input.method === "paid" ? "paid" : "stardust";
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
    if (input.method === "free" && user.stardust >= Math.max(input.units, input.held?.stardust ?? 0)) return { status: "kept" };
    if (stopWhenNone) return { status: "none" };
  }
  return { status: "unknown" };
}

const SYNCED_KEY = "starlog.account-synced";
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
  return added;
}

/** Deletes every reading saved in the account. This device keeps its own copies. */
export async function deleteAccountReadings(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl("/api/readings?all=1", { method: "DELETE", credentials: "same-origin" });
    if (response.ok) forgetServerIds();
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
export function forgetAccountOnDevice(): number {
  try {
    sessionStorage.removeItem(SYNCED_KEY);
  } catch {
    // storage blocked: nothing was kept there
  }
  return removeServerChapters();
}

/** Once per tab, when a user is logged in: pull the account's readings onto this device. */
export function useAccountSync(account: AccountState | null | undefined): void {
  const loggedIn = Boolean(account?.user);
  useEffect(() => {
    if (!loggedIn) return;
    try {
      if (sessionStorage.getItem(SYNCED_KEY)) return;
      sessionStorage.setItem(SYNCED_KEY, "1");
    } catch {
      // storage blocked: pull anyway
    }
    void pullAccountReadings();
  }, [loggedIn]);
}
