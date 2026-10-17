import { describe, expect, it } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import type { GenerationTask, ReadingProvider } from "@/lib/ai/provider";
import type { Gate } from "@/lib/api/http";
import { kbCard } from "@/lib/kb";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { chapterIdOf, type ChapterContext } from "@/lib/security/chapterToken";
import { issueDraw } from "@/lib/security/drawToken";
import { MATCH_ADAPTER } from "./adapters";
import { preparePremiumFollowUp } from "./followup";
import { DeepTarotBody, MatchBody } from "./inputs";
import { PREMIUM_CHAPTER_TTL_MS } from "./products";
import { runNextPart } from "./run";

/**
 * Owner 2026-10-17: the 궁합's five cards are read in the deck the user sees, like 켈틱 크로스 10장 (the Starlog deck by
 * default, the 1909 scans when chosen in 내 정보). The request carries it, the card pictures the model quotes come from it,
 * and the record and its chapter token keep it. A request or token without one (an older tab, an older chapter) is read
 * in the 1909 pictures it was written for.
 */

const SECRET = "match-deck-test-secret-0123456789abcdef";
const NOW = Date.parse("2026-11-20T12:00:00+09:00");
const PAIR = {
  me: { birth: DEFAULT_SAJU_FORM },
  partner: { birth: { ...DEFAULT_SAJU_FORM, year: 1992, month: 2, day: 26, gender: "male" }, label: "준호" },
  relation: "lover", concern: "요즘 대화가 줄었어요", ack: true,
};
const DEEP_INPUT = { topicId: "love", whoId: "me", whenId: "month", question: "", conditions: [], note: "" };

function recording() {
  const tasks: Array<GenerationTask<unknown>> = [];
  const provider: ReadingProvider = {
    name: "mock",
    generate(task, attempt, feedback, hooks) {
      tasks.push(task as GenerationTask<unknown>);
      return mockProvider.generate(task, attempt, feedback, hooks);
    },
  };
  return { provider, tasks };
}

const gateOf = (provider: ReadingProvider): Gate => ({ secret: SECRET, provider, owner: false, now: NOW, cookies: {}, client: "test" });
const pictures = (cardId: string) => {
  const kb = kbCard(cardId);
  return { rws1909: kb.imagery.facts, starlog: kb.imagery.decks!.starlog!.facts };
};
/** The picture facts each card of a <cards> block carries (its imageryFacts), by card id. */
function quoted(prompt: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [, cardId, brief] of prompt.matchAll(/· cardId (\S+)\n(\{.*\})/g)) {
    out[cardId!] = (JSON.parse(brief!) as { imageryFacts: Array<{ fact: string }> }).imageryFacts.map((f) => f.fact);
  }
  return out;
}
const expected = (cardIds: string[], deck: "rws1909" | "starlog") => Object.fromEntries(cardIds.map((id) => [id, pictures(id)[deck].map((f) => f.ko)]));

/** The 궁합 written through, as the routes run it: preview, both parts, the account's copy, the token and one follow-up. */
async function writeThrough(raw: Record<string, unknown>) {
  const { provider, tasks } = recording();
  const body = MATCH_ADAPTER.teaserBody.parse(raw);
  const ctx = await MATCH_ADAPTER.context(body, gateOf(provider));
  if (ctx instanceof Response) throw new Error(`context ${ctx.status}`);
  let done: unknown[] = [];
  let reading: unknown = null;
  while (!reading) {
    const step = await runNextPart(provider, ctx, done);
    if (step.complete) reading = step.reading;
    else done = step.parts;
  }
  const chapterId = await chapterIdOf(reading, NOW + PREMIUM_CHAPTER_TTL_MS);
  const token = (await MATCH_ADAPTER.chapterContext(body, ctx, SECRET, chapterId)) as Extract<ChapterContext, { kind: "match" }>;
  const saved = MATCH_ADAPTER.chapter(body, ctx, { reading, chapterToken: "t" }, NOW);
  const followUp = async (chapter: Extract<ChapterContext, { kind: "match" }>) => {
    const asked = recording();
    const prepared = await preparePremiumFollowUp(chapter, reading, NOW, SECRET, chapterId);
    if (prepared instanceof Response) throw new Error(`follow-up ${prepared.status}`);
    await prepared.generate(asked.provider, [], "가장 먼저 해 볼 일은 뭘까요?");
    return asked.tasks[0]!.user;
  };
  const cardsPart = tasks.find((t) => t.name === "match-part" && (t.shared ?? "").includes("<cards>"))!;
  return { ctx, token, saved, followUp, cardsPrompt: cardsPart.shared ?? "", cardIds: ctx.match.cards.cards.map((c) => c.cardId) };
}

