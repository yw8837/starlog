import { computeChart } from "@starlog/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { SAJU_MAIN_SECTIONS, SAJU_PART_A_SECTIONS, SAJU_PART_B_SECTIONS, SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { KIND_ENV, generationSetting } from "./config";
import { generateSajuReading } from "./generate";
import { mockProvider, mockSajuEnrichment, mockSajuMainReading, mockSajuReadingPartA, mockSajuReadingPartB } from "./mock";
import { SAJU_SYSTEM, buildFactSet, sajuReadingPrompt } from "./prompts/saju";
import { GenerationError, type GenerationHooks, type GenerationTask, type ReadingProvider, type Usage } from "./provider";
import { joinSajuHalves } from "./sajuParts";
import type { Section } from "./schemas";
import { isSoftViolation } from "./style";
import { validateSajuMainReading, validateSajuReadingPartA, validateSajuReadingPartB } from "./validate";

// Owner 2026-10-16: the main 정통 call (110–150 s, cut upstream past about 150 s) is written as two halves started together.
const NOW = Date.parse("2026-10-08T12:00:00+09:00");
const DOBI: Partial<SajuForm> = { year: 1988, month: 8, day: 15, timeKnown: true, hour: 10, minute: 22 };
const facts = buildFactSet(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...DOBI })), NOW);
const usageOf = (outputTokens: number): Usage[] => [{ model: "claude-opus-5-5", inputTokens: 0, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 }];
/** Output tokens billed per call: the first half 9,000, the second 7,000, 7절·8절 1,000. */
const BILLED: Record<string, number> = { "saju-reading": 9_000, "saju-reading-b": 7_000, "saju-enrichment": 1_000 };
const hard = (found: string[]) => found.filter((v) => !isSoftViolation(v));

type Answer = (task: GenerationTask<unknown>, attempt: number, hooks: GenerationHooks) => Promise<unknown>;

function stub(answer: Answer): ReadingProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name: "mock",
    calls,
    async generate<T>(task: GenerationTask<T>, attempt: number, _feedback?: string[], hooks: GenerationHooks = {}) {
      calls.push(`${task.name}#${attempt}`);
      const data = await answer(task as GenerationTask<unknown>, attempt, hooks);
      return { data: data as T, usage: usageOf(BILLED[task.name] ?? 0) };
    },
  };
}

/** Never answers; rejects as the SDK does when its signal aborts. */
const hang = (hooks: GenerationHooks, onAbort: () => void = () => {}) =>
  new Promise((_, reject) => hooks.signal?.addEventListener("abort", () => {
    onAbort();
    reject(new GenerationError("UPSTREAM", ["aborted"]));
  }));

const logs = (evt: string) => vi.mocked(console.info).mock.calls
  .map(([line]) => String(line))
  .filter((line) => line.includes(`"evt":"${evt}"`))
  .map((line) => JSON.parse(line) as Record<string, unknown>);

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the split", () => {
  it("gives the first half 1–3절 and 계산 기준, the second 4–6절, in reading order", () => {
    expect(SAJU_PART_A_SECTIONS).toEqual([SAJU_MAIN_SECTIONS[0], SAJU_MAIN_SECTIONS[1], SAJU_MAIN_SECTIONS[2], SAJU_MAIN_SECTIONS[6]]);
    expect(SAJU_PART_B_SECTIONS).toEqual([SAJU_MAIN_SECTIONS[3], SAJU_MAIN_SECTIONS[4], SAJU_MAIN_SECTIONS[5]]);
    expect(SAJU_PART_A_SECTIONS.at(-1)).toMatch(/^계산 기준 · /);
  });

  it("runs the second half as a task of its own (env suffix SAJU_FULL_B) at the main call's model and effort; saju-reading stays the first half", () => {
    expect(KIND_ENV["saju-reading"]).toBe("SAJU_FULL");
    expect(KIND_ENV["saju-reading-b"]).toBe("SAJU_FULL_B");
    const none = {} as NodeJS.ProcessEnv;
    expect(generationSetting("saju-reading-b", none)).toEqual(generationSetting("saju-reading", none));
    expect(generationSetting("saju-reading-b", none)).toEqual({ model: "claude-opus-5-5", effort: "medium", maxTokens: 16000 });
    expect(generationSetting("saju-reading-b", { STARLOG_EFFORT_SAJU_FULL_B: "high" } as unknown as NodeJS.ProcessEnv).effort).toBe("high");
  });
});

