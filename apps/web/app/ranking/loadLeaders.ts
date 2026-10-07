import "server-only";
import { CONSTELLATIONS, type SignId } from "@starlog/core";
import { leadersBySign, type LeaderView } from "@/lib/bonds/service";
import { SITE } from "@/lib/config";
import { bondsRepo } from "@/lib/db";
import type { BondsRepo } from "@/lib/db/bondsRepo";
import { fromCache, toCache } from "@/lib/og/edgeCache";

export type Leaders = Partial<Record<SignId, LeaderView[]>>;

/**
 * The best constellation over all signs, all time (a sign's 1위 with the highest total), or null before any.
 * The name is the shape of the `weekTop` field of /api/bonds/me, which keeps it for the clients that read it.
 */
export interface WeekTop {
  sign: SignId;
  total: number;
}

/** The highest 1위 total of all; a tie goes to the earlier sign in zodiac order. */
export function bestRecord(leaders: Leaders): WeekTop | null {
  let best: WeekTop | null = null;
  for (const c of CONSTELLATIONS) {
    const first = leaders[c.id]?.find((l) => l.rank === 1);
    if (first && (!best || first.total > best.total)) best = { sign: c.id, total: first.total };
  }
  return best;
}

const TTL_SECONDS = 60;

/**
 * The all-time top 3 per sign for /ranking: one D1 batch, kept in the edge cache for a minute. Null when
 * the data cannot be read: the page then shows the signs without names.
 */
export async function loadLeaders(repo: () => BondsRepo = bondsRepo): Promise<Leaders | null> {
  const key = `${new URL(SITE.url).origin}/__cache/ranking-leaders`;
  try {
    const hit = await fromCache(key);
    if (hit) return (await hit.json()) as Leaders;
    const leaders = await leadersBySign(repo());
    await toCache(key, Response.json(leaders), TTL_SECONDS);
    return leaders;
  } catch (error) {
    console.error(JSON.stringify({ evt: "bonds.leaders", error: error instanceof Error ? error.constructor.name : typeof error }));
    return null;
  }
}
