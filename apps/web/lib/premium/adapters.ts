import "server-only";
import type { Orientation, SajuChart } from "@starlog/core";
import type { z } from "zod";
import { generateDeepTeaser, generateMatchTeaser, generateNewYearTeaser } from "@/lib/ai/generatePremium";
import { buildDeepContext } from "@/lib/ai/prompts/deepTarot";
import { RELATION_KO, buildMatchFacts, matchCardsContext } from "@/lib/ai/prompts/match";
import { buildNewYearFacts } from "@/lib/ai/prompts/newyear";
import { cleanUserText, resolveTopic, type TarotContext } from "@/lib/ai/prompts/tarot";
import type { GenerationHooks, ReadingProvider } from "@/lib/ai/provider";
import { errorResponse, type Gate } from "@/lib/api/http";
import { CUSTOM_TOPIC_ID, type BirthInput, type TarotInputData } from "@/lib/api/inputs";
import { profileOf } from "@/lib/api/sajuRequest";
import { premiumChapter } from "@/lib/readings/chapters";
import type { ServerChapter } from "@/lib/readings/store";
import { checkSajuForm, todayInKorea } from "@/lib/sajuForm";
import type { ChapterContext } from "@/lib/security/chapterToken";
import { openDraw } from "@/lib/security/drawToken";
import {
  DeepTarotBody, DeepTarotReadingBody, MatchBody, MatchReadingBody, NewYearBody, NewYearReadingBody,
  type DeepTarotBodyData, type MatchBodyData, type NewYearBodyData,
} from "./inputs";
import type { PremiumContext } from "./run";

/** Per product: how a body becomes a context, what is crisis-checked, previewed, tokenised and saved. */
export interface Adapter<B, C extends PremiumContext> {
  id: C["product"];
  teaserBody: z.ZodType<B>;
  readingBody: z.ZodType<B & { unlock: { method: "paid" | "owner" }; resume?: string }>;
  /** every string the user wrote (spec §9: the partner's label included) */
  crisisTexts(body: B): Array<string | undefined>;
  context(body: B, gate: Gate): Promise<C | Response>;
  teaser(provider: ReadingProvider, ctx: C, hooks?: GenerationHooks): Promise<unknown>;
  chapterContext(body: B, ctx: C): ChapterContext;
  chapter(body: B, ctx: C, response: { reading: unknown; chapterToken: string }, now: number): ServerChapter;
}

type ContextOf<P extends PremiumContext["product"]> = Extract<PremiumContext, { product: P }>;

const cardsOf = (tarot: TarotContext): Array<[string, Orientation]> => tarot.cards.map((c) => [c.cardId, c.orientation]);
const drawnOf = (tarot: TarotContext) => tarot.cards.map(({ position, cardId, orientation }) => ({ position, cardId, orientation }));

/** The chart the server computes from a birth, or the 400 naming its field (`me.date`, `partner.time`, `birth.date`, …). */
function chartOf(birth: BirthInput, field: string, now: number): SajuChart | Response {
  const checked = checkSajuForm(birth, todayInKorea(new Date(now)));
  return "error" in checked ? errorResponse("BAD_REQUEST", { field: `${field}.${checked.error.field}`, message: checked.error.message }) : checked.chart;
}

// ---- 심층 타로 ----

/** As the prompt and the chapter see it: a typed topic cleaned, a catalog topic without typed text (lib/api/tarotRequest.ts). */
function deepInput(body: DeepTarotBodyData): Omit<TarotInputData, "history"> {
  const { topicText: raw, ...rest } = body.input;
  return rest.topicId === CUSTOM_TOPIC_ID ? { ...rest, topicText: cleanUserText(raw ?? "") } : rest;
}

