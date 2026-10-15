import { computeChart } from "@starlog/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { ENRICHMENT_BUDGET_MS, generateSajuReading } from "./generate";
import { mockProvider, mockSajuEnrichment, mockSajuMainReading } from "./mock";
import { buildFactSet } from "./prompts/saju";
import { GenerationError, type GenerationHooks, type GenerationTask, type ReadingProvider, type Usage } from "./provider";
import { sajuEnrichmentFallback } from "./sajuParts";

// Review of afd5498, B: 7절·8절 in their own call, started with the main one, with a code-built fallback.
const NOW = Date.parse("2026-10-08T12:00:00+09:00");
const DOBI: Partial<SajuForm> = { year: 1988, month: 8, day: 15, timeKnown: true, hour: 10, minute: 22 };
const facts = buildFactSet(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...DOBI })), NOW);
const usageOf = (outputTokens: number): Usage[] => [{ model: "claude-opus-5-5", inputTokens: 0, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 }];

type Answer = (task: GenerationTask<unknown>, attempt: number, hooks: GenerationHooks) => Promise<unknown>;

/** A provider answering each task with `answer`; the main call's halves bill 9,000 and 7,000 output tokens (owner 2026-10-16), the 7·8절 call 1,000. */
function stub(answer: Answer): ReadingProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name: "mock",
    calls,
    async generate<T>(task: GenerationTask<T>, attempt: number, _feedback?: string[], hooks: GenerationHooks = {}) {
      calls.push(`${task.name}#${attempt}`);
      const data = await answer(task as GenerationTask<unknown>, attempt, hooks);
      return { data: data as T, usage: usageOf(task.name === "saju-enrichment" ? 1_000 : task.name === "saju-reading-b" ? 7_000 : 9_000) };
    },
  };
}

/** Never answers; rejects as the SDK does when its signal aborts. */
const hang = (hooks: GenerationHooks, onAbort: () => void = () => {}) =>
  new Promise((_, reject) => hooks.signal?.addEventListener("abort", () => {
    onAbort();
    reject(new GenerationError("UPSTREAM", ["aborted"]));
  }));

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

