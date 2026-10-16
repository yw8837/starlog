import { describe, expect, it } from "vitest";
import deep from "@content/samples/premium/tarot-deep.json";
import match from "@content/samples/premium/match.json";
import year from "@content/samples/premium/newyear-2027.json";
import { DeepTarotReadingSchema, MatchReadingSchema, NewYearReadingSchema } from "@/lib/ai/premiumSchemas";
import { isDeepTarotReading, isMatchReading, isNewYearReading } from "@/lib/reading/validate";
import { PREMIUM_SAMPLES, sampleExcerpt } from "./samples";

/**
 * The placeholder samples (stage 3): mock-provider outputs written through the part runner, so each part passed its
 * validator when written. Stage 4 replaces them with owner-approved real outputs before premium opens.
 */
describe("premium samples", () => {
  it("parse as whole readings, as the record screens read them", () => {
    expect(DeepTarotReadingSchema.safeParse(deep.reading).success).toBe(true);
    expect(MatchReadingSchema.safeParse(match.reading).success).toBe(true);
    expect(NewYearReadingSchema.safeParse(year.reading).success).toBe(true);
    expect([isDeepTarotReading(deep.reading), isMatchReading(match.reading), isNewYearReading(year.reading)]).toEqual([true, true, true]);
    expect([deep.cards.length, match.cards.length]).toEqual([10, 5]);
  });

  it("never name a model, the tradition or a beta, and carry no birth of a partner", () => {
    for (const sample of [deep, match, year]) expect(JSON.stringify(sample)).not.toMatch(/켈틱|셀틱|celtic|claude|anthropic|gpt|opus|sonnet|베타/i);
    expect(JSON.stringify(match)).not.toMatch(/"partner"|"birth"/);
  });

  it("give each product page a short excerpt that ends on a sentence", () => {
    for (const id of ["tarot-deep", "match", "newyear-2027"] as const) {
      const excerpt = sampleExcerpt(id);
      expect(excerpt.heading.length).toBeGreaterThan(0);
      expect(excerpt.body.length).toBeGreaterThan(40);
      expect(excerpt.body.length).toBeLessThanOrEqual(220);
      expect(excerpt.body).toMatch(/[.!?…]$/);
      expect(PREMIUM_SAMPLES[id].input.summary.length).toBeGreaterThan(0);
    }
  });
});
