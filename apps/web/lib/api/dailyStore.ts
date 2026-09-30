import "server-only";
import type { DailyReading } from "@/lib/ai/schemas";

/**
 * 오늘의 한 장 is generated once per device and KST day and then served as is. On Workers the
 * result goes into the Cache API (`caches.default`, per data center, works on custom domains); in
 * Node (tests, `next dev`) an in-memory map stands in. A miss regenerates the same card, and the
 * daily cookie caps generations, so the cache is an optimisation, not the quota.
 */

const TTL_SECONDS = 36 * 60 * 60;
const MAX_MEMORY_ENTRIES = 5_000;
const memory = new Map<string, { value: DailyReading; expires: number }>();

function workersCache(): Cache | null {
  const storage = (globalThis as { caches?: { default?: Cache } }).caches;
  return storage?.default ?? null;
}

/** Synthetic cache key; never fetched. */
const keyOf = (deviceId: string, day: string) => `https://starlog-cache.invalid/daily/v1/${encodeURIComponent(deviceId)}/${day}`;

export async function readDailyCache(deviceId: string, day: string, now = Date.now()): Promise<DailyReading | null> {
  const key = keyOf(deviceId, day);
  const cache = workersCache();
  if (cache) {
    const hit = await cache.match(key);
    return hit ? ((await hit.json()) as DailyReading) : null;
  }
  const entry = memory.get(key);
  if (!entry || entry.expires <= now) return null;
  return entry.value;
}

export async function writeDailyCache(deviceId: string, day: string, value: DailyReading, now = Date.now()): Promise<void> {
  const key = keyOf(deviceId, day);
  const cache = workersCache();
  if (cache) {
    await cache.put(key, new Response(JSON.stringify(value), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${TTL_SECONDS}` },
    }));
    return;
  }
  if (memory.size >= MAX_MEMORY_ENTRIES) memory.clear();
  memory.set(key, { value, expires: now + TTL_SECONDS * 1000 });
}

/** Test hook. */
export function resetDailyCache(): void {
  memory.clear();
}