/** What the 7·8절 call logged when it gave the code-built text: "status/reason". */
const fallbackLogs = () => vi.mocked(console.info).mock.calls
  .map(([line]) => String(line))
  .filter((line) => line.includes('"evt":"ai.enrichment"'))
  .map((line) => {
    const { status, reason } = JSON.parse(line) as { status: string; reason: string };
    return `${status}/${reason}`;
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("정통 사주 in two calls", () => {
  it("merges 1–6, 이름표 풀이, 기운 채우기 and 계산 기준 in that order under code-owned headings, with both calls' usage", async () => {
    const p = stub(async (task) => task.mock(1));
    const { data, usage, enrichment } = await generateSajuReading(p, facts);
    const main = mockSajuMainReading(facts);
    const extra = mockSajuEnrichment(facts);
    expect(data.sections.map((s) => s.heading)).toEqual([...SAJU_PROLOGUE_SECTIONS]);
    expect(data.sections.map((s) => s.body)).toEqual([...main.sections.slice(0, 6).map((s) => s.body), extra.nameplate, extra.gaeun, main.sections[6]!.body]);
    expect([data.observation, data.glance, data.followUps]).toEqual([main.observation, main.glance, main.followUps]);
    expect(usage.map((u) => u.outputTokens).sort((a, b) => a - b)).toEqual([1_000, 7_000, 9_000]);
    expect(p.calls.sort()).toEqual(["saju-enrichment#1", "saju-reading#1", "saju-reading-b#1"]);
    expect(enrichment).toBe("model");
  });

  it("starts every call before any one answers", async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const p = stub(async (task) => {
      started.push(task.name);
      await gate;
      return task.mock(1);
    });
    const pending = generateSajuReading(p, facts);
    await vi.waitFor(() => expect([...started].sort()).toEqual(["saju-enrichment", "saju-reading", "saju-reading-b"]));
    release();
    expect((await pending).data.sections).toHaveLength(9);
  });

  it("falls back to the code-built text when the 7·8절 call fails", async () => {
    const p = stub(async (task) => {
      if (task.name === "saju-enrichment") throw new GenerationError("UPSTREAM", ["APIError:529"]);
      return task.mock(1);
    });
    const { data, usage, enrichment } = await generateSajuReading(p, facts);
    const fallback = sajuEnrichmentFallback(facts);
    expect([data.sections[6]!.body, data.sections[7]!.body]).toEqual([fallback.nameplate, fallback.gaeun]);
    expect(enrichment).toBe("fallback");
    expect(usage.map((u) => u.outputTokens).sort((a, b) => a - b)).toEqual([7_000, 9_000]);
    expect(fallbackLogs()).toEqual(["fallback/UPSTREAM"]);
  });

  it("falls back when the 7·8절 draft stays invalid after its one retry", async () => {
    const p = stub(async (task) => (task.name === "saju-enrichment" ? { nameplate: "짧아요.", gaeun: "짧아요." } : task.mock(1)));
    const { data, enrichment } = await generateSajuReading(p, facts);
    expect(p.calls.filter((c) => c.startsWith("saju-enrichment"))).toEqual(["saju-enrichment#1", "saju-enrichment#2"]);
    expect(enrichment).toBe("fallback");
    expect(data.sections[6]!.body).toBe(sajuEnrichmentFallback(facts).nameplate);
    expect(fallbackLogs()).toEqual(["fallback/QUALITY"]);
  });

  it("cuts the 7·8절 call at its own budget and falls back, the main reading unharmed", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const p = stub((task, _attempt, hooks) => (task.name === "saju-enrichment" ? hang(hooks, () => (aborted = true)) : Promise.resolve(task.mock(1))));
    const pending = generateSajuReading(p, facts);
    await vi.advanceTimersByTimeAsync(ENRICHMENT_BUDGET_MS - 1_000);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    const { data, enrichment } = await pending;
    expect(aborted).toBe(true);
    expect(enrichment).toBe("fallback");
    expect(data.sections[7]!.body).toBe(sajuEnrichmentFallback(facts).gaeun);
    expect(ENRICHMENT_BUDGET_MS).toBe(90_000);
    // its own budget: not the route's abort, not an upstream error (review of v2, LOW)
    expect(fallbackLogs()).toEqual(["fallback/timeout"]);
  });

  it("fails as before when the main call fails, and stops the 7·8절 call", async () => {
    let enrichmentStopped = false;
    const p = stub((task, _attempt, hooks) => (task.name === "saju-reading" ? Promise.reject(new GenerationError("REFUSED")) : hang(hooks, () => (enrichmentStopped = true))));
    await expect(generateSajuReading(p, facts)).rejects.toMatchObject({ name: "GenerationError", code: "REFUSED" });
    expect(enrichmentStopped).toBe(true);
    await vi.waitFor(() => expect(fallbackLogs()).toEqual(["fallback/stopped"]));
  });

  it("stops every call when the route's signal aborts (client gone, route budget spent)", async () => {
    const route = new AbortController();
    const stopped: string[] = [];
    const p = stub((task, _attempt, hooks) => hang(hooks, () => stopped.push(task.name)));
    const pending = generateSajuReading(p, facts, { signal: route.signal });
    await vi.waitFor(() => expect(p.calls).toHaveLength(3));
    route.abort();
    await expect(pending).rejects.toMatchObject({ code: "UPSTREAM" });
    expect(stopped.sort()).toEqual(["saju-enrichment", "saju-reading", "saju-reading-b"]);
    expect(fallbackLogs()).toEqual(["fallback/aborted"]);
  });

  it("gives the 7·8절 call its own cost hooks (hooks.concurrent), never the main call's text or attempts", async () => {
    // the second half of the main call takes a ledger of its own too (owner 2026-10-16)
    const main: string[] = [];
    const side: string[] = [];
    const p = stub(async (task, _attempt, hooks) => {
      hooks.onReserve?.(usageOf(1));
      hooks.onUsage?.(usageOf(1));
      return task.mock(1);
    });
    await generateSajuReading(p, facts, {
      onReserve: () => main.push("reserve"),
      onUsage: () => main.push("bill"),
      concurrent: () => ({ onReserve: () => side.push("reserve"), onUsage: () => side.push("bill") }),
    });
    expect([main, side]).toEqual([["reserve", "bill"], ["reserve", "bill", "reserve", "bill"]]);
  });
});

describe("progress in reading order (hooks.onSection)", () => {
  /** Streams a task's mock JSON through onText in chunks, like the providers do, after `wait` ms. */
  const streaming = (wait: Record<string, number>) => stub(async (task, attempt, hooks) => {
    await new Promise((resolve) => setTimeout(resolve, wait[task.name] ?? 0));
    const data = task.mock(attempt);
    const text = JSON.stringify(data);
    for (let end = 60; end < text.length; end += 60) hooks.onText?.(text.slice(0, end));
    hooks.onText?.(text);
    return data;
  });
  const sections = ["sections#0", "sections#1", "sections#2", "sections#3", "sections#4", "sections#5"];
  // the screen's stages in reading order; the follow-up questions are one stage (owner 2026-10-16: the halves' events are told in order)
  const after = ["sections#6", "sections#7", "sections#8", "observation#0", "glance#0", "followUps#0"];

  it("names 7절·8절 just before 계산 기준 when their call is done by then, and the main's last section as the ninth", async () => {
    const events: string[] = [];
    await generateSajuReading(streaming({ "saju-enrichment": 0, "saju-reading": 20 }), facts, { onText: () => {}, onSection: (key, index) => events.push(`${key}#${index}`) });
    expect(events).toEqual([...sections, ...after]);
  });

  it("holds 계산 기준 and what follows until 7절·8절 are done, so the screen never passes them by", async () => {
    const events: string[] = [];
    await generateSajuReading(streaming({ "saju-enrichment": 40, "saju-reading": 0 }), facts, { onText: () => {}, onSection: (key, index) => events.push(`${key}#${index}`) });
    expect(events).toEqual([...sections, ...after]);
  });

  it("works with the mock provider the routes use", async () => {
    const events: string[] = [];
    const { data } = await generateSajuReading(mockProvider, facts, { onText: () => {}, onSection: (key, index) => events.push(`${key}#${index}`) });
    expect(events).toEqual([...sections, ...after]);
    expect(data.sections).toHaveLength(9);
  });
});
