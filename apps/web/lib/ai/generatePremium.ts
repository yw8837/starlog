import "server-only";
import { generationSetting } from "./config";
import type { Result } from "./generate";
import { mockDeepPartA, mockDeepPartB, mockDeepTeaser, mockMatchPartA, mockMatchPartB, mockMatchTeaser } from "./mockPremium";
import {
  DeepPartASchema, DeepPartBSchema, DeepTeaserDraftSchema, MatchPartASchema, MatchPartBSchema, MatchTeaserDraftSchema,
  type DeepPartA, type DeepPartB, type DeepTarotPreview, type DeepTarotReading, type MatchPartA, type MatchPartB, type MatchPreview,
  type MatchReading,
} from "./premiumSchemas";
import {
  DEEP_TAROT_SYSTEM, deepHeadings, deepLockedToc, deepPartAPrompt, deepPartBPrompt, deepShared, deepTeaserPrompt, previewKeyword,
} from "./prompts/deepTarot";
import {
  MATCH_HEADINGS, MATCH_SAJU_SYSTEM, MATCH_TAROT_SYSTEM, chartView, matchCardsShared, matchLockedToc, matchPartAPrompt, matchPartBPrompt,
  matchPreviewFacts, matchSajuShared, matchTeaserPrompt, type MatchFacts,
} from "./prompts/match";
import { cardLabel, type TarotContext } from "./prompts/tarot";
import { generateValidated, type GenerationHooks, type ReadingProvider } from "./provider";
import {
  validateDeepPartA, validateDeepPartB, validateDeepTeaser, validateMatchPartA, validateMatchPartB, validateMatchTeaser,
} from "./validatePremium";

/**
 * Premium generators (P5). Each part is one validated generation (generateValidated: regenerates
 * only for a hard violation or the ≥3 soft rule, keeps a soft-only draft); the route writes exactly
 * one part per request. Code writes positions, card ids and headings over the model's drafts when
 * it assembles.
 */

// ---- 심층 타로 ----

export const DEEP_PART_COUNT = 2;

export async function generateDeepTeaser(provider: ReadingProvider, ctx: TarotContext, hooks?: GenerationHooks): Promise<Result<DeepTarotPreview>> {
  const { data, usage } = await generateValidated(provider, {
    name: "premium-teaser",
    system: DEEP_TAROT_SYSTEM,
    user: deepTeaserPrompt(ctx),
    schema: DeepTeaserDraftSchema,
    ...generationSetting("premium-teaser"),
    mock: () => mockDeepTeaser(ctx),
  }, (draft) => validateDeepTeaser(draft, ctx), hooks);
  return {
    data: {
      cards: ctx.cards.map((c) => ({ position: c.position, cardId: c.cardId, orientation: c.orientation, keyword: previewKeyword(c, ctx) })),
      now: { heading: cardLabel(ctx.cards[0]!), body: data.now.body.trim() },
      lockedToc: deepLockedToc(ctx),
    },
    usage,
  };
}

export async function generateDeepPart(
  provider: ReadingProvider, ctx: TarotContext, index: number, prior: readonly unknown[], hooks?: GenerationHooks,
): Promise<Result<DeepPartA | DeepPartB>> {
  const common = { name: "deep-tarot-part" as const, system: DEEP_TAROT_SYSTEM, shared: deepShared(ctx), ...generationSetting("deep-tarot-part") };
  if (index === 0) {
    const { data, usage } = await generateValidated(provider, {
      ...common, user: deepPartAPrompt(), schema: DeepPartASchema, mock: () => mockDeepPartA(ctx),
    }, (a) => validateDeepPartA(a, ctx), hooks);
    return { data, usage };
  }
  const a = DeepPartASchema.parse(prior[0]);
  const { data, usage } = await generateValidated(provider, {
    ...common, user: deepPartBPrompt(ctx, a), schema: DeepPartBSchema, mock: () => mockDeepPartB(ctx),
  }, (b) => validateDeepPartB(b, ctx), hooks);
  return { data, usage };
}

