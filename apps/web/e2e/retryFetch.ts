/**
 * fetch for global-setup.ts's warm-up: a request that fails on the network (fetch throws: ECONNRESET, ECONNREFUSED,
 * socket hang up, a timeout) is tried again after each pause in turn, then the last error is thrown. Any answer, a 5xx
 * included, is returned at once: the caller decides what it means. On a machine short on memory the dev server dropped
 * a warm-up connection before any test ran (11/12, `TypeError: fetch failed … read ECONNRESET`).
 * No Playwright import: lib/testing/retryFetch.test.ts runs it under vitest, which skips e2e/.
 */
export async function retryFetch(
  url: URL | string,
  {
    fetchImpl = fetch,
    pauses = [2_000, 4_000, 8_000],
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: { fetchImpl?: (url: URL | string) => Promise<Response>; pauses?: number[]; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchImpl(url);
    } catch (error) {
      if (attempt >= pauses.length) throw error;
      // Left in the gate's log: a run that passed after a retry says so.
      console.warn(`warm-up: ${String(url)} failed on the network (try ${attempt + 1}), trying again`);
      await sleep(pauses[attempt]!);
    }
  }
}
