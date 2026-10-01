import "server-only";
import { kstWeekId, type SignId } from "@starlog/core";
import { weeklyLeaders, type LeaderView } from "@/lib/bonds/service";
import { SITE } from "@/lib/config";
import { bondsRepo } from "@/lib/db";
import type { BondsRepo } from "@/lib/db/bondsRepo";
import { fromCache, toCache } from "@/lib/og/edgeCache";

export type Leaders = Partial<Record<SignId, LeaderView[]>>;

const TTL_SECONDS = 60;

/**
 * This week's top 3 per sign for /ranking: one D1 query, kept in the edge cache for a minute (a new
 * week gets a new key). Null when the data cannot be read: the page then shows the signs without names.
 */
export async function loadLeaders(now = Date.now(), repo: () => BondsRepo = bondsRepo): Promise<Leaders | null> {
  const key = `${new URL(SITE.url).origin}/__cache/ranking-leaders/${kstWeekId(now)}`;
  try {
    const hit = await fromCache(key);
    if (hit) return (await hit.json()) as Leaders;
    const leaders = await weeklyLeaders(repo(), now);
    await toCache(key, Response.json(leaders), TTL_SECONDS);
    return leaders;
  } catch (error) {
    console.error(JSON.stringify({ evt: "bonds.leaders", error: error instanceof Error ? error.constructor.name : typeof error }));
    return null;
  }
}