describe("the halves' prompts", () => {
  it("ask each half for its own headings and name the other half's, so neither writes them", () => {
    const a = sajuReadingPrompt(facts, "a");
    const b = sajuReadingPrompt(facts, "b");
    const numbered = (heading: string) => `${SAJU_MAIN_SECTIONS.indexOf(heading) + 1}. ${heading}`;
    expect(a).toContain("<task>reading-a</task>");
    expect(a).toContain(`<headings>\n${SAJU_PART_A_SECTIONS.map(numbered).join("\n")}\n</headings>`);
    expect(a).toContain(`<other_part>\n${SAJU_PART_B_SECTIONS.map(numbered).join("\n")}\nobservation: `);
    expect(a.slice(a.indexOf("<other_part>"))).toContain("glance: 한눈에 보기");
    expect(b).toContain("<task>reading-b</task>");
    expect(b).toContain(`<headings>\n${SAJU_PART_B_SECTIONS.map(numbered).join("\n")}\nobservation: `);
    expect(b).toContain(`<other_part>\n${SAJU_PART_A_SECTIONS.map(numbered).join("\n")}\nfollowUps`);
    // the same facts and user context in both
    for (const prompt of [a, b]) expect(prompt).toContain('"monthly"');
  });

  it("split the reading's caps between the halves in the shared system prompt: own scenes, forms and acts, and the once-a-reading lines in one half", () => {
    expect(SAJU_SYSTEM).toContain("앞부분(<task>reading-a</task>)");
    expect(SAJU_SYSTEM).toContain("뒷부분(<task>reading-b</task>)");
    expect(SAJU_SYSTEM).toMatch(/앞부분[^\n]*sections 4개[^\n]*1,200~1,850자/);
    expect(SAJU_SYSTEM).toMatch(/뒷부분[^\n]*sections 3개[^\n]*900~1,350자/);
    expect(SAJU_SYSTEM).toContain("몫에 없는 표현·문형은 한 부분 안에서 한 번만");
    // the basis rules as they were
    expect(SAJU_SYSTEM).toMatch(/\n {2}7\. 계산 기준: [^\n]*귀인은 일간을, 도화·역마·화개는 태어난 해와 날의 지지를 기준으로 찾았고, 이 기준은 유파마다 달라요/);
  });
});

describe("each half's own check", () => {
  const a = mockSajuReadingPartA(facts);
  const b = mockSajuReadingPartB(facts);

  it("passes the mock halves, and they join into the main mock that passes the whole reading's rules", () => {
    expect(validateSajuReadingPartA(a, facts)).toEqual([]);
    expect(validateSajuReadingPartB(b, facts)).toEqual([]);
    const joined = joinSajuHalves(a, b);
    expect(joined).toEqual(mockSajuMainReading(facts));
    expect(validateSajuMainReading(joined, facts)).toEqual([]);
  });

  it("counts each half's own sections and its own total", () => {
    expect(hard(validateSajuReadingPartA({ ...a, sections: a.sections.slice(0, 3) }, facts))).toContain("sections는 정확히 4개여야 해요.");
    expect(hard(validateSajuReadingPartB({ ...b, sections: [...b.sections, b.sections[0]!] }, facts))).toContain("sections는 정확히 3개여야 해요.");
    const short = (s: Section) => ({ ...s, body: s.body.slice(0, 160) });
    expect(hard(validateSajuReadingPartB({ ...b, sections: b.sections.map(short) }, facts)).join("\n")).toMatch(/이 부분의 분량이 공백 제외 \d+자예요\. 900~1,350자로 맞춰 주세요/);
  });

  it("checks the observation and the card in the second half only, the questions and 계산 기준 in the first only", () => {
    expect(hard(validateSajuReadingPartB({ ...b, observation: { ...b.observation, body: "짧아요." } }, facts)).join("\n")).toMatch(/observation/);
    expect(hard(validateSajuReadingPartB({ ...b, glance: { ...b.glance, thisYear: "올해는 바빠요." } }, facts)).join("\n")).toMatch(/올해 세운의 간지/);
    expect(hard(validateSajuReadingPartA({ ...a, followUps: [] }, facts))).toContain("followUps는 30자 이하 질문 2개로 써 주세요.");
    // the second half has no 계산 기준: its last section is a body section (1–2 bold phrases), never read as the basis
    expect(validateSajuReadingPartB(b, facts).some((v) => v.includes("계산 기준"))).toBe(false);
  });

  it("keeps the halves' totals inside the whole's band, so the merge cannot fail a total the halves passed", () => {
    const filled = (sections: Section[], each: number) => sections.map((s) => ({ ...s, body: `${"가".repeat(each - 3)}해요.` }));
    // each half at the top of its band (with the ±25%), then both at the bottom
    for (const [ea, eb] of [[578, 562], [225, 225]] as const) {
      const ha = { ...a, sections: filled(a.sections, ea) };
      const hb = { ...b, sections: filled(b.sections, eb) };
      expect(validateSajuReadingPartA(ha, facts).some((v) => v.includes("이 부분의 분량"))).toBe(false);
      expect(validateSajuReadingPartB(hb, facts).some((v) => v.includes("이 부분의 분량"))).toBe(false);
      expect(validateSajuMainReading(joinSajuHalves(ha, hb), facts).some((v) => v.includes("프롤로그 분량"))).toBe(false);
    }
  });
});

