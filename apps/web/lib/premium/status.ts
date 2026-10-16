import { useEffect, useState } from "react";
import { PREMIUM_IDS, type PremiumId } from "./products";

/**
 * Which premium readings this device may see (`visible`: entries, pages) and start (`open`), from
 * GET /api/premium/status. Until it answers, or when it fails, the hook gives undefined: entries are
 * not drawn (STARLOG_PREMIUM off must never show a premium entry to a visitor).
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

/** GET /api/premium/status once per page; undefined until it answers. */
export function usePremiumStatus(fetchImpl: typeof fetch = fetch): PremiumStatus | undefined {
  const [status, setStatus] = useState<PremiumStatus>();
  useEffect(() => {
    let alive = true;
    fetchImpl("/api/premium/status", { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        const parsed = parsePremiumStatus(body);
        if (alive && parsed) setStatus(parsed);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetchImpl]);
  return status;
}
