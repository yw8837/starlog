import "server-only";
import { generationSetting } from "./config";
import type { Result } from "./generate";
import { mockDeepPartA, mockDeepPartB, mockDeepTeaser } from "./mockPremium";
import {
  DeepPartASchema, DeepPartBSchema, DeepTeaserDraftSchema,
  type DeepPartA, type DeepPartB, type DeepTarotPreview, type DeepTarotReading,
} from "./premiumSchemas";
import {
  DEEP_TAROT_SYSTEM, deepHeadings, deepLockedToc, deepPartAPrompt, deepPartBPrompt, deepShared, deepTeaserPrompt, previewKeyword,
} from "./prompts/deepTarot";
import { cardLabel, type TarotContext } from "./prompts/tarot";
import { generateValidated, type GenerationHooks, type ReadingProvider } from "./provider";
import { validateDeepPartA, validateDeepPartB, validateDeepTeaser } from "./validatePremium";

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
