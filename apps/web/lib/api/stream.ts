import "server-only";
import type { GenerationHooks } from "@/lib/ai/provider";
import { issueCommit } from "@/lib/security/commit";
import { generationErrorPayload, json, serializeCookie, type CookieSpec, type Gate } from "./http";
import { SectionScanner } from "./sections";

/**
 * Generation responses (.superpowers/sdd/2026-09-30-starlog-p2b/streaming-protocol.md). A request
 * with `Accept: application/x-ndjson` gets progress as NDJSON (start, section, retry, ping, then
 * done or error); any other request gets the same JSON as before. Both paths share one generation
 * budget and abort upstream when the client goes away, so abandoned readings stop billing.
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

export interface RespondOptions {
  gate: Gate;
  /** cookies that do not depend on the outcome (a device id), set with the response headers */
  startCookies?: CookieSpec[];
  budgetMs?: number;
  pingMs?: number;
}

/** One signal for everything that should stop the generation: client gone, stream cancelled, budget spent. */
function generationSignal(request: Request, budgetMs: number): { signal: AbortSignal; cancel: () => void; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("generation budget spent")), budgetMs);
  const onClientAbort = () => controller.abort(new Error("client disconnected"));
  if (request.signal.aborted) onClientAbort();
  else request.signal.addEventListener("abort", onClientAbort, { once: true });
  return {
    signal: controller.signal,
    cancel: () => controller.abort(new Error("stream cancelled")),
    done: () => {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", onClientAbort);
    },
  };
}

export async function respondGeneration(
  request: Request,
  run: (hooks: GenerationHooks) => Promise<GenerationOutcome>,
  options: RespondOptions,
): Promise<Response> {
  const { gate, startCookies = [], budgetMs = GENERATION_BUDGET_MS, pingMs = PING_MS } = options;
  const start = startCookies.map(serializeCookie);
  // What the browser holds once the stream's own Set-Cookie headers land (the commit replaces these).
  const cookiesAfterStart: Record<string, string> = { ...gate.cookies };
  for (const cookie of startCookies) cookiesAfterStart[cookie.name] = cookie.value;
  const abort = generationSignal(request, budgetMs);

  if (!wantsStream(request)) {
    try {
      const outcome = await run({ signal: abort.signal });
      return json(outcome.body, { cookies: [...start, ...outcome.cookies.map(serializeCookie)] });
    } catch (error) {
      const { status, body } = generationErrorPayload(error);
      return json(body, { status, cookies: start });
    } finally {
      abort.done();
    }
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
        signal: abort.signal,
        onText: (snapshot) => {
          for (const section of scanner.push(snapshot)) write({ type: "section", key: section.key, index: section.index });
        },
        onAttempt: (attempt) => {
          if (attempt < 2) return;
          scanner.reset();
          write({ type: "retry", reason: "quality" });
        },
      };
      void (async () => {
        try {
          const outcome = await run(hooks);
          const commit = outcome.cookies.length ? await issueCommit(outcome.cookies, cookiesAfterStart, gate.secret, gate.now) : null;
          write({ type: "done", data: outcome.body, ...(commit ? { commit } : {}) });
        } catch (error) {
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
        }
      })();
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
