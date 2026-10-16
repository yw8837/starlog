import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import deep from "@content/samples/premium/tarot-deep.json";
import match2 from "@content/samples/premium/match-2.json";
import match from "@content/samples/premium/match.json";
import year from "@content/samples/premium/newyear-2027.json";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { DeepTarotReadingSchema, MatchReadingSchema, NewYearReadingSchema } from "@/lib/ai/premiumSchemas";
import { isDeepTarotReading, isMatchReading, isNewYearReading } from "@/lib/reading/validate";
import { MATCH_SECOND_SAMPLE, PREMIUM_SAMPLES, sampleExcerpt } from "./samples";

/**
 * The samples are the owner-approved real outputs of the stage 4 eval (2026-10-17): 켈틱 크로스 10장 D1 (연애·연락),
 * 프리미엄 궁합 M1 (연인) and M2 (썸, the other person's time unknown), 2027 신년운세 N3 (대운 changes in 2027). Each passed
 * its validators when written; their inputs are made up and only summarised here.
 */
const pillarsOf = (form: Partial<SajuForm>) => Object.values(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...form })).pillars).flatMap((p) => (p ? [p.stem + p.branch] : []));
describe("premium samples", () => {
  it("parse as whole readings, as the record screens read them", () => {
    expect(DeepTarotReadingSchema.safeParse(deep.reading).success).toBe(true);
    expect(MatchReadingSchema.safeParse(match.reading).success).toBe(true);
    expect(MatchReadingSchema.safeParse(match2.reading).success).toBe(true);
    expect(isMatchReading(match2.reading)).toBe(true);
    expect(match2.cards).toHaveLength(5);
    expect(NewYearReadingSchema.safeParse(year.reading).success).toBe(true);
    expect([isDeepTarotReading(deep.reading), isMatchReading(match.reading), isNewYearReading(year.reading)]).toEqual([true, true, true]);
    expect([deep.cards.length, match.cards.length]).toEqual([10, 5]);
  });

  it("never name a model, the tradition or a beta, and carry no birth of a partner", () => {
    for (const sample of [deep, match, match2, year]) expect(JSON.stringify(sample)).not.toMatch(/셀틱|celtic|claude|anthropic|gpt|opus|sonnet|베타/i);
    for (const sample of [match, match2]) expect(JSON.stringify(sample)).not.toMatch(/"partner"|"birth"/);
  });

  it("name the other person in each 궁합 by their day master only (owner 2026-10-17): no pillar or birth year of theirs", () => {
    // The made-up births of the eval's golden cases (content/eval/premium/golden.json): M1 and M2.
    const cases = [
      { sample: match, me: { year: 1990, month: 1, day: 1, timeKnown: true, hour: 21, minute: 10, gender: "female" as const }, partner: { year: 1992, month: 2, day: 26, timeKnown: true, hour: 8, minute: 30, gender: "male" as const } },
      { sample: match2, me: { year: 1995, month: 3, day: 10, timeKnown: true, hour: 14, minute: 0, gender: "female" as const }, partner: { year: 1993, month: 11, day: 2, gender: "male" as const } },
    ];
    for (const { sample, me, partner } of cases) {
      const mine = pillarsOf(me);
      const text = JSON.stringify(sample.reading);
      for (const gz of pillarsOf(partner).filter((g) => !mine.includes(g))) expect(text, gz).not.toContain(gz);
      expect(text).not.toContain(String(partner.year));
    }
    expect(MATCH_SECOND_SAMPLE.input.summary).toContain("상대가 태어난 시를 몰라요");
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
