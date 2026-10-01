/**
 * Browser side of the reading API. Plain JSON calls (the draw), and generation calls that stream
 * NDJSON progress (streaming-protocol: start, section, retry, ping, done, error) and fall back to
 * reading JSON when the server answers with JSON (older deploy, proxy).
 *
 * A streamed `done` may carry a `commit` token: in a stream the response headers leave before the
 * reading is validated, so the quota cookie is set by POST /api/commit. Callers keep what they got
 * (save the reading) first, then call `commitQuota`.
 *
 * Generation calls also check the `done` data's shape (`accept`, lib/reading/validate.ts) and give
 * up on their own: an overall deadline a little above the server's, and a silence limit between
 * stream lines (the server pings while it writes).
 */

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "BAD_TOKEN"
  | "BETA_LIMIT"
  | "RATE_LIMIT"
  | "AI_UNAVAILABLE"
  | "REFUSED"
  | "QUALITY"
  | "UPSTREAM"
  | "NETWORK"
  /** Client side: the answer took longer than the deadline, or the stream went silent. */
  | "TIMEOUT"
  /** Client side: an answer arrived but did not have the reading's shape (nothing was kept). */
  | "INVALID";

const CODES: readonly ApiErrorCode[] = ["BAD_REQUEST", "BAD_TOKEN", "BETA_LIMIT", "RATE_LIMIT", "AI_UNAVAILABLE", "REFUSED", "QUALITY", "UPSTREAM"];

export interface ApiError {
  code: ApiErrorCode;
  /** HTTP status; 0 for a network failure. */
  status: number;
  /** The server's Korean message (shown only where the copy table says so). */
  message?: string;
  /** BETA_LIMIT: when the day's count resets (ISO time). */
  resetsAt?: string;
  /** REFUSED: the person may be in crisis. */
  care?: boolean;
  /**
   * BETA_LIMIT: which count ran out — this chapter's questions, the device's day, or the day's
   * count for the whole network (one Wi-Fi, office or school shares it).
   */
  scope?: "chapter" | "day" | "network";
  /** 오늘의 한 장 BETA_LIMIT: the day's card, without its text. */
  card?: { cardId: string; orientation: "upright" | "reversed" };
  /** BAD_REQUEST on saju input: the form field at fault. */
  field?: string;
}

export type ApiResult<T> = { ok: true; data: T; commit?: string } | { ok: false; error: ApiError };

/** Progress the waiting screen can show. */
export type Progress = { type: "section"; key: string; index: number } | { type: "retry" };

const NETWORK: ApiError = { code: "NETWORK", status: 0 };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** An error body ({code, message, ...}) as the client uses it; unknown codes map by status. */
export function parseApiError(status: number, body: unknown): ApiError {
  const b = isRecord(body) ? body : {};
  const code = CODES.find((c) => c === b.code) ?? (status >= 500 ? "UPSTREAM" : status === 429 ? "RATE_LIMIT" : "BAD_REQUEST");
  const error: ApiError = { code, status };
  if (typeof b.message === "string") error.message = b.message;
  if (typeof b.resetsAt === "string") error.resetsAt = b.resetsAt;
  if (b.care === true) error.care = true;
  if (b.scope === "chapter" || b.scope === "day" || b.scope === "network") error.scope = b.scope;
  if (typeof b.field === "string") error.field = b.field;
  if (isRecord(b.card) && typeof b.card.cardId === "string" && (b.card.orientation === "upright" || b.card.orientation === "reversed")) {
    error.card = { cardId: b.card.cardId, orientation: b.card.orientation };
  }
  return error;
}

type Fetch = typeof fetch;

interface CallOptions {
  signal?: AbortSignal;
  /** Injected in tests. */
  fetchImpl?: Fetch;
}

async function send(path: string, body: unknown, accept: string, { signal, fetchImpl = fetch }: CallOptions): Promise<Response | null> {
  try {
    return await fetchImpl(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: accept },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch {
    return null;
  }
}

async function readJsonResult<T>(response: Response): Promise<ApiResult<T>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: response.ok ? NETWORK : parseApiError(response.status, null) };
  }
  return response.ok ? { ok: true, data: body as T } : { ok: false, error: parseApiError(response.status, body) };
}

/** GET a JSON answer (no body). */
export async function getJson<T>(path: string, { signal, fetchImpl = fetch }: CallOptions = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(path, { method: "GET", headers: { Accept: "application/json" }, credentials: "same-origin", signal });
  } catch {
    return { ok: false, error: NETWORK };
  }
  return readJsonResult<T>(response);
}

/** POST a JSON body, read a JSON answer. */
export async function postJson<T>(path: string, body: unknown, options: CallOptions = {}): Promise<ApiResult<T>> {
  const response = await send(path, body, "application/json", options);
  return response ? readJsonResult<T>(response) : { ok: false, error: NETWORK };
}

type StreamEvent =
  | { type: "section"; key: string; index: number }
  | { type: "retry" }
  | { type: "done"; data: unknown; commit?: string }
  | { type: "error"; status: number; body: unknown }
  | { type: "other" };