describe("the 궁합's card design (owner 2026-10-17)", () => {
  it("takes the card design the 켈틱 크로스 input takes: starlog or rws1909, none from an older tab, nothing else", async () => {
    const { drawToken } = await issueDraw("match", [0, 1, 2, 3, 4], SECRET, NOW);
    expect(MatchBody.parse({ ...PAIR, drawToken, deck: "starlog" }).deck).toBe("starlog");
    expect(MatchBody.parse({ ...PAIR, drawToken, deck: "rws1909" }).deck).toBe("rws1909");
    expect("deck" in MatchBody.parse({ ...PAIR, drawToken })).toBe(false);
    for (const deck of ["starlog", "rws1909", "1909", "Starlog", "", 1, null]) {
      const deep = DeepTarotBody.safeParse({ drawToken, input: { ...DEEP_INPUT, deck } }).success;
      expect([deck, MatchBody.safeParse({ ...PAIR, drawToken, deck }).success]).toEqual([deck, deep]);
    }
  });

  it("writes the five cards from the Starlog pictures the user sees, keeps the design in the account's copy and the token, and answers follow-ups from it", async () => {
    const { drawToken } = await issueDraw("match", [0, 1, 2, 3, 4], SECRET, NOW);
    const { ctx, token, saved, followUp, cardsPrompt, cardIds } = await writeThrough({ ...PAIR, drawToken, deck: "starlog" });
    for (const card of ctx.match.cards.cards) expect(card.kb.imagery.facts, card.cardId).toEqual(pictures(card.cardId).starlog);
    expect(cardIds).toHaveLength(5);
    expect(quoted(cardsPrompt)).toEqual(expected(cardIds, "starlog"));
    expect(quoted(await followUp(token))).toEqual(expected(cardIds, "starlog"));
    expect(saved).toMatchObject({ kind: "match", deck: "starlog" });
    expect(token.deck).toBe("starlog");
  });

  it("reads the 1909 scans when the user chose them", async () => {
    const { drawToken } = await issueDraw("match", [0, 1, 2, 3, 4], SECRET, NOW);
    const { ctx, token, saved } = await writeThrough({ ...PAIR, drawToken, deck: "rws1909" });
    for (const card of ctx.match.cards.cards) expect(card.kb.imagery.facts, card.cardId).toEqual(pictures(card.cardId).rws1909);
    expect([saved.deck, token.deck]).toEqual(["rws1909", "rws1909"]);
  });

  it("reads a request from an older tab and a chapter token from before (no design) in the 1909 pictures they were written for", async () => {
    const { drawToken } = await issueDraw("match", [0, 1, 2, 3, 4], SECRET, NOW);
    const { ctx, token, saved, followUp, cardIds } = await writeThrough({ ...PAIR, drawToken });
    for (const card of ctx.match.cards.cards) expect(card.kb.imagery.facts, card.cardId).toEqual(pictures(card.cardId).rws1909);
    expect(saved).not.toHaveProperty("deck");
    expect(token).not.toHaveProperty("deck");
    expect(quoted(await followUp(token))).toEqual(expected(cardIds, "rws1909"));
  });
});
