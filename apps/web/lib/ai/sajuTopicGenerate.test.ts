import { computeChart } from "@starlog/core";
import golden from "@content/eval/saju-topics/golden.json";
import { describe, expect, it, vi } from "vitest";
import type { SajuSituationId, SajuTopicId } from "@/lib/reading/types";
import { TOPIC_SECTIONS, topicLockedToc } from "@/lib/sajuTopics";
import { toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { KIND_ENV, generationSetting } from "./config";
import { generateSajuTopicFollowUp, generateSajuTopicReading, generateSajuTopicTeaser } from "./generate";
import { mockProvider } from "./mock";
import { mockSajuTopicFollowUp, mockSajuTopicReading, mockSajuTopicTeaser } from "./mockSajuTopics";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { SAJU_TOPIC_SYSTEM } from "./prompts/sajuTopicPrompts";
import { isSoftViolation } from "./style";
import { validateSajuTopicFollowUp, validateSajuTopicReading, validateSajuTopicTeaser } from "./validateSajuTopics";

const NOW = Date.parse(golden.evalNow);
const TOPICS: SajuTopicId[] = ["love", "reunion", "money", "career"];
const situations = golden.situations as Record<SajuTopicId, Record<string, SajuSituationId>>;
const hard = (violations: string[]) => violations.filter((v) => !isSoftViolation(v));
/** §8.4's chip hints: the chip shows in 2절 and the teaser, at most twice, with 결혼 for the 결혼 chip. */
const chipHints = (violations: string[]) => violations.filter((v) => /고른 상황|칩 문구|결혼을 생각 중/.test(v));
const factsOf = (id: string, topic: SajuTopicId) =>
  buildTopicFactSet(computeChart(toSajuInput(golden.charts.find((c) => c.id === id)!.birth as SajuForm)), NOW, topic, situations[topic][id]);
const CASES = golden.charts.flatMap((c) => TOPICS.map((topic) => [c.id, topic] as const));

describe("topic task names (spec §7.6)", () => {
  it("gives the topic teaser and reading their own settings, overridable by env", () => {
    const none = {} as NodeJS.ProcessEnv;
    expect(KIND_ENV["saju-topic-teaser"]).toBe("SAJU_TOPIC_TEASER");
    expect(KIND_ENV["saju-topic-reading"]).toBe("SAJU_TOPIC_FULL");
    expect(generationSetting("saju-topic-teaser", none)).toEqual({ model: "claude-opus-5-5", effort: "low", maxTokens: 8000 });
    expect(generationSetting("saju-topic-reading", none)).toEqual({ model: "claude-opus-5-5", effort: "medium", maxTokens: 16000 });
    expect(generationSetting("saju-topic-reading", { STARLOG_EFFORT_SAJU_TOPIC_FULL: "high" } as unknown as NodeJS.ProcessEnv).effort).toBe("high");
  });
});

describe("mock topic readings pass the topic validator for all 36 golden combinations (spec §12.0)", () => {
  it.each(CASES)("%s %s", (id, topic) => {
    const f = factsOf(id, topic);
    const question = "올해 무엇부터 해 보면 좋을까요?";
    const teaser = validateSajuTopicTeaser(mockSajuTopicTeaser(f), f);
    const reading = validateSajuTopicReading(mockSajuTopicReading(f), f);
    const answer = validateSajuTopicFollowUp(mockSajuTopicFollowUp(f, question), f, question);
    expect({ teaser: hard(teaser), reading: hard(reading), answer: hard(answer) }).toEqual({ teaser: [], reading: [], answer: [] });
    expect([...chipHints(teaser), ...chipHints(reading)]).toEqual([]);
  });
});

describe("generation with the mock provider", () => {
  it("adds what code owns: the topic's locked list, the topic and freshUntil", async () => {
    const f = factsOf("C1", "money");
    const spy = vi.spyOn(mockProvider, "generate");
    const { data } = await generateSajuTopicTeaser(mockProvider, f);
    expect(data).toMatchObject({ lockedToc: topicLockedToc("money"), topic: "money", freshUntil: "2026-11-01T03:00:00.000Z" });
    expect(spy.mock.calls[0]![0]).toMatchObject({ name: "saju-topic-teaser", system: SAJU_TOPIC_SYSTEM });
    spy.mockRestore();
  });

  it("writes the topic's headings over the model's", async () => {
    const f = factsOf("C3", "career");
    const { data } = await generateSajuTopicReading(mockProvider, f);
    expect(data.sections.map((s) => s.heading)).toEqual(TOPIC_SECTIONS.career);
    expect(data.observation.heading).toBe("앞으로 몇 주 · 확인해 볼 신호");
  });

  it("answers a follow-up as `followup` with the topic system prompt", async () => {
    const f = factsOf("C9", "reunion");
    const reading = (await generateSajuTopicReading(mockProvider, f)).data;
    const spy = vi.spyOn(mockProvider, "generate");
    const { data } = await generateSajuTopicFollowUp(mockProvider, f, reading, [], "마음 정리는 어디서부터 할까요?");
    expect(data.answer.length).toBeGreaterThan(100);
    expect(spy.mock.calls[0]![0]).toMatchObject({ name: "followup", system: SAJU_TOPIC_SYSTEM });
    spy.mockRestore();
  });
});

describe("the same mocks pass without a situation chip, as the app sends them (owner cut §0)", () => {
  it.each(CASES)("%s %s", (id, topic) => {
    const f = buildTopicFactSet(computeChart(toSajuInput(golden.charts.find((c) => c.id === id)!.birth as SajuForm)), NOW, topic);
    expect(f.situation).toBeUndefined();
    const question = "올해 무엇부터 해 보면 좋을까요?";
    const teaser = validateSajuTopicTeaser(mockSajuTopicTeaser(f), f);
    const reading = validateSajuTopicReading(mockSajuTopicReading(f), f);
    const answer = validateSajuTopicFollowUp(mockSajuTopicFollowUp(f, question), f, question);
    expect({ teaser: hard(teaser), reading: hard(reading), answer: hard(answer) }).toEqual({ teaser: [], reading: [], answer: [] });
  });
});
