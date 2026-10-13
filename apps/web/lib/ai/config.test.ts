import { describe, expect, it } from "vitest";
import { FALLBACK_BETA, buildRequest } from "./anthropic";
import { AiConfigError, aiConfigProblems, generationSetting, type ModelId } from "./config";
import { FollowUpAnswerSchema } from "./schemas";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("generation config", () => {
  it("keeps today's defaults when nothing is set: Opus 5.5, low for teaser/daily/follow-up, medium for full readings", () => {
    const none = env({});
    expect(generationSetting("tarot-teaser", none)).toEqual({ model: "claude-opus-5-5", effort: "low", maxTokens: 8000 });
    expect(generationSetting("tarot-reading", none)).toEqual({ model: "claude-opus-5-5", effort: "medium", maxTokens: 16000 });
    expect(generationSetting("tarot-daily", none)).toEqual({ model: "claude-opus-5-5", effort: "low", maxTokens: 8000 });
    expect(generationSetting("saju-teaser", none)).toEqual({ model: "claude-opus-5-5", effort: "low", maxTokens: 8000 });
    expect(generationSetting("saju-reading", none)).toEqual({ model: "claude-opus-5-5", effort: "medium", maxTokens: 16000 });
    expect(generationSetting("followup", none)).toEqual({ model: "claude-opus-5-5", effort: "low", maxTokens: 8000 });
    expect(aiConfigProblems(none)).toEqual([]);
  });

  it("applies the global model and effort, with per-kind variables winning", () => {
    const vars = env({
      STARLOG_MODEL: "claude-sonnet-5-5", STARLOG_EFFORT: "high",
      STARLOG_MODEL_TAROT_FULL: "claude-opus-5-5", STARLOG_EFFORT_DAILY: "low", STARLOG_EFFORT_SAJU_FULL: "medium",
    });
    expect(generationSetting("tarot-teaser", vars)).toEqual({ model: "claude-sonnet-5-5", effort: "high", maxTokens: 32000 });
    expect(generationSetting("tarot-reading", vars)).toEqual({ model: "claude-opus-5-5", effort: "high", maxTokens: 32000 });
    expect(generationSetting("tarot-daily", vars)).toEqual({ model: "claude-sonnet-5-5", effort: "low", maxTokens: 8000 });
    expect(generationSetting("saju-reading", vars)).toEqual({ model: "claude-sonnet-5-5", effort: "medium", maxTokens: 16000 });
    expect(generationSetting("followup", env({ STARLOG_EFFORT_FOLLOWUP: "xhigh" })).maxTokens).toBe(64000);
  });

  it("rejects models and efforts outside the allowed lists, naming the variable but not its value", () => {
    expect(() => generationSetting("tarot-reading", env({ STARLOG_MODEL: "claude-haiku-4-5" }))).toThrow(AiConfigError);
    expect(() => generationSetting("tarot-teaser", env({ STARLOG_EFFORT_TAROT_TEASER: "extreme" }))).toThrow(AiConfigError);
    const problems = aiConfigProblems(env({ STARLOG_MODEL_SAJU_FULL: "gpt-x", STARLOG_EFFORT: "ultra" }));
    expect(problems).toEqual(expect.arrayContaining([expect.stringContaining("STARLOG_MODEL_SAJU_FULL"), expect.stringContaining("STARLOG_EFFORT")]));
    expect(problems.join()).not.toMatch(/gpt-x|ultra/);
    // a per-kind variable only breaks its own kind
    expect(generationSetting("tarot-teaser", env({ STARLOG_MODEL_SAJU_FULL: "gpt-x" })).model).toBe("claude-opus-5-5");
  });
});

describe("request shape per model", () => {
  const task = (model: ModelId | undefined, effort: "low" | "medium" | "high") => ({
    name: "followup" as const, system: "system", user: "user", schema: FollowUpAnswerSchema, model, effort, maxTokens: 8000,
    mock: () => ({ kind: "clarify" as const, answer: "" }),
  });

  it.each([
    ["claude-opus-5-5", "medium"],
    ["claude-sonnet-5-5", "high"],
  ] as const)("%s at %s: adaptive thinking, explicit effort, structured output, cached system, default fallback", (model, effort) => {
    const body = buildRequest(task(model, effort), 16000);
    expect(body.model).toBe(model);
    expect(body.max_tokens).toBe(16000);
    expect(body.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(body.output_config.effort).toBe(effort);
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.betas).toEqual([FALLBACK_BETA]);
    expect(FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
    expect(body.fallbacks).toBe("default");
    expect(body.system[0]!.cache_control).toEqual({ type: "ephemeral" });
  });

  it("uses Opus 5.5 when a task names no model", () => {
    expect(buildRequest(task(undefined, "low"), 8000).model).toBe("claude-opus-5-5");
  });
});
