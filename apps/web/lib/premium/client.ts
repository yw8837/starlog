import { postGeneration, type ApiResult, type GenerationOptions, type Progress } from "@/lib/reading/api";
import type { PremiumId } from "./products";

/**
 * Browser side of a premium reading (P5 spec §6.1): one request per part. A `continue` answer's
 * resume token is kept in this tab (sessionStorage, with the input it belongs to: the partner's birth
 * never leaves the tab, spec §9) and sent with the next request; `done` clears it. After a failure the
 * token stays, so opening again starts from the next part (a reload keeps it; a closed tab does not,
 * and the purchase then writes from the start, up to the ledger's MAX_RESTORES). A resume token the
 * server refuses (expired, another account: 400 `token: "resume"`) is dropped and the reading starts
 * over once; a dead draw (`token: "draw"`) and every other error go back to the screen.
 */

export const premiumApiPath = (id: PremiumId, kind: "teaser" | "reading") => `/api/premium/${id}/${kind}`;
export const PREMIUM_RESUME_KEY = (id: PremiumId) => `starlog.premium-resume.${id}`;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface Saved {
  input: string;
  resume: string;
  done: number;
}

export interface PremiumContinue {
  status: "continue";
  resume: string;
  done: number;
  of: number;
}

export interface PremiumDone<R> {
  status: "done";
  reading: R;
  chapterToken: string;
  /** the account copy's id (a paid opening, or the owner logged in) */
  readingId?: string;
}

export interface PremiumProgressEvent {
  /** parts already written (0-based index of the part being written) */
  part: number;
  of: number;
  /** the stream's section events for this part; null when a part starts */
  progress: Progress | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A part's answer: `continue` with the next token, or `done` with the reading and its chapter token. */
export function isPremiumStep(data: unknown): data is PremiumContinue | PremiumDone<unknown> {
  if (!isRecord(data)) return false;
  if (data.status === "continue") return typeof data.resume === "string" && typeof data.done === "number" && typeof data.of === "number";
  return data.status === "done" && isRecord(data.reading) && typeof data.chapterToken === "string";
}

/** The generation call (lib/reading/api postGeneration); injectable for tests. */
export type PostGeneration = (path: string, body: unknown, options: GenerationOptions<unknown>) => Promise<ApiResult<unknown>>;

function session(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(store: Store | null, id: PremiumId, input: string): Saved | null {
  try {
    const value = JSON.parse(store?.getItem(PREMIUM_RESUME_KEY(id)) ?? "null") as Partial<Saved> | null;
    return value && value.input === input && typeof value.resume === "string" && typeof value.done === "number" ? (value as Saved) : null;
  } catch {
    return null;
  }
}

function write(store: Store | null, id: PremiumId, saved: Saved) {
  try {
    store?.setItem(PREMIUM_RESUME_KEY(id), JSON.stringify(saved));
  } catch {
    // storage full or blocked: the reading still finishes in this page
  }
}

function clear(store: Store | null, id: PremiumId) {
  try {
    store?.removeItem(PREMIUM_RESUME_KEY(id));
  } catch {
    // ignore
  }
}

/** Parts already written for this input in this tab (to say "이어서 받기"), or null. */
export function pendingResume(id: PremiumId, input: Record<string, unknown>, store: Store | null = session()): { done: number } | null {
  const saved = read(store, id, JSON.stringify(input));
  return saved ? { done: saved.done } : null;
}

export async function runPremiumReading<R>(
  id: PremiumId,
  input: Record<string, unknown>,
  opts: {
    method: "paid" | "owner";
    /** parts the product is written in (PREMIUM[id].parts.length) */
    of: number;
    onProgress?: (event: PremiumProgressEvent) => void;
    signal?: AbortSignal;
    storage?: Store | null;
    post?: PostGeneration;
  },
): Promise<ApiResult<PremiumDone<R>>> {
  const store = opts.storage === undefined ? session() : opts.storage;
  const post: PostGeneration = opts.post ?? ((path, body, options) => postGeneration<unknown>(path, body, options));
  const key = JSON.stringify(input);
  const saved = read(store, id, key);
  let resume = saved?.resume;
  let part = saved?.done ?? 0;
  let restarted = false;
  // every part once, plus one fresh start after a refused token
  for (let round = 0; round <= opts.of + 1; round++) {
    opts.onProgress?.({ part, of: opts.of, progress: null });
    const at = part;
    const result = await post(
      premiumApiPath(id, "reading"),
      { ...input, unlock: { method: opts.method }, ...(resume ? { resume } : {}) },
      { signal: opts.signal, accept: isPremiumStep, onProgress: (progress) => opts.onProgress?.({ part: at, of: opts.of, progress }) },
    );
    if (!result.ok) {
      if (result.error.code === "BAD_TOKEN" && result.error.token === "resume" && resume && !restarted) {
        clear(store, id);
        resume = undefined;
        part = 0;
        restarted = true;
        continue;
      }
      return result;
    }
    const data = result.data as PremiumContinue | PremiumDone<R>;
    if (data.status === "done") {
      clear(store, id);
      return { ok: true, data, ...(result.commit ? { commit: result.commit } : {}) };
    }
    resume = data.resume;
    part = data.done;
    write(store, id, { input: key, resume, done: part });
  }
  return { ok: false, error: { code: "UPSTREAM", status: 502 } };
}
