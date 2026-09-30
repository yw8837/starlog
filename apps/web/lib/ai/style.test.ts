import sajuSample from "@content/samples/saju-prologue.ko.json";
import tarotSample from "@content/samples/tarot-contact.ko.json";
import { describe, expect, it } from "vitest";
import { SAJU_SYSTEM } from "./prompts/saju";
import { TAROT_SYSTEM } from "./prompts/tarot";
import { GenerationError, generateValidated, type ReadingProvider } from "./provider";
import { TarotTeaserDraftSchema } from "./schemas";
import { AI_TELL_THRESHOLD, STYLE_RULES, aiTellViolations, aiTells, isSoftViolation, softWarrantsRegeneration } from "./style";

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

  // Drafts say which attempt wrote them; `findings[attempt]` is what the validator reports for it.
  const QUOTE = "[문체] 같은 칩을 두 번 넘게 옮겼어요.";
  const MOVES = "[문체] 행동 제안이 비슷하게 되풀이돼요.";
  const AMOUNT = "[문체] 입력에 없는 금액을 썼어요.";
  const drafts = (second?: (attempt: number, signal?: AbortSignal) => Promise<void>) => {
    const calls: number[] = [];
    const provider: ReadingProvider = {
      name: "mock",
      async generate(_t, attempt, _feedback, hooks) {
        calls.push(attempt);
        if (attempt === 2 && second) await second(attempt, hooks?.signal);
        return { data: { cards: [], firstCard: { heading: "h", body: `draft-${attempt}` } } as never, usage: [] };
      },
    };
    return { provider, calls };
  };
  const findings = (byAttempt: Record<number, string[]>) => (d: { firstCard: { body: string } }) => byAttempt[Number(d.firstCard.body.slice(-1))] ?? [];

  it("returns a draft with one or two soft findings as it is, without a paid regeneration", async () => {
    const { provider, calls } = drafts();
    const result = await generateValidated(provider, task, findings({ 1: [QUOTE, MOVES] }));
    expect(calls).toEqual([1]);
    expect(result).toMatchObject({ attempts: 1, data: { firstCard: { body: "draft-1" } } });
  });

  it("regenerates for three distinct soft findings, and keeps the first draft when the second is unusable", async () => {
    const { provider, calls } = drafts();
    const result = await generateValidated(provider, task, findings({ 1: [QUOTE, MOVES, AMOUNT], 2: ["길이가 짧아요"] }));
    expect(calls).toEqual([1, 2]);
    expect(result.data.firstCard.body).toBe("draft-1");
  });

  it("returns the regeneration when it is usable", async () => {
    const { provider } = drafts();
    const result = await generateValidated(provider, task, findings({ 1: [soft], 2: [QUOTE] }));
    expect(result).toMatchObject({ attempts: 2, data: { firstCard: { body: "draft-2" } } });
  });

  it("keeps the first draft when the regeneration fails upstream or is refused", async () => {
    for (const code of ["UPSTREAM", "REFUSED"] as const) {
      const { provider } = drafts(async () => {
        throw new GenerationError(code);
      });
      const result = await generateValidated(provider, task, findings({ 1: [soft] }));
      expect(result.data.firstCard.body).toBe("draft-1");
    }
  });

  it("keeps the first draft when the budget aborts the regeneration", async () => {
    const controller = new AbortController();
    const { provider } = drafts((_attempt, signal) => new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(new GenerationError("UPSTREAM", ["aborted"])));
      controller.abort();
    }));
    const result = await generateValidated(provider, task, findings({ 1: [soft] }), { signal: controller.signal });
    expect(result.data.firstCard.body).toBe("draft-1");
  });

  it("skips a regeneration that cannot finish before the deadline: the soft draft is returned, a hard one fails at once", async () => {
    const soft3 = drafts();
    const kept = await generateValidated(soft3.provider, task, findings({ 1: [QUOTE, MOVES, AMOUNT] }), { deadline: Date.now() - 1 });
    expect(soft3.calls).toEqual([1]);
    expect(kept.data.firstCard.body).toBe("draft-1");

    const hard = drafts();
    const error = await generateValidated(hard.provider, task, findings({ 1: ["길이가 짧아요"] }), { deadline: Date.now() - 1 }).catch((e: unknown) => e);
    expect(hard.calls).toEqual([1]);
    expect(error).toMatchObject({ code: "QUALITY", detail: ["길이가 짧아요"] });
  });

  it("still regenerates a hard draft when there is time, and fails after two unusable drafts", async () => {
    const { provider, calls } = drafts();
    const error = await generateValidated(provider, task, findings({ 1: ["길이가 짧아요"], 2: ["길이가 짧아요", QUOTE] }), { deadline: Date.now() + 60_000 }).catch((e: unknown) => e);
    expect(calls).toEqual([1, 2]);
    expect(error).toMatchObject({ code: "QUALITY", detail: ["길이가 짧아요"] });
  });

  it("applies the ≥3 rule to soft findings: the AI-tell score alone, or three distinct soft checks", () => {
    expect(softWarrantsRegeneration([QUOTE, MOVES])).toBe(false);
    expect(softWarrantsRegeneration([QUOTE, MOVES, AMOUNT])).toBe(true);
    expect(softWarrantsRegeneration([soft])).toBe(true);
    expect(softWarrantsRegeneration(["길이가 짧아요"])).toBe(false);
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
