import "server-only";
import type { z } from "zod";
import { anthropicProvider } from "./anthropic";
import type { Effort, ModelId } from "./config";
import { mockProvider } from "./mock";
import { isSoftViolation, softWarrantsRegeneration, stripBold } from "./style";

/**
 * Where readings come from. `anthropic` calls Claude; `mock` builds deterministic text from the
 * drawn cards' KB entries (tests, key-less local dev, e2e with STARLOG_AI=mock). Production without
 * a key gets no provider at all, so routes answer 503 instead of serving canned text.
 */

export type GenerationErrorCode = "REFUSED" | "QUALITY" | "UPSTREAM";

export class GenerationError extends Error {
  constructor(
    readonly code: GenerationErrorCode,
    /** validator/schema findings (QUALITY) or an SDK error class name (UPSTREAM); never user text */
    readonly detail: string[] = [],
  ) {
    super(`${code}${detail.length ? `: ${detail.join("; ")}` : ""}`);
    this.name = "GenerationError";
  }
}

export type { Effort } from "./config";

export interface Usage {
  /** the model that produced the tokens (a server-side fallback reports its own) */
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type TaskName =
  | "tarot-teaser" | "tarot-reading" | "tarot-daily" | "saju-teaser" | "saju-reading" | "followup"
  | "saju-topic-teaser" | "saju-topic-reading"
  | "premium-teaser" | "deep-tarot-part" | "match-part" | "newyear-part" | "premium-followup";

export interface GenerationTask<T> {
  name: TaskName;
  /** stable per task family, so it caches */
  system: string;
  /** user data (inside delimited tags) and the task */
  user: string;
  /**
   * User data shared by a premium product's parts (cards, charts): sent before `user` as its own
   * block with cache_control, so the next part reads it from the 5-minute cache.
   */
  shared?: string;
  schema: z.ZodType<T>;
  /** defaults to claude-opus-5-5 (lib/ai/config.ts decides per kind) */
  model?: ModelId;
  effort: Effort;
  maxTokens: number;
  /** what the mock provider returns; `attempt` is 1 or 2 */
  mock: (attempt: number) => T;
}

/** Live progress and cancellation for one generation (streaming routes, client disconnects). */
export interface GenerationHooks {
  /** aborts the upstream request (client gone, or the 240 s budget spent) */
  signal?: AbortSignal;
  /** the model's output text so far (partial JSON), on every streamed chunk */
  onText?: (snapshot: string) => void;
  /** called as each validated attempt starts (2 = the regeneration) */
  onAttempt?: (attempt: number) => void;
  /** the worst-case usage of an upstream call about to start (the caller reserves its cost until onUsage) */
  onReserve?: (usage: Usage[]) => void;
  /** that call failed before the model began answering: nothing was billed, drop the reservation */
  onRelease?: () => void;
  /** billed usage, reported by the provider as each upstream call completes (refused or cut-off ones too) */
  onUsage?: (usage: Usage[]) => void;
  /** epoch ms when the caller's budget runs out; no regeneration starts that cannot finish before it */
  deadline?: number;
}

export interface ReadingProvider {
  readonly name: "anthropic" | "mock";
  /** `feedback` lists the previous attempt's violations (regeneration). */
  generate<T>(task: GenerationTask<T>, attempt: number, feedback?: string[], hooks?: GenerationHooks): Promise<{ data: T; usage: Usage[] }>;
}

/**
 * `mock` when STARLOG_AI=mock, or outside production without a key; `anthropic` when a key is set;
 * null (routes answer 503 AI_UNAVAILABLE) in production without a key.
 */
let warnedMockInProduction = false;

export function selectProvider(env: NodeJS.ProcessEnv = process.env): ReadingProvider | null {
  if (env.STARLOG_AI === "mock") {
    // Meant for e2e on a production build; on a real deployment it would hide the real key.
    if (env.NODE_ENV === "production" && env.ANTHROPIC_API_KEY?.trim() && !warnedMockInProduction) {
      warnedMockInProduction = true;
      console.warn(JSON.stringify({ evt: "config.mock_in_production", note: "STARLOG_AI=mock overrides ANTHROPIC_API_KEY" }));
    }
    return mockProvider;
  }
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (key) return anthropicProvider(key);
  return env.NODE_ENV === "production" ? null : mockProvider;
}

export interface Generated<T> {
  data: T;
  usage: Usage[];
  attempts: number;
}

type Path = ReadonlyArray<string | number>;
const sajuBold = (p: Path) => (p[0] === "sections" && p[2] === "body") || p[0] === "glance";
const TAROT_BOLD = new Set(["connection", "timing", "alternatives", "action"]);
const tarotBold = (p: Path) => (p[0] === "cards" && p[2] === "body") || (TAROT_BOLD.has(String(p[0])) && p[1] === "body");
/**
 * The fields a task's screen shows with BoldText (reading-voice-2026-10 §2.2); every other task shows none. Never the
 * observation: the 돌아보기 card shows it as plain text and history keeps its first 120 characters (review 2026-10-08).
 */
const BOLD_FIELDS: Partial<Record<TaskName, (path: Path) => boolean>> = { "saju-reading": sajuBold, "saju-topic-reading": sajuBold, "tarot-reading": tarotBold };

/**
 * A draft with its stray `**` taken out (review 2026-10-08): only the fields its screen shows bold keep the marks, so no
 * check reads a sentence split by a mark, and no teaser, answer, message to send or daily card shows one. The reading
 * validators read the kept marks themselves (the bold budget) and check the words without them.
 */
function withoutStrayBold<T>(task: TaskName, draft: T): T {
  const keep = BOLD_FIELDS[task];
  const walk = (value: unknown, path: Path): unknown => {
    if (typeof value === "string") return keep?.(path) ? value : stripBold(value);
    if (Array.isArray(value)) return value.map((item, i) => walk(item, [...path, i]));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, [...path, key])]));
    return value;
  };
  return walk(draft, []) as T;
}

