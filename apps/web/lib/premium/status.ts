import { useEffect, useSyncExternalStore } from "react";
import { PREMIUM_IDS, type PremiumId } from "./products";

/**
 * Which premium readings this device may see (`visible`: entries, pages) and start (`open`), from
 * GET /api/premium/status, shared by every component on the page through one small store (one request
 * however many ask, like the account). Undefined until it answers, null when it failed: entries are
 * drawn for neither (STARLOG_PREMIUM off must never show a premium entry to a visitor); an open panel
 * says it could not tell and asks again (refreshPremiumStatus).
 */

export type PremiumStatus = Record<PremiumId, { open: boolean; visible: boolean; opensAt: number | null }>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parsePremiumStatus(body: unknown): PremiumStatus | null {
  if (!isRecord(body) || !Array.isArray(body.products)) return null;
  const status = Object.fromEntries(PREMIUM_IDS.map((id) => [id, { open: false, visible: false, opensAt: null }])) as PremiumStatus;
  for (const p of body.products) {
    if (!isRecord(p) || typeof p.id !== "string" || !(p.id in status)) continue;
    status[p.id as PremiumId] = { open: p.open === true, visible: p.visible === true, opensAt: typeof p.opensAt === "number" ? p.opensAt : null };
  }
  return status;
}

let snapshot: PremiumStatus | null | undefined;
let inflight: Promise<PremiumStatus | null> | null = null;
const listeners = new Set<() => void>();

/** Asks GET /api/premium/status (again); concurrent callers share one request. */
export function refreshPremiumStatus(fetchImpl: typeof fetch = fetch): Promise<PremiumStatus | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    let next: PremiumStatus | null = null;
    try {
      const response = await fetchImpl("/api/premium/status", { headers: { Accept: "application/json" }, credentials: "same-origin" });
      next = response.ok ? parsePremiumStatus(await response.json()) : null;
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

/** The status: undefined until it answers, null when it could not be read. */
export function usePremiumStatus(): PremiumStatus | null | undefined {
  const value = useSyncExternalStore(subscribe, () => snapshot, () => undefined);
  useEffect(() => {
    if (snapshot === undefined) void refreshPremiumStatus();
  }, []);
  return value;
}

/** Tests only. */
export function resetPremiumStatusForTests(): void {
  snapshot = undefined;
  inflight = null;
  listeners.clear();
}
