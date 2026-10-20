import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { GenerationHooks } from "@/lib/ai/provider";
import { issueCommit } from "@/lib/security/commit";
import { generationErrorPayload, json, serializeCookie, type CookieSpec, type Gate } from "./http";
import { SectionScanner } from "./sections";
import { SpendLedger, addCost, addNetworkCost, addPaidCost, recordClientSpend, type CostSink, type SpendKind } from "./spend"; // P4: cost books

/**
 * Generation responses (.superpowers/sdd/2026-09-30-starlog-p2b/streaming-protocol.md). A request
 * with `Accept: application/x-ndjson` gets progress as NDJSON (start, section, retry, ping, then
 * done or error); any other request gets the same JSON as before. Both paths share one generation
 * budget and abort upstream when the client goes away, so abandoned readings stop billing.
 * Both paths also do the server's own accounting (spend.ts), whatever the client does: the network
 * counter is charged before the generation starts, each upstream call reserves its worst case and is
 * reconciled to its real usage, and the work runs under `waitUntil`, so a disconnect cannot cut the
 * bookkeeping short. /api/commit only moves the device cookie.
 */

export const NDJSON = "application/x-ndjson";
export const GENERATION_BUDGET_MS = 240_000;
export const PING_MS = 10_000;

export const wantsStream = (request: Request) => (request.headers.get("accept") ?? "").toLowerCase().includes(NDJSON);

export interface GenerationOutcome {
  /** exactly the JSON body of a successful non-stream response */
  body: unknown;
  /** cookies that record what the generation spent (set only on success) */
  cookies: CookieSpec[];
}

/**
 * P4: how a credit-backed generation settles (spec 5.4). Everything runs inside the generation's
 * keepAlive work, after run() and before the JSON body or the `done` event leaves.
 * - `deliver` saves the reading and spends the reservation; what it returns joins the body (the
 *   saved reading's id).
 * - `recover` runs when deliver threw: what deliver would have returned if the save landed anyway
 *   (its D1 answer was lost), else null.
 * - `release` runs on every failure: generation error, budget, client gone before the model began
 *   answering, a save that did not land. It must be idempotent and a no-op once delivered.
 * - `abandon` runs instead when the client left after the model began answering (SEC-02): the credit
 *   comes back to open again (a few times at most), but its purchase is no longer refundable. Without
 *   it the reservation is simply kept until it lapses.
 */
export interface Settlement {
  deliver(outcome: GenerationOutcome): Promise<Record<string, unknown>>;
  recover(): Promise<Record<string, unknown> | null>;
  release(): Promise<void>;
  abandon?(): Promise<void>;
}

export interface RespondOptions {
  gate: Gate;
  /** cookies that do not depend on the outcome (a device id), set with the response headers */
  startCookies?: CookieSpec[];
  /** the network day counter this generation is charged to, before it starts (none for a stored result; owners are not counted) */
  spend?: SpendKind;
  budgetMs?: number;
  pingMs?: number;
  /**
   * P4: saves the reading and settles its credit before the client sees it; none for 오픈 기념 무료 readings.
   * A generation with a settlement is opened by a credit (gift, purchase) or the owner, so its cost
   * never counts toward the network's free-tier total (SEC-01).
   */
  settle?: Settlement;
  /** P4: a paid opening: its model cost goes to the paid book (addPaidCost), never the free-tier total */
  paidCost?: boolean;
}

/** One signal for everything that should stop the generation: client gone, stream cancelled, budget spent. */
function generationSignal(request: Request, budgetMs: number): { signal: AbortSignal; cancel: () => void; done: () => void; clientGone: () => boolean } {
  const controller = new AbortController();
  let gone = false;
  const timer = setTimeout(() => controller.abort(new Error("generation budget spent")), budgetMs);
  const onClientAbort = () => {
    gone = true;
    controller.abort(new Error("client disconnected"));
  };
  if (request.signal.aborted) onClientAbort();
  else request.signal.addEventListener("abort", onClientAbort, { once: true });
  return {
    signal: controller.signal,
    clientGone: () => gone,
    cancel: () => {
      gone = true;
      controller.abort(new Error("stream cancelled"));
    },
    done: () => {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", onClientAbort);
    },
  };
}

/** Keeps `work` alive past the response or a disconnect (Workers `ctx.waitUntil`); outside Workers nothing cancels it. */
function keepAlive(work: Promise<unknown>): void {
  try {
    getCloudflareContext().ctx.waitUntil(work);
  } catch {
    // not on Workers (tests, next dev)
  }
}

