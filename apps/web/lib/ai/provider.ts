import "server-only";
import type { z } from "zod";
import { anthropicProvider } from "./anthropic";
import { mockProvider } from "./mock";

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

export type Effort = "low" | "medium";

export interface Usage {
  /** the model that produced the tokens (a server-side fallback reports its own) */
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type TaskName =
  | "tarot-teaser" | "tarot-reading" | "tarot-daily" | "saju-teaser" | "saju-reading" | "followup";

export interface GenerationTask<T> {
  name: TaskName;
  /** stable per task family, so it caches */
  system: string;
  /** user data (inside delimited tags) and the task */
  user: string;
  schema: z.ZodType<T>;
  effort: Effort;
  maxTokens: number;
  /** what the mock provider returns; `attempt` is 1 or 2 */
  mock: (attempt: number) => T;
}

export interface ReadingProvider {
  readonly name: "anthropic" | "mock";
  /** `feedback` lists the previous attempt's violations (regeneration). */
  generate<T>(task: GenerationTask<T>, attempt: number, feedback?: string[]): Promise<{ data: T; usage: Usage[] }>;
}

/**
 * `mock` when STARLOG_AI=mock, or outside production without a key; `anthropic` when a key is set;
 * null (routes answer 503 AI_UNAVAILABLE) in production without a key.
 */
export function selectProvider(env: NodeJS.ProcessEnv = process.env): ReadingProvider | null {
  if (env.STARLOG_AI === "mock") return mockProvider;
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (key) return anthropicProvider(key);
  return env.NODE_ENV === "production" ? null : mockProvider;
}

export interface Generated<T> {
  data: T;
  usage: Usage[];
  attempts: number;
}

/**
 * Generates, validates, and regenerates once with the violations as feedback. A second failure is
 * `QUALITY`; refusals and upstream errors are never retried here (the SDK already retried).
 */
export async function generateValidated<T>(
  provider: ReadingProvider,
  task: GenerationTask<T>,
  validate: (data: T) => string[],
): Promise<Generated<T>> {
  const usage: Usage[] = [];
  let feedback: string[] | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    let violations: string[];
    let data: T | undefined;
    try {
      const result = await provider.generate(task, attempt, feedback);
      usage.push(...result.usage);
      data = result.data;
      violations = validate(result.data);
    } catch (error) {
      if (!(error instanceof GenerationError) || error.code !== "QUALITY") {
        logGeneration(task.name, provider.name, attempt, Date.now() - started, error instanceof GenerationError ? error.code : "UPSTREAM", usage);
        throw error instanceof GenerationError ? error : new GenerationError("UPSTREAM", [errorName(error)]);
      }
      violations = error.detail.length ? error.detail : ["출력 형식이 맞지 않았어요"];
    }
    logGeneration(task.name, provider.name, attempt, Date.now() - started, violations.length ? `violations:${violations.length}` : "ok", usage);
    if (violations.length === 0 && data !== undefined) return { data, usage, attempts: attempt };
    feedback = violations;
  }
  throw new GenerationError("QUALITY", feedback ?? []);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** One line per attempt: ids, timings, token usage and status only (never user text). */
function logGeneration(task: TaskName, provider: string, attempt: number, ms: number, status: string, usage: Usage[]): void {
  const tokens = usage.reduce(
    (sum, u) => ({ in: sum.in + u.inputTokens, out: sum.out + u.outputTokens, cacheRead: sum.cacheRead + u.cacheReadTokens, cacheWrite: sum.cacheWrite + u.cacheWriteTokens }),
    { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
  );
  console.info(JSON.stringify({ evt: "ai.generate", task, provider, attempt, ms, status, tokens }));
}