describe("generateSajuReading in three calls", () => {
  it("starts both halves and 7절·8절 before any of them answers", async () => {
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

  it("merges 1–3 and 계산 기준 from the first half, 4–6, the observation and the card from the second, with every call's usage", async () => {
    const p = stub(async (task) => task.mock(1));
    const { data, usage } = await generateSajuReading(p, facts);
    const a = mockSajuReadingPartA(facts);
    const b = mockSajuReadingPartB(facts);
    const extra = mockSajuEnrichment(facts);
    expect(data.sections.map((s) => s.heading)).toEqual([...SAJU_PROLOGUE_SECTIONS]);
    expect(data.sections.map((s) => s.body)).toEqual([
      ...a.sections.slice(0, 3).map((s) => s.body), ...b.sections.map((s) => s.body), extra.nameplate, extra.gaeun, a.sections[3]!.body,
    ]);
    expect([data.observation, data.glance, data.followUps]).toEqual([b.observation, b.glance, a.followUps]);
    expect(usage.map((u) => u.outputTokens).sort((x, y) => x - y)).toEqual([1_000, 7_000, 9_000]);
    expect(p.calls.sort()).toEqual(["saju-enrichment#1", "saju-reading#1", "saju-reading-b#1"]);
  });

  it("regenerates a half for its own findings only", async () => {
    const b = mockSajuReadingPartB(facts);
    const p = stub(async (task, attempt) => (task.name === "saju-reading-b" && attempt === 1 ? { ...b, sections: b.sections.slice(0, 2) } : task.mock(attempt)));
    const { data } = await generateSajuReading(p, facts);
    expect(p.calls.sort()).toEqual(["saju-enrichment#1", "saju-reading#1", "saju-reading-b#1", "saju-reading-b#2"]);
    expect(data.sections[5]!.body).toBe(b.sections[2]!.body);
  });

  it("fails as before when the first half fails, and stops the second half and 7절·8절", async () => {
    const stopped: string[] = [];
    const p = stub((task, _attempt, hooks) => (task.name === "saju-reading" ? Promise.reject(new GenerationError("REFUSED")) : hang(hooks, () => stopped.push(task.name))));
    await expect(generateSajuReading(p, facts)).rejects.toMatchObject({ name: "GenerationError", code: "REFUSED" });
    await vi.waitFor(() => expect(stopped.sort()).toEqual(["saju-enrichment", "saju-reading-b"]));
  });

  it("fails with the second half's own error when it fails, and stops the first half and 7절·8절", async () => {
    const stopped: string[] = [];
    const p = stub((task, _attempt, hooks) => (task.name === "saju-reading-b" ? Promise.reject(new GenerationError("UPSTREAM", ["APIError:529"])) : hang(hooks, () => stopped.push(task.name))));
    await expect(generateSajuReading(p, facts)).rejects.toMatchObject({ code: "UPSTREAM", detail: ["APIError:529"] });
    await vi.waitFor(() => expect(stopped.sort()).toEqual(["saju-enrichment", "saju-reading"]));
  });

  it("stops all three calls when the route's signal aborts", async () => {
    const route = new AbortController();
    const stopped: string[] = [];
    const p = stub((task, _attempt, hooks) => hang(hooks, () => stopped.push(task.name)));
    const pending = generateSajuReading(p, facts, { signal: route.signal });
    await vi.waitFor(() => expect(p.calls).toHaveLength(3));
    route.abort();
    await expect(pending).rejects.toMatchObject({ code: "UPSTREAM" });
    expect(stopped.sort()).toEqual(["saju-enrichment", "saju-reading", "saju-reading-b"]);
  });

  it("bills the second half to a cost ledger of its own (hooks.concurrent), as 7절·8절, and the first half to the route's", async () => {
    const main: string[] = [];
    const ledgers: string[][] = [];
    const p = stub(async (task, _attempt, hooks) => {
      hooks.onReserve?.(usageOf(1));
      hooks.onUsage?.(usageOf(BILLED[task.name]!));
      return task.mock(1);
    });
    await generateSajuReading(p, facts, {
      onReserve: () => main.push("reserve"),
      onUsage: (u) => main.push(`bill ${u[0]!.outputTokens}`),
      concurrent: () => {
        const ledger: string[] = [];
        ledgers.push(ledger);
        return { onReserve: () => ledger.push("reserve"), onUsage: (u) => ledger.push(`bill ${u[0]!.outputTokens}`) };
      },
    });
    expect(main).toEqual(["reserve", "bill 9000"]);
    expect(ledgers.map((l) => l.join()).sort()).toEqual(["reserve,bill 1000", "reserve,bill 7000"]);
  });

  it("logs what only the merged reading shows (counts, never text) and still returns it", async () => {
    // each half says "셈이죠" twice (within its own cap of three), the merged reading four times
    const twice = (sections: Section[]) => sections.map((s, i) => (i < 2 ? { ...s, body: `${s.body} 늘 그런 셈이죠.` } : s));
    const p = stub(async (task, attempt) => {
      const draft = task.mock(attempt) as { sections: Section[] };
      return task.name === "saju-enrichment" ? draft : { ...draft, sections: twice(draft.sections) };
    });
    const { data } = await generateSajuReading(p, facts);
    expect(data.sections).toHaveLength(9);
    expect(p.calls.sort()).toEqual(["saju-enrichment#1", "saju-reading#1", "saju-reading-b#1"]);
    const [merged, ...more] = logs("ai.merged");
    expect(more).toEqual([]);
    expect(merged).toMatchObject({ task: "saju-reading", hard: 0, voice: 1 });
    expect(JSON.stringify(merged)).not.toContain("셈이죠");
  });

  it("logs nothing for a merged reading with no finding", async () => {
    await generateSajuReading(stub(async (task) => task.mock(1)), facts);
    expect(logs("ai.merged")).toEqual([]);
  });
});

describe("progress in reading order across the halves (hooks.onSection)", () => {
  /** Streams a task's mock JSON through onText in chunks, after `wait` ms. */
  const streaming = (wait: Record<string, number>) => stub(async (task, attempt, hooks) => {
    await new Promise((resolve) => setTimeout(resolve, wait[task.name] ?? 0));
    const data = task.mock(attempt);
    const text = JSON.stringify(data);
    for (let end = 60; end < text.length; end += 60) hooks.onText?.(text.slice(0, end));
    hooks.onText?.(text);
    return data;
  });
  const ORDER = [...SAJU_PROLOGUE_SECTIONS.map((_, i) => `sections#${i}`), "observation#0", "glance#0", "followUps#0"];
  const run = async (provider: ReadingProvider) => {
    const events: string[] = [];
    await generateSajuReading(provider, facts, { onText: () => {}, onSection: (key, index) => events.push(`${key}#${index}`) });
    return events;
  };

  it("tells every stage once, in reading order, when the second half streams first", async () => {
    expect(await run(streaming({ "saju-reading-b": 0, "saju-enrichment": 0, "saju-reading": 30 }))).toEqual(ORDER);
  });

  it("tells every stage once, in reading order, when the first half streams first", async () => {
    expect(await run(streaming({ "saju-reading": 0, "saju-enrichment": 10, "saju-reading-b": 40 }))).toEqual(ORDER);
  });

  it("tells 1–3절 while the first half writes them, before the second half is heard from", async () => {
    let releaseB!: () => void;
    const holdB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    const events: string[] = [];
    const p = stub(async (task, attempt, hooks) => {
      const data = task.mock(attempt);
      const text = JSON.stringify(data);
      if (task.name === "saju-reading-b") {
        hooks.onText?.(text.slice(0, 30)); // its first section has started
        await holdB;
      }
      for (let end = 60; end < text.length; end += 60) hooks.onText?.(text.slice(0, end));
      hooks.onText?.(text);
      return data;
    });
    const pending = generateSajuReading(p, facts, { onText: () => {}, onSection: (key, index) => events.push(`${key}#${index}`) });
    await vi.waitFor(() => expect(events).toContain("sections#3"));
    // the first half moved past 3절, so 4절 (the second half's first) may be told; nothing after it yet
    expect(events).toEqual(["sections#0", "sections#1", "sections#2", "sections#3"]);
    releaseB();
    await pending;
    expect(events).toEqual(ORDER);
  });

  it("works with the mock provider the routes use", async () => {
    expect(await run(mockProvider)).toEqual(ORDER);
  });
});
