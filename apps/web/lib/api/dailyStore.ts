import "server-only";
import type { DailyReading } from "@/lib/ai/schemas";
import { cloudflareEnv, warnMissingBinding, type KvBinding } from "@/lib/cloudflare";

/**
 * 오늘의 한 장 is generated once per device and KST day and then served as stored, so every visit
 * that day returns identical JSON. Durable store: Workers KV (`DAILY_KV`, key
 * `daily:<deviceId>:<kstDay>`, 36 h TTL). Without the binding (tests, `next dev`) an in-memory
 * map stands in. Concurrent misses are deduplicated per isolate (shared promise) and, best effort,
 * across isolates by a short KV "pending" marker that makes the second request wait for the first.
 */

const TTL_SECONDS = 36 * 60 * 60;
/** KV's minimum TTL; a generation takes well under a minute. */
const PENDING_TTL_SECONDS = 60;
const MAX_MEMORY_ENTRIES = 5_000;

const resultKey = (deviceId: string, day: string) => `daily:${deviceId}:${day}`;
const pendingKey = (deviceId: string, day: string) => `daily-pending:${deviceId}:${day}`;

interface Store {
  kind: "kv" | "memory";
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

const memory = new Map<string, { value: unknown; expires: number }>();

const memoryStore: Store = {
  kind: "memory",
  async get(key) {
    const entry = memory.get(key);
    if (!entry) return null;
    if (entry.expires > Date.now()) return entry.value;
    memory.delete(key);
    return null;
  },
  async put(key, value, ttlSeconds) {
    while (memory.size >= MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value!);
    memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  },
  async delete(key) {
    memory.delete(key);
  },
};

function kvStore(kv: KvBinding): Store {
  return {
    kind: "kv",
    get: (key) => kv.get(key, "json"),
    put: (key, value, ttlSeconds) => kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds }),
    delete: (key) => kv.delete(key),
  };
}

export function dailyStore(): Store {
  const env = cloudflareEnv();
  if (env?.DAILY_KV) return kvStore(env.DAILY_KV);
  if (env) warnMissingBinding("DAILY_KV");
  return memoryStore;
}

/** The stored fortune for this device and day, if any. */
export async function readDailyResult(deviceId: string, day: string): Promise<DailyReading | null> {
  return ((await dailyStore().get(resultKey(deviceId, day))) as DailyReading | null) ?? null;
}

const inFlight = new Map<string, Promise<{ reading: DailyReading; generated: boolean }>>();

export interface DailyWaitOptions {
  /** how long to wait for another isolate's pending generation, in polls */
  polls?: number;
  pollMs?: number;
}

/**
 * The day's fortune: stored, or generated once by `create` and stored. `generated` is false when
 * another request produced it (so the caller does not count a generation for this device).
 */
export async function getOrCreateDailyResult(
  deviceId: string, day: string, create: () => Promise<DailyReading>, options: DailyWaitOptions = {},
): Promise<{ reading: DailyReading; generated: boolean }> {
  const key = resultKey(deviceId, day);
  const shared = inFlight.get(key);
  if (shared) return { reading: (await shared).reading, generated: false };

  // Registered before the first await, so a concurrent call in this isolate always joins it.
  const work = (async () => {
    const store = dailyStore();
    if (await store.get(pendingKey(deviceId, day))) {
      const { polls = 6, pollMs = 1_000 } = options;
      for (let i = 0; i < polls; i++) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        const done = (await store.get(key)) as DailyReading | null;
        if (done) return { reading: done, generated: false };
      }
      // The other request failed or is slow; generate here rather than keep the user waiting.
    }
    await store.put(pendingKey(deviceId, day), 1, PENDING_TTL_SECONDS);
    try {
      const reading = await create();
      await store.put(key, reading, TTL_SECONDS);
      return { reading, generated: true };
    } finally {
      await store.delete(pendingKey(deviceId, day));
    }
  })();
  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}

/** Test hook. */
export function resetDailyStore(): void {
  memory.clear();
  inFlight.clear();
}