/** One NDJSON line as an event; anything malformed or unknown (start, ping) is "other". */
export function parseStreamLine(line: string): StreamEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { type: "other" };
  }
  if (!isRecord(value)) return { type: "other" };
  switch (value.type) {
    case "section":
      return typeof value.key === "string" ? { type: "section", key: value.key, index: typeof value.index === "number" ? value.index : 0 } : { type: "other" };
    case "retry":
      return { type: "retry" };
    case "done":
      return { type: "done", data: value.data, ...(typeof value.commit === "string" ? { commit: value.commit } : {}) };
    case "error":
      return { type: "error", status: typeof value.status === "number" ? value.status : 502, body: value.body };
    default:
      return { type: "other" };
  }
}

/** Calls `onLine` for every complete line of the stream, including a last line without "\n". */
export async function readLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) if (line.trim()) onLine(line);
    if (done) return;
  }
}

/**
 * Client deadlines, a little above the server's own: a teaser (and 오늘의 한 장) 90 s, a follow-up
 * 120 s, a full reading 260 s. A stream silent for IDLE_MS (no line, not even a ping) is given up too.
 */
export function deadlineFor(path: string): number {
  if (path.endsWith("/teaser") || path.endsWith("/daily")) return 90_000;
  if (path.endsWith("/followup")) return 120_000;
  return 260_000;
}
export const IDLE_MS = 30_000;

export interface GenerationOptions<T> extends CallOptions {
  onProgress?: (progress: Progress) => void;
  /** The `done` data's shape check; anything else is INVALID and nothing is handed back. */
  accept: (data: unknown) => data is T;
  /** Overrides `deadlineFor(path)` and IDLE_MS (tests). */
  deadlineMs?: number;
  idleMs?: number;
}

/**
 * POST a generation request with `Accept: application/x-ndjson`. Progress events go to
 * `onProgress`; the result is the `done` data or the error. A stream that ends without either is a
 * network error (nothing was spent: quota is only spent at `done`). Past the deadline or after
 * `idleMs` of silence the request is aborted (which stops the server too) and TIMEOUT comes back;
 * `done` data that fails `accept` comes back as INVALID, without its commit token.
 */
export async function postGeneration<T>(path: string, body: unknown, options: GenerationOptions<T>): Promise<ApiResult<T>> {
  const { accept, onProgress, deadlineMs = deadlineFor(path), idleMs = IDLE_MS } = options;
  // One controller for this call: the caller's abort and both timers end it.
  const controller = new AbortController();
  let timedOut = false;
  const giveUp = () => {
    timedOut = true;
    controller.abort();
  };
  const onCallerAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const deadline = setTimeout(giveUp, deadlineMs);
  let idle: ReturnType<typeof setTimeout> | undefined;
  const heard = () => {
    clearTimeout(idle);
    idle = setTimeout(giveUp, idleMs);
  };

  const finish = (result: ApiResult<T>): ApiResult<T> => {
    clearTimeout(deadline);
    clearTimeout(idle);
    options.signal?.removeEventListener("abort", onCallerAbort);
    if (result.ok) return accept(result.data) ? result : { ok: false, error: { code: "INVALID", status: 502 } };
    // A timer ended the call (an answer or an error that did arrive stays as it is).
    return timedOut && result.error.code === "NETWORK" ? { ok: false, error: { code: "TIMEOUT", status: 0 } } : result;
  };

  const response = await send(path, body, "application/x-ndjson, application/json", { signal: controller.signal, fetchImpl: options.fetchImpl });
  if (!response) return finish({ ok: false, error: NETWORK });
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/x-ndjson") || !response.body) return finish(await readJsonResult<T>(response));

  // Assigned inside the line callback, so declared wide (no narrowing to null here).
  let result = null as ApiResult<T> | null;
  let commit = undefined as string | undefined;
  heard();
  try {
    await readLines(response.body, (line) => {
      if (result) return;
      heard();
      const event = parseStreamLine(line);
      if (event.type === "section") onProgress?.({ type: "section", key: event.key, index: event.index });
      else if (event.type === "retry") onProgress?.({ type: "retry" });
      else if (event.type === "done") {
        result = { ok: true, data: event.data as T };
        commit = event.commit;
      } else if (event.type === "error") result = { ok: false, error: parseApiError(event.status, event.body) };
    });
  } catch {
    // The connection dropped mid-stream, the caller aborted, or a timer gave up.
  }
  if (!result) return finish({ ok: false, error: NETWORK });
  return finish(result.ok && commit ? { ...result, commit } : result);
}

/**
 * Sets the quota cookie a streamed generation earned. Call it after the result is kept: it outlives
 * the page (keepalive), ignores the caller's abort, gives up after a few seconds, and never throws
 * (the server also counts at `done`).
 */
export async function commitQuota(commit: string, fetchImpl: Fetch = fetch): Promise<void> {
  try {
    await fetchImpl("/api/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ commit }),
      credentials: "same-origin",
      keepalive: true,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Not counted by cookie this time; the server-side count still holds.
  }
}