export function assembleDeep(ctx: TarotContext, parts: readonly unknown[]): DeepTarotReading {
  const a = DeepPartASchema.parse(parts[0]);
  const b = DeepPartBSchema.parse(parts[1]);
  const h = deepHeadings(ctx);
  return {
    verdict: a.verdict.trim(),
    positions: ctx.cards.map((card, i) => ({ position: card.position, cardId: card.cardId, heading: cardLabel(card), body: a.positions[i]!.body.trim() })),
    crossing: { heading: h.crossing, body: b.crossing.body.trim() },
    axes: {
      heading: h.axes,
      vertical: { heading: h.vertical, body: b.axes.vertical.trim() },
      horizontal: { heading: h.horizontal, body: b.axes.horizontal.trim() },
    },
    staff: { heading: h.staff, body: b.staff.body.trim() },
    timing: { heading: h.timing, body: b.timing.body.trim() },
    action: { heading: h.action, body: b.action.body.trim() },
    observation: { heading: h.observation, body: b.observation.body.trim() },
    followUps: b.followUps.map((q) => q.trim()).filter(Boolean).slice(0, 2),
  };
}

// ---- 우리 사이 궁합 ----

export interface MatchContext {
  facts: MatchFacts;
  cards: TarotContext;
}

export const MATCH_PART_COUNT = 2;

export async function generateMatchTeaser(provider: ReadingProvider, mc: MatchContext, hooks?: GenerationHooks): Promise<Result<MatchPreview>> {
  const { data, usage } = await generateValidated(provider, {
    name: "premium-teaser",
    system: MATCH_SAJU_SYSTEM,
    shared: matchSajuShared(mc.facts),
    user: matchTeaserPrompt(),
    schema: MatchTeaserDraftSchema,
    ...generationSetting("premium-teaser"),
    mock: () => mockMatchTeaser(mc.facts),
  }, (draft) => validateMatchTeaser(draft, mc.facts), hooks);
  return {
    data: {
      facts: matchPreviewFacts(mc.facts),
      charts: { me: chartView(mc.facts.me), partner: chartView(mc.facts.partner) },
      cards: mc.cards.cards.map((c) => ({ position: c.position, cardId: c.cardId, orientation: c.orientation, keyword: previewKeyword(c, mc.cards) })),
      summary: { heading: "두 사람 첫인상", body: data.summary.trim() },
      lockedToc: matchLockedToc(mc.cards),
    },
    usage,
  };
}

export async function generateMatchPart(
  provider: ReadingProvider, mc: MatchContext, index: number, prior: readonly unknown[], hooks?: GenerationHooks,
): Promise<Result<MatchPartA | MatchPartB>> {
  if (index === 0) {
    const { data, usage } = await generateValidated(provider, {
      name: "match-part", system: MATCH_SAJU_SYSTEM, shared: matchSajuShared(mc.facts), user: matchPartAPrompt(),
      schema: MatchPartASchema, ...generationSetting("match-part"), mock: () => mockMatchPartA(mc.facts),
    }, (a) => validateMatchPartA(a, mc.facts), hooks);
    return { data, usage };
  }
  const a = MatchPartASchema.parse(prior[0]);
  const { data, usage } = await generateValidated(provider, {
    name: "match-part", system: MATCH_TAROT_SYSTEM, shared: matchCardsShared(mc.facts, mc.cards), user: matchPartBPrompt(mc.facts, a),
    schema: MatchPartBSchema, ...generationSetting("match-part"), mock: () => mockMatchPartB(mc.facts, mc.cards),
  }, (b) => validateMatchPartB(b, mc.facts, mc.cards), hooks);
  return { data, usage };
}

export function assembleMatch(mc: MatchContext, parts: readonly unknown[]): MatchReading {
  const a = MatchPartASchema.parse(parts[0]);
  const b = MatchPartBSchema.parse(parts[1]);
  const h = MATCH_HEADINGS;
  return {
    verdict: b.verdict.trim(),
    saju: {
      dayMasters: { heading: h.dayMasters, body: a.dayMasters.body.trim() },
      elements: { heading: h.elements, body: a.elements.body.trim() },
      pillars: { heading: h.pillars, body: a.pillars.body.trim() },
      luck: { heading: h.luck, body: a.luck.body.trim() },
    },
    cards: mc.cards.cards.map((card, i) => ({ position: card.position, cardId: card.cardId, heading: cardLabel(card), body: b.cards[i]!.body.trim() })),
    connection: { heading: h.connection, body: b.connection.body.trim() },
    bridge: { heading: h.bridge, body: b.bridge.body.trim() },
    action: { heading: h.action, body: b.action.body.trim() },
    observation: { heading: h.observation, body: b.observation.body.trim() },
    followUps: b.followUps.map((q) => q.trim()).filter(Boolean).slice(0, 2),
  };
}
