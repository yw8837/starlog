import sajuSample from "@content/samples/saju-prologue.ko.json";
import tarotSample from "@content/samples/tarot-contact.ko.json";
import { describe, expect, it } from "vitest";
import { SAJU_SYSTEM } from "./prompts/saju";
import { TAROT_SYSTEM } from "./prompts/tarot";
import { GenerationError, generateValidated, type ReadingProvider } from "./provider";
import { TarotTeaserDraftSchema } from "./schemas";
import { AI_TELL_THRESHOLD, STYLE_RULES, aiTellViolations, aiTells, isSoftViolation } from "./style";

/** Built from the style rules' "나쁜 예" lines plus the other tells they name. */
const SLOPPY = [
  "결론적으로, 은둔자 카드는 당신이 내면의 목소리에 귀 기울여야 할 때임을 시사해요.",
  "이번 주는 재정적 측면에서 매우 중요한 시기이며, 신중한 접근이 필요할 것으로 보여요.",
  "또한 혁신적인 변화가 기회일 수도 있을 것 같아요.",
  "게다가 지금은 혼란에서 안정으로 나아가요.",
  "새로운 장을 시작할 때예요.",
].join(" ");

const tarotGoldTexts = [
  tarotSample.paid.verdict, ...tarotSample.paid.cards.map((c) => c.body), tarotSample.paid.connection.body, tarotSample.paid.timing.body,
  ...tarotSample.paid.scenarios.items.flatMap((i) => [i.label, i.body]), ...tarotSample.paid.messages.items, tarotSample.paid.messages.hint,
  ...tarotSample.paid.avoid.items, tarotSample.paid.alternatives.body, tarotSample.paid.action.body, tarotSample.story.body,
];

describe("AI-tell score", () => {
  it("scores the gold samples below the threshold", () => {
    expect(aiTells(tarotGoldTexts.join("\n")).length).toBeLessThan(AI_TELL_THRESHOLD);
    expect(aiTells(tarotSample.free.firstCard.body).length).toBeLessThan(AI_TELL_THRESHOLD);
    expect(aiTells([...sajuSample.paid.sections.map((s) => s.body), sajuSample.story.body].join("\n")).length).toBeLessThan(AI_TELL_THRESHOLD);
    expect(aiTells(sajuSample.free.summary).length).toBeLessThan(AI_TELL_THRESHOLD);
  });

  it("scores a sloppy paragraph at or above the threshold and lists each hit with a fix hint", () => {
    const hits = aiTells(SLOPPY);
    expect(hits.length).toBeGreaterThanOrEqual(AI_TELL_THRESHOLD);
    expect(hits.map((h) => h.id)).toEqual(expect.arrayContaining(["D1", "D2", "D4", "D6", "D7", "G", "H"]));
    const out: string[] = [];
    aiTellViolations([SLOPPY], out);
    expect(out).toHaveLength(1);
    expect(isSoftViolation(out[0]!)).toBe(true);
    for (const hit of hits) expect(out[0]).toContain(`${hit.id} ${hit.label}: ${hit.hint}`);
  });

  it("does not count JSON-list items or quoted user words as formatting", () => {
    expect(aiTells(tarotSample.paid.messages.items.join("\n")).map((h) => h.id)).not.toContain("C");
    expect(aiTells("'가볍게 안부'라고 골랐죠. 짧은 안부 한 줄이면 충분해요.")).toEqual([]);
    expect(aiTells("- 첫째 할 일\n- 둘째 할 일").map((h) => h.id)).toContain("C");
  });

  it("counts two soft hits as nothing", () => {
    const out: string[] = [];
    aiTellViolations(["결론적으로 이번 주는 매우 중요해요."], out);
    expect(out).toEqual([]);
  });
});

describe("soft violations in generateValidated", () => {
  const task = {
    name: "tarot-teaser" as const, system: "s", user: "u", schema: TarotTeaserDraftSchema, effort: "low" as const, maxTokens: 10,
    mock: () => ({ cards: [], firstCard: { heading: "h", body: "b" } }),
  };
  const soft = "[문체] AI가 쓴 티가 나는 문장이 있어요.";

  it("regenerates once for style hits and then accepts a draft that still has only style hits", async () => {
    let calls = 0;
    const provider: ReadingProvider = { name: "mock", async generate(t) { calls++; return { data: t.mock(1) as never, usage: [] }; } };
    const result = await generateValidated(provider, task, () => [soft]);
    expect(calls).toBe(2);
    expect(result.attempts).toBe(2);
  });

  it("still fails on hard violations, without the style hints in the error", async () => {
    const provider: ReadingProvider = { name: "mock", async generate(t) { return { data: t.mock(1) as never, usage: [] }; } };
    const error = await generateValidated(provider, task, () => ["길이가 짧아요", soft]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationError);
    expect((error as GenerationError).detail).toEqual(["길이가 짧아요"]);
  });
});

describe("문체 규칙 in the cached system prompts", () => {
  it("is part of both system prompts, with exactly two good/bad pairs and nothing volatile", () => {
    for (const system of [TAROT_SYSTEM, SAJU_SYSTEM]) {
      expect(system).toContain(STYLE_RULES);
      expect(system).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
    expect(STYLE_RULES.match(/나쁜 예:/g)).toHaveLength(2);
    expect(STYLE_RULES.match(/좋은 예:/g)).toHaveLength(2);
    expect(STYLE_RULES).toContain("JSON 배열 항목");
    expect(STYLE_RULES).toContain("따옴표는 사용자가 쓴 말이나 보낼 문장 예시를 옮길 때만");
  });
});