/**
 * Generates, validates, and regenerates at most once, with the violations as feedback.
 * - Every draft loses its stray bold marks first (withoutStrayBold): what is checked is what is returned.
 * - Regenerates only for a hard violation, or for soft findings under the ≥3 rule
 *   (softWarrantsRegeneration). A draft with fewer soft findings is returned as it is.
 * - A soft-only draft is paid for and usable, so it is kept. If the regeneration fails (hard
 *   violations, refusal, upstream error, abort) or could not finish before `hooks.deadline`, that
 *   draft is returned instead of an error.
 * - Two unusable drafts are `QUALITY`. Refusals and upstream errors are never retried here (the SDK
 *   already retried).
 */
export async function generateValidated<T>(
  provider: ReadingProvider,
  task: GenerationTask<T>,
  validate: (data: T) => string[],
  hooks: GenerationHooks = {},
): Promise<Generated<T>> {
  const usage: Usage[] = [];
  let feedback: string[] | undefined;
  /** attempt 1's soft-only draft, kept while the regeneration runs */
  let kept: T | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (hooks.signal?.aborted) {
      if (kept !== undefined) return { data: kept, usage, attempts: attempt - 1 };
      throw new GenerationError("UPSTREAM", ["aborted"]);
    }
    hooks.onAttempt?.(attempt);
    const started = Date.now();
    let violations: string[];
    let data: T | undefined;
    try {
      const result = await provider.generate(task, attempt, feedback, hooks);
      usage.push(...result.usage);
      // once, before the checks read it, and as it is saved and returned
      data = withoutStrayBold(task.name, result.data);
      violations = validate(data);
    } catch (error) {
      if (!(error instanceof GenerationError) || error.code !== "QUALITY") {
        const failure = error instanceof GenerationError ? error : new GenerationError("UPSTREAM", [errorName(error)]);
        logGeneration(task.name, provider.name, attempt, Date.now() - started, failureStatus(failure), usage, failure.code === "UPSTREAM" ? failure.detail : []);
        if (kept !== undefined) return { data: kept, usage, attempts: attempt };
        throw failure;
      }
      violations = error.detail.length ? error.detail : ["출력 형식이 맞지 않았어요"];
    }
    logGeneration(task.name, provider.name, attempt, Date.now() - started, violations.length ? `violations:${violations.length}` : "ok", usage);
    const usable = data !== undefined && violations.every(isSoftViolation);
    if (usable && (attempt === 2 || !softWarrantsRegeneration(violations))) return { data: data!, usage, attempts: attempt };
    if (attempt === 2) {
      if (kept !== undefined) return { data: kept, usage, attempts: attempt };
      feedback = violations;
      break;
    }
    if (usable) kept = data;
    feedback = violations;
    // A regeneration that cannot finish in time would be billed and then aborted: skip it.
    if (hooks.deadline !== undefined && Date.now() + (Date.now() - started) > hooks.deadline) {
      if (kept !== undefined) return { data: kept, usage, attempts: attempt };
      break;
    }
  }
  throw new GenerationError("QUALITY", (feedback ?? []).filter((v) => !isSoftViolation(v)));
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/**
 * The log status of a failed attempt: its code, except an upstream 403 / permission error, which is
 * UPSTREAM_FORBIDDEN (an unsupported region or a key without access, not a passing outage). Users
 * still get UPSTREAM.
 */
export function failureStatus(error: GenerationError): string {
  if (error.code === "UPSTREAM" && error.detail.some((d) => /:403$|^PermissionDenied/.test(d))) return "UPSTREAM_FORBIDDEN";
  return error.code;
}

/** SDK error class and HTTP status only ("APIError:403", "aborted"); anything else is dropped. */
const SAFE_DETAIL = /^(?:[A-Za-z]+(?::(?:\d{3}|-))?|aborted)$/;

/** One line per attempt: ids, timings, token usage, status and upstream error class/status only (never user or model text). */
function logGeneration(task: TaskName, provider: string, attempt: number, ms: number, status: string, usage: Usage[], detail: readonly string[] = []): void {
  const tokens = usage.reduce(
    (sum, u) => ({ in: sum.in + u.inputTokens, out: sum.out + u.outputTokens, cacheRead: sum.cacheRead + u.cacheReadTokens, cacheWrite: sum.cacheWrite + u.cacheWriteTokens }),
    { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
  );
  const safe = detail.filter((d) => SAFE_DETAIL.test(d));
  console.info(JSON.stringify({ evt: "ai.generate", task, provider, attempt, ms, status, ...(safe.length ? { detail: safe } : {}), tokens }));
}
