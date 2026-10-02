import { DEFAULT_REVERSAL_RATE, TEMPLATES, TOPICS_BY_WHO, createDeck, pickCards, type Who } from "@starlog/core";
import { describe, expect, it, vi } from "vitest";
import { assembleDeep, generateDeepPart, generateDeepTeaser } from "./generatePremium";
import { mockProvider } from "./mock";
import { mockDeepPartA, mockDeepPartB, mockDeepTeaser } from "./mockPremium";
import { buildDeepContext, deepHeadings } from "./prompts/deepTarot";
import { validateDeepPartA, validateDeepPartB, validateDeepTeaser } from "./validatePremium";

const INPUT = {
  topicId: "money", whoId: "me" as const, whenId: "month" as const, question: "",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }, { label: "관심 방향", value: "지출 줄이기" }],
  note: "이번 달 카드값이 많이 나왔어요",
};
const contextFor = (seed: string) =>
  buildDeepContext(pickCards(createDeck(seed, DEFAULT_REVERSAL_RATE), TEMPLATES["deep-tarot"], [3, 14, 25, 36, 47, 58, 69, 70, 1, 12]), INPUT);
const hard = (violations: string[]) => violations.filter((v) => !v.startsWith("[문체]"));

/** Deterministic PRNG (mulberry32), so a failing draw can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOTES = ["", "이번 달 카드값이 많이 나왔어요", "요즘 잠을 잘 못 자요", "팀장님과 이야기해야 해요", "친구들과 여행을 준비 중이에요"];

/** A random topic (any who, the one-card daily topic aside), random chips, note, when and ten random picks. */
function randomContext(seed: number) {
  const r = rng(seed);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(r() * items.length)]!;
  const who = pick(["me", "us", "work", "group"] as Who[]);
  const topic = pick(TOPICS_BY_WHO[who].filter((t) => t.template !== "daily"));
  const when = pick(topic.whens ?? (["today", "week", "month", "year"] as const));
  const conditions = topic.conditions.filter(() => r() < 0.7).map((c) => ({ label: c.label, value: pick(c.options) }));
  const picks = new Set<number>();
  while (picks.size < 10) picks.add(Math.floor(r() * 78));
  const drawn = pickCards(createDeck(`random-${seed}`, DEFAULT_REVERSAL_RATE), TEMPLATES["deep-tarot"], [...picks]);
  return buildDeepContext(drawn, { topicId: topic.id, whoId: who, whenId: when, question: "", conditions, note: pick(NOTES) });
}

describe("deep tarot validators and mocks", () => {
  it("passes the mocks for many draws", () => {
    for (let i = 0; i < 25; i++) {
      const ctx = contextFor(`deep-${i}`);
      expect(hard(validateDeepTeaser(mockDeepTeaser(ctx), ctx)), `teaser ${i}`).toEqual([]);
      expect(hard(validateDeepPartA(mockDeepPartA(ctx), ctx)), `A ${i}`).toEqual([]);
      expect(hard(validateDeepPartB(mockDeepPartB(ctx), ctx)), `B ${i}`).toEqual([]);
    }
  });

  it("passes the mocks for random topics, chips, notes and draws", () => {
    for (let i = 0; i < 40; i++) {
      const ctx = randomContext(1000 + i);
      const label = `${i} ${ctx.who}/${ctx.topic?.id}`;
      expect(hard(validateDeepTeaser(mockDeepTeaser(ctx), ctx)), `teaser ${label}`).toEqual([]);
      expect(hard(validateDeepPartA(mockDeepPartA(ctx), ctx)), `A ${label}`).toEqual([]);
      expect(hard(validateDeepPartB(mockDeepPartB(ctx), ctx)), `B ${label}`).toEqual([]);
    }
  });

  it("catches the tradition's name, a model name, a swapped card and a crossing without its cards", () => {
    const ctx = contextFor("deep-bad");
    const a = mockDeepPartA(ctx);
    const swapped = { ...a, positions: [a.positions[1]!, a.positions[0]!, ...a.positions.slice(2)] };
    expect(validateDeepPartA(swapped, ctx).join(" ")).toContain("뽑힌 순서대로");
    const b = mockDeepPartB(ctx);
    expect(validateDeepPartB({ ...b, crossing: { body: `${"이 배치는 켈틱 크로스로 읽어요. ".repeat(14)}` } }, ctx).join(" ")).toMatch(/전통 배열|1번/);
    const named = { ...b, action: { body: `${b.action.body} Claude가 정리했어요.` } };
    expect(hard(validateDeepPartB(named, ctx)).length).toBeGreaterThan(0);
    const beta = { ...b, observation: { body: `${b.observation.body} 베타 기간이라 무료예요.` } };
    expect(validateDeepPartB(beta, ctx).join(" ")).toContain("베타");
  });

  it("generates the preview, both parts, and assembles a reading with code-owned headings", async () => {
    const ctx = contextFor("deep-gen");
    const preview = (await generateDeepTeaser(mockProvider, ctx)).data;
    expect(preview.cards).toHaveLength(10);
    expect(preview.lockedToc).toHaveLength(17);
    const a = (await generateDeepPart(mockProvider, ctx, 0, [])).data;
    const b = (await generateDeepPart(mockProvider, ctx, 1, [a])).data;
    const reading = assembleDeep(ctx, [a, b]);
    expect(reading.positions.map((p) => p.cardId)).toEqual(ctx.cards.map((c) => c.cardId));
    expect(reading.positions[0]!.heading).toBe(`지금의 나 · ${ctx.cards[0]!.name}`);
    expect(reading.crossing.heading).toBe(deepHeadings(ctx).crossing);
    expect(reading.followUps.length).toBeGreaterThan(0);
  });

  it("sends part B with the shared cards block and the earlier first sentences", async () => {
    const ctx = contextFor("deep-calls");
    const spy = vi.spyOn(mockProvider, "generate");
    const a = (await generateDeepPart(mockProvider, ctx, 0, [])).data;
    await generateDeepPart(mockProvider, ctx, 1, [a]);
    const [taskA] = spy.mock.calls[0]!;
    const [taskB] = spy.mock.calls[1]!;
    expect(taskA.shared).toBe(taskB.shared);
    expect(taskB.user).toContain("<earlier>");
    expect(taskA.name).toBe("deep-tarot-part");
    spy.mockRestore();
  });
});
