import "server-only";

/**
 * Rendered share images in the Workers Cache API (`caches.default`), keyed by a normalized URL, so a
 * popular link renders once per edge location rather than per request. A no-op outside Workers.
 */

function edgeCache(): Cache | null {
  return (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches?.default ?? null;
}

export async function fromCache(key: string): Promise<Response | null> {
  const cache = edgeCache();
  if (!cache) return null;
  return (await cache.match(new Request(key)).catch(() => undefined)) ?? null;
}

/** Stores a successful image for `maxAge` seconds and returns a response to send. */
export async function toCache(key: string, response: Response, maxAge: number): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", `public, max-age=${maxAge}`);
  const fresh = new Response(response.body, { status: response.status, headers });
  const cache = edgeCache();
  if (!cache || !fresh.ok) return fresh;
  await cache.put(new Request(key), fresh.clone()).catch(() => undefined);
  return fresh;
}

/** The cached image for `key`, or `render()` stored under it. */
export async function cachedImage(key: string, maxAge: number, render: () => Promise<Response>): Promise<Response> {
  return (await fromCache(key)) ?? toCache(key, await render(), maxAge);
}
