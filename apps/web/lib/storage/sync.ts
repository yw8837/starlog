import { useEffect } from "react";
import { parseAccount, type AccountState } from "@/lib/account/client";
import { getJson } from "@/lib/reading/api";
import { forgetServerIds, mergeServerReadings } from "./chapters";

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

export type DeliveryCheck = { status: "delivered"; reading: SavedReadingJson } | { status: "kept" } | { status: "unknown" };

/** The first rounds, while CREDIT_CHECKING shows (ms before each). */
export const FIRST_CHECK_DELAYS = [0, 2_000, 4_000];
/** Then in the background, under creditUnknown: a cut-off generation can still finish for 4 minutes. */
export const LATER_CHECK_DELAYS = [15_000, 30_000, 60_000, 120_000];
/** Server and device clocks differ; a reading this much older than the request still counts. */
const CLOCK_SLACK_MS = 2 * 60_000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

/**
 * After a paid or 별조각 opening failed mid-way: was it delivered (the account has the reading), was
 * the credit kept (the account shows it unused), or is it not known yet? One round per delay; the
 * first answer wins. Never "kept" on a guess.
 */
export async function checkDelivery(
  input: { startedAt: number; matches: (chapter: unknown) => boolean; method: "paid" | "free"; productId: string; units: number },
  options: { delays?: readonly number[]; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<DeliveryCheck> {
  const { delays = FIRST_CHECK_DELAYS, fetchImpl = fetch, signal } = options;
  for (const delay of delays) {
    await sleep(delay, signal);
    if (signal?.aborted) break;
    const page = await fetchReadingsPage({ limit: 5 }, fetchImpl);
    const found = page?.readings.find((reading) => reading.createdAt >= input.startedAt - CLOCK_SLACK_MS && input.matches(reading.chapter));
    if (found) return { status: "delivered", reading: found };
    const me = await getJson<unknown>("/api/me", { fetchImpl });
    const user = me.ok ? parseAccount(me.data)?.user : null;
    if (user && input.method === "paid" && user.unused.some((item) => item.productId === input.productId)) return { status: "kept" };
    if (user && input.method === "free" && user.stardust >= input.units) return { status: "kept" };
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
