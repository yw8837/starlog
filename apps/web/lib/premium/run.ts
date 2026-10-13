import "server-only";
import {
  DEEP_PART_COUNT, MATCH_PART_COUNT, NEWYEAR_PART_COUNT, assembleDeep, assembleMatch, assembleNewYear, generateDeepPart, generateMatchPart,
  generateNewYearPart, type MatchContext,
} from "@/lib/ai/generatePremium";
import {
  DeepPartASchema, DeepPartBSchema, MatchPartASchema, MatchPartBSchema, NewYearPartASchema, NewYearPartBSchema, NewYearPartCSchema,
  type DeepTarotReading, type MatchReading, type NewYearReading,
} from "@/lib/ai/premiumSchemas";
import type { NewYearFacts } from "@/lib/ai/prompts/newyear";
import type { TarotContext } from "@/lib/ai/prompts/tarot";
import type { GenerationHooks, ReadingProvider, Usage } from "@/lib/ai/provider";
import type { PremiumId } from "./products";

/** What a premium generation reads: the cards, the two charts and the cards, or the 2027 facts. */
export type PremiumContext =
  | { product: "tarot-deep"; tarot: TarotContext }
  | { product: "match"; match: MatchContext }
  | { product: "newyear-2027"; year: NewYearFacts };

export type PremiumReading = DeepTarotReading | MatchReading | NewYearReading;

export const PART_COUNTS: Readonly<Record<PremiumId, number>> = { "tarot-deep": DEEP_PART_COUNT, match: MATCH_PART_COUNT, "newyear-2027": NEWYEAR_PART_COUNT };

const PART_SCHEMAS = {
  "tarot-deep": [DeepPartASchema, DeepPartBSchema],
  match: [MatchPartASchema, MatchPartBSchema],
  "newyear-2027": [NewYearPartASchema, NewYearPartBSchema, NewYearPartCSchema],
} as const;

/** Parts from a resume token that this deploy can continue: fewer than all, each of its part's shape (a token from a deploy with other parts is not). */
export function partsFit(product: PremiumId, parts: readonly unknown[]): boolean {
  const schemas = PART_SCHEMAS[product];
  return parts.length < PART_COUNTS[product] && parts.every((part, i) => schemas[i]?.safeParse(part).success === true);
}

export type Step =
  | { complete: false; parts: unknown[]; usage: Usage[] }
  | { complete: true; parts: unknown[]; reading: PremiumReading; usage: Usage[] };

/**
 * Writes the next part (exactly one validated generation) after `done`, the parts already written
 * (from a resume token; sealed by the server, so trusted). After the last part, assembles the reading.
 */
export async function runNextPart(provider: ReadingProvider, ctx: PremiumContext, done: readonly unknown[], hooks?: GenerationHooks): Promise<Step> {
  const index = done.length;
  const count = PART_COUNTS[ctx.product];
  if (index >= count) throw new Error("every part is already written");
  const { data, usage } =
    ctx.product === "tarot-deep" ? await generateDeepPart(provider, ctx.tarot, index, done, hooks)
      : ctx.product === "match" ? await generateMatchPart(provider, ctx.match, index, done, hooks)
        : await generateNewYearPart(provider, ctx.year, index, done, hooks);
  const parts = [...done, data];
  console.info(JSON.stringify({ evt: "premium.part", product: ctx.product, part: index, of: count }));
  if (parts.length < count) return { complete: false, parts, usage };
  const reading =
    ctx.product === "tarot-deep" ? assembleDeep(ctx.tarot, parts)
      : ctx.product === "match" ? assembleMatch(ctx.match, parts)
        : assembleNewYear(ctx.year, parts);
  return { complete: true, parts, reading, usage };
}
