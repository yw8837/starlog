/**
 * Browser side of the reading API. Plain JSON calls (the draw), and generation calls that stream
 * NDJSON progress (streaming-protocol: start, section, retry, ping, done, error) and fall back to
 * reading JSON when the server answers with JSON (older deploy, proxy).
 *
 * A streamed `done` may carry a `commit` token: in a stream the response headers leave before the
 * reading is validated, so the quota cookie is set by POST /api/commit. Callers keep what they got
 * (save the reading) first, then call `commitQuota`.
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
  | "NETWORK";

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
  /** Follow-up BETA_LIMIT: this chapter's questions or the day's. */
  scope?: "chapter" | "day";
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
  if (b.scope === "chapter" || b.scope === "day") error.scope = b.scope;
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

export interface GenerationOptions extends CallOptions {
  onProgress?: (progress: Progress) => void;
}

/**
 * POST a generation request with `Accept: application/x-ndjson`. Progress events go to
 * `onProgress`; the result is the `done` data or the error. A stream that ends without either is a
 * network error (nothing was spent: quota is only spent at `done`).
 */
export async function postGeneration<T>(path: string, body: unknown, options: GenerationOptions = {}): Promise<ApiResult<T>> {
  const response = await send(path, body, "application/x-ndjson, application/json", options);
  if (!response) return { ok: false, error: NETWORK };
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/x-ndjson") || !response.body) return readJsonResult<T>(response);

  // Assigned inside the line callback, so declared wide (no narrowing to null here).
  let result = null as ApiResult<T> | null;
  let commit = undefined as string | undefined;
  try {
    await readLines(response.body, (line) => {
      if (result) return;
      const event = parseStreamLine(line);
      if (event.type === "section") options.onProgress?.({ type: "section", key: event.key, index: event.index });
      else if (event.type === "retry") options.onProgress?.({ type: "retry" });
      else if (event.type === "done") {
        result = { ok: true, data: event.data as T };
        commit = event.commit;
      } else if (event.type === "error") result = { ok: false, error: parseApiError(event.status, event.body) };
    });
  } catch {
    // The connection dropped mid-stream (or the caller aborted).
  }
  if (!result) return { ok: false, error: NETWORK };
  return result.ok && commit ? { ...result, commit } : result;
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