export const DEEP_ADAPTER: Adapter<DeepTarotBodyData, ContextOf<"tarot-deep">> = {
  id: "tarot-deep",
  teaserBody: DeepTarotBody,
  readingBody: DeepTarotReadingBody,
  crisisTexts: ({ input: i }) => [i.question, i.note, i.topicText, i.whoText, i.whenText, ...i.conditions.flatMap((c) => [c.label, c.value])],
  async context(b, gate) {
    const draw = await openDraw(b.drawToken, gate.secret, gate.now);
    if (!draw || draw.templateId !== "deep-tarot") return errorResponse("BAD_TOKEN", { token: "draw" });
    const input = deepInput(b);
    // The one-card daily topic has its own page; the ten-card spread reads every other topic.
    if (input.topicId === "daily") return errorResponse("BAD_REQUEST");
    const known = input.topicId === CUSTOM_TOPIC_ID ? Boolean(input.topicText && input.whoId) : resolveTopic("deep-tarot", input.topicId, input.whoId) !== null;
    if (!known) return errorResponse("BAD_REQUEST");
    return { product: "tarot-deep", tarot: buildDeepContext(draw.cards, input) };
  },
  teaser: async (provider, ctx, hooks) => (await generateDeepTeaser(provider, ctx.tarot, hooks)).data,
  chapterContext: (b, ctx) => ({ kind: "tarot-deep", input: deepInput(b), cards: cardsOf(ctx.tarot) }),
  chapter: (b, ctx, response, now) =>
    premiumChapter("tarot-deep", {
      question: ctx.tarot.question,
      conditions: b.input.conditions.map(({ label, value }) => ({ label, value })),
      note: (b.input.note ?? "").trim(),
      cards: drawnOf(ctx.tarot),
      // The design the reading quotes (absent: the 1909 scans), so a record synced to another device shows it.
      ...(b.input.deck ? { deck: b.input.deck } : {}),
    }, response, now),
};

// ---- 우리 사이 궁합 ----

export const MATCH_ADAPTER: Adapter<MatchBodyData, ContextOf<"match">> = {
  id: "match",
  teaserBody: MatchBody,
  readingBody: MatchReadingBody,
  crisisTexts: (b) => [b.concern, b.partner.label],
  async context(b, gate) {
    const me = chartOf(b.me.birth, "me", gate.now);
    if (me instanceof Response) return me;
    const partner = chartOf(b.partner.birth, "partner", gate.now);
    if (partner instanceof Response) return partner;
    const draw = await openDraw(b.drawToken, gate.secret, gate.now);
    if (!draw || draw.templateId !== "match") return errorResponse("BAD_TOKEN", { token: "draw" });
    const facts = buildMatchFacts(me, partner, {
      relation: b.relation,
      label: cleanUserText(b.partner.label ?? ""),
      concern: cleanUserText(b.concern ?? ""),
      meProfile: profileOf(b.me),
    }, gate.now);
    return { product: "match", match: { facts, cards: matchCardsContext(b.relation, draw.cards) } };
  },
  teaser: async (provider, ctx, hooks) => (await generateMatchTeaser(provider, ctx.match, hooks)).data,
  chapterContext(b, ctx) {
    const { label, concern } = ctx.match.facts;
    const profile = profileOf(b.me);
    return {
      kind: "match",
      me: { birth: b.me.birth, ...(profile ? { profile } : {}) },
      partner: { birth: b.partner.birth, ...(label ? { label } : {}) },
      relation: b.relation,
      ...(concern ? { concern } : {}),
      cards: cardsOf(ctx.match.cards),
    };
  },
  chapter(b, ctx, response, now) {
    const { label, concern } = ctx.match.facts;
    return premiumChapter("match", {
      relation: b.relation,
      relationLabel: RELATION_KO[b.relation],
      ...(label ? { partnerLabel: label } : {}),
      me: { birth: b.me.birth },
      partner: { birth: b.partner.birth },
      ...(concern ? { concern } : {}),
      cards: drawnOf(ctx.match.cards),
    }, response, now);
  },
};

// ---- 2027 신년운세 ----

export const NEWYEAR_ADAPTER: Adapter<NewYearBodyData, ContextOf<"newyear-2027">> = {
  id: "newyear-2027",
  teaserBody: NewYearBody,
  readingBody: NewYearReadingBody,
  crisisTexts: () => [], // chips only, no free text
  async context(b, gate) {
    const chart = chartOf(b.birth, "birth", gate.now);
    if (chart instanceof Response) return chart;
    return { product: "newyear-2027", year: buildNewYearFacts(chart, profileOf(b)) };
  },
  teaser: async (provider, ctx, hooks) => (await generateNewYearTeaser(provider, ctx.year, hooks)).data,
  chapterContext(b) {
    const profile = profileOf(b);
    return { kind: "newyear-2027", birth: b.birth, ...(profile ? { profile } : {}) };
  },
  chapter(b, _ctx, response, now) {
    const title = (response.reading as { title?: string } | null)?.title ?? "";
    const context = { ...(b.loveStatus ? { loveStatus: b.loveStatus } : {}), ...(b.workStatus ? { workStatus: b.workStatus } : {}) };
    return premiumChapter("newyear-2027", { birth: b.birth, title, ...(Object.keys(context).length ? { context } : {}) }, response, now);
  },
};
