import type { TaskName } from "./provider";

/**
 * Model and effort per generation kind, env-overridable. Precedence: the kind's own variable
 * (STARLOG_MODEL_TAROT_FULL, STARLOG_EFFORT_DAILY, …), then the global one (STARLOG_MODEL,
 * STARLOG_EFFORT), then today's defaults: claude-opus-5-5; teaser, daily and follow-up at `low`,
 * full readings at `medium`. Unknown models or efforts are configuration errors, never guesses.
 */

export const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5"] as const;
export type ModelId = (typeof MODELS)[number];
export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

/** Both models accept all five levels with adaptive thinking. */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** The env suffix of each generation kind. */
export const KIND_ENV: Record<TaskName, string> = {
  "tarot-teaser": "TAROT_TEASER",
  "tarot-reading": "TAROT_FULL",
  "tarot-daily": "DAILY",
  "saju-teaser": "SAJU_TEASER",
  "saju-reading": "SAJU_FULL",
  "saju-reading-b": "SAJU_FULL_B",
  "saju-enrichment": "SAJU_ENRICHMENT",
  "saju-topic-teaser": "SAJU_TOPIC_TEASER",
  "saju-topic-reading": "SAJU_TOPIC_FULL",
  followup: "FOLLOWUP",
  "premium-teaser": "PREMIUM_TEASER",
  "deep-tarot-part": "PREMIUM_DEEP",
  "match-part": "PREMIUM_MATCH",
  "newyear-part": "PREMIUM_NEWYEAR",
  "premium-followup": "PREMIUM_FOLLOWUP",
};

export const DEFAULT_EFFORT: Record<TaskName, Effort> = {
  "tarot-teaser": "low",
  "tarot-reading": "medium",
  "tarot-daily": "low",
  "saju-teaser": "low",
  "saju-reading": "medium",
  // 정통 사주's second half (owner 2026-10-16), at the first half's ("saju-reading") effort: paid quality stays
  "saju-reading-b": "medium",
  // 정통 사주's 7절·8절 (about 700자) in their own call, next to the main one: kept short so it finishes first
  "saju-enrichment": "low",
  "saju-topic-teaser": "low",
  "saju-topic-reading": "medium",
  followup: "low",
  "premium-teaser": "low",
  "deep-tarot-part": "medium",
  "match-part": "medium",
  "newyear-part": "medium",
  "premium-followup": "low",
};

/** Output budget per kind at today's effort; higher effort thinks more, so it gets room to finish. */
const BASE_MAX_TOKENS: Record<TaskName, number> = {
  "tarot-teaser": 8000,
  "tarot-reading": 16000,
  "tarot-daily": 8000,
  "saju-teaser": 8000,
  // each half of 정통 사주 writes ~1,500자 (~7–9k output tokens with thinking, the whole was ~15k); 16000 is the medium floor
  "saju-reading": 16000,
  "saju-reading-b": 16000,
  "saju-enrichment": 8000,
  "saju-topic-teaser": 8000,
  "saju-topic-reading": 16000,
  followup: 8000,
  // A premium part writes ~2,000–3,000 characters (~10k output tokens with thinking); room for variance.
  "premium-teaser": 8000,
  "deep-tarot-part": 24000,
  "match-part": 24000,
  "newyear-part": 24000,
  "premium-followup": 8000,
};
const MIN_MAX_TOKENS: Record<Effort, number> = { low: 8000, medium: 16000, high: 32000, xhigh: 64000, max: 64000 };

export interface GenerationSetting {
  model: ModelId;
  effort: Effort;
  maxTokens: number;
}

export class AiConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`AI config: ${problems.join("; ")}`);
    this.name = "AiConfigError";
  }
}

function pick(env: NodeJS.ProcessEnv, names: string[]): { name: string; value: string } | null {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

function resolve(kind: TaskName, env: NodeJS.ProcessEnv): { setting: GenerationSetting; problems: string[] } {
  const problems: string[] = [];
  const suffix = KIND_ENV[kind];
  const model = pick(env, [`STARLOG_MODEL_${suffix}`, "STARLOG_MODEL"]);
  const effort = pick(env, [`STARLOG_EFFORT_${suffix}`, "STARLOG_EFFORT"]);
  // The variable name is reported, never its value (values are config, but keep logs boring).
  if (model && !(MODELS as readonly string[]).includes(model.value)) problems.push(`${model.name}: allowed ${MODELS.join(", ")}`);
  if (effort && !(EFFORTS as readonly string[]).includes(effort.value)) problems.push(`${effort.name}: allowed ${EFFORTS.join(", ")}`);
  const resolvedEffort = effort && (EFFORTS as readonly string[]).includes(effort.value) ? (effort.value as Effort) : DEFAULT_EFFORT[kind];
  return {
    setting: {
      model: model && (MODELS as readonly string[]).includes(model.value) ? (model.value as ModelId) : DEFAULT_MODEL,
      effort: resolvedEffort,
      maxTokens: Math.max(BASE_MAX_TOKENS[kind], MIN_MAX_TOKENS[resolvedEffort]),
    },
    problems,
  };
}

/** Model, effort and max_tokens for one kind. Throws AiConfigError on an unknown model or effort. */
export function generationSetting(kind: TaskName, env: NodeJS.ProcessEnv = process.env): GenerationSetting {
  const { setting, problems } = resolve(kind, env);
  if (problems.length) throw new AiConfigError(problems);
  return setting;
}

/** Every configuration problem across kinds (empty when the config is valid). */
export function aiConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  return [...new Set((Object.keys(KIND_ENV) as TaskName[]).flatMap((kind) => resolve(kind, env).problems))];
}