export async function respondGeneration(
  request: Request,
  run: (hooks: GenerationHooks) => Promise<GenerationOutcome>,
  options: RespondOptions,
): Promise<Response> {
  const { gate, startCookies = [], spend, budgetMs = GENERATION_BUDGET_MS, pingMs = PING_MS, settle, paidCost } = options; // P4: settle, paidCost
  const start = startCookies.map(serializeCookie);
  // What the browser holds once the stream's own Set-Cookie headers land (the commit replaces these).
  const cookiesAfterStart: Record<string, string> = { ...gate.cookies };
  for (const cookie of startCookies) cookiesAfterStart[cookie.name] = cookie.value;
  // Charged before anything starts: leaving before `done` (or skipping /api/commit) is still counted.
  if (spend && !gate.owner) await recordClientSpend(gate.client, spend, gate.now);
  const abort = generationSignal(request, budgetMs);
  const deadline = Date.now() + budgetMs;
  // One ledger per concurrent upstream call: two calls sharing one would settle each other's reservations. Their writes
  // still go through one queue: a cost write reads a shard and writes it back, so two at once on one shard lose one.
  const book: CostSink = paidCost ? addPaidCost : addCost; // P4: paid book
  const network = !gate.owner && !settle && !paidCost; // SEC-01: free-tier generations only (a paid follow-up has no settlement but is paid for)
  let queue: Promise<unknown> = Promise.resolve();
  const sink: CostSink = (krw, at) => {
    const written = queue.then(async () => {
      await book(krw, at);
      if (network) await addNetworkCost(gate.client, krw, at);
    });
    queue = written.catch(() => {}); // a failed write (the ledger logs it) never stops the next one
    return written;
  };
  const ledgers: SpendLedger[] = [];
  const costHooks = (): GenerationHooks => {
    const ledger = new SpendLedger(Date.now, sink);
    ledgers.push(ledger);
    return { onReserve: (usage) => ledger.reserve(usage), onRelease: () => ledger.release(), onUsage: (usage) => ledger.bill(usage) };
  };
  const finishLedgers = () => Promise.all(ledgers.map((ledger) => ledger.finish()));
  const accounting: GenerationHooks = {
    signal: abort.signal,
    deadline,
    ...costHooks(),
    // a second call alongside the first (정통 사주's 7절·8절): the same signal and deadline, a ledger of its own
    concurrent: () => ({ signal: abort.signal, deadline, ...costHooks() }),
  };
  // P4: a failed release is not lost: the reservation expires (RESERVATION_MS) and a sweep returns it.
  // SEC-02: a client that left after the model began answering abandons the credit instead; a failure
  // after the generation finished (a save that did not land) is the server's and always releases.
  const release = async (generated: boolean) => {
    if (!settle) return;
    const abandoned = !generated && abort.clientGone() && ledgers.some((ledger) => ledger.began);
    try {
      await (abandoned ? settle.abandon?.() : settle.release());
    } catch (error) {
      console.error(JSON.stringify({ evt: "settle.release_failed", error: error instanceof Error ? error.constructor.name : typeof error }));
    }
  };
  // P4: the body the client gets: unchanged without a settlement; with one, saved (or found saved) first.
  const settled = async (outcome: GenerationOutcome): Promise<unknown> => {
    if (!settle) return outcome.body;
    let extra: Record<string, unknown>;
    try {
      extra = await settle.deliver(outcome);
    } catch (error) {
      const recovered = await settle.recover().catch((recoverError: unknown) => {
        console.error(JSON.stringify({ evt: "settle.recover_failed", error: recoverError instanceof Error ? recoverError.constructor.name : typeof recoverError }));
        return null;
      });
      if (!recovered) throw error;
      console.warn(JSON.stringify({ evt: "settle.recovered" }));
      extra = recovered;
    }
    return { ...(outcome.body as Record<string, unknown>), ...extra };
  };

  if (!wantsStream(request)) {
    const work = (async () => {
      let generated = false;
      try {
        const outcome = await run(accounting);
        generated = true;
        const body = await settled(outcome); // P4
        // One Set-Cookie per name: the outcome's cookie replaces a start cookie of the same name.
        const names = new Set(outcome.cookies.map((c) => c.name));
        const cookies = [...startCookies.filter((c) => !names.has(c.name)), ...outcome.cookies];
        return json(body, { cookies: cookies.map(serializeCookie) });
      } catch (error) {
        await release(generated); // P4
        const { status, body } = generationErrorPayload(error);
        return json(body, { status, cookies: start });
      } finally {
        abort.done();
        await finishLedgers();
      }
    })();
    keepAlive(work);
    return work;
  }

  const encoder = new TextEncoder();
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      write({ type: "start" });
      const ping = setInterval(() => write({ type: "ping" }), pingMs);
      const scanner = new SectionScanner();
      const hooks: GenerationHooks = {
        ...accounting,
        onText: (snapshot) => {
          for (const section of scanner.push(snapshot)) write({ type: "section", key: section.key, index: section.index });
        },
        onAttempt: (attempt) => {
          if (attempt < 2) return;
          scanner.reset();
          write({ type: "retry", reason: "quality" });
        },
        // a part the generation reports itself (정통 사주: its sections in reading order, 7절·8절 from their own call)
        onSection: (key, index) => write({ type: "section", key, index }),
      };
      keepAlive((async () => {
        let generated = false;
        try {
          const outcome = await run(hooks);
          generated = true;
          const data = await settled(outcome); // P4: saved and spent before done
          const commit = outcome.cookies.length ? await issueCommit(outcome.cookies, cookiesAfterStart, gate.secret, gate.now) : null;
          write({ type: "done", data, ...(commit ? { commit } : {}) });
        } catch (error) {
          await release(generated); // P4
          const { status, body: errorBody } = generationErrorPayload(error);
          write({ type: "error", status, body: errorBody });
        } finally {
          clearInterval(ping);
          abort.done();
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // already closed by the client
            }
          }
          await finishLedgers();
        }
      })());
    },
    cancel() {
      closed = true;
      abort.cancel();
    },
  });

  const headers = new Headers({
    "Content-Type": `${NDJSON}; charset=utf-8`,
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  });
  for (const cookie of start) headers.append("Set-Cookie", cookie);
  return new Response(body, { status: 200, headers });
}
