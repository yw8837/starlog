import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import deep from "@content/samples/premium/tarot-deep.json";
import match2 from "@content/samples/premium/match-2.json";
import match from "@content/samples/premium/match.json";
import year from "@content/samples/premium/newyear-2027.json";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { DeepTarotReadingSchema, MatchReadingSchema, NewYearReadingSchema } from "@/lib/ai/premiumSchemas";
import { kbCard } from "@/lib/kb";
import { isDeepTarotReading, isMatchReading, isNewYearReading } from "@/lib/reading/validate";
import { MATCH_SECOND_SAMPLE, PREMIUM_SAMPLES, sampleApproved, sampleExcerpt } from "./samples";

/**
 * The samples are real outputs of the premium eval, approved: 켈틱 크로스 10장 D1 (연애·연락) and 2027 신년운세 N3 (대운 changes
 * in 2027) from 2026-10-17, and the saju-only 프리미엄 궁합's M1 (연인) and M2 (썸, the other person's time unknown) from
 * 2026-10-20 (its real eval, the other person's chart and years checked absent). Their inputs are made up and only
 * summarised here.
 */
/** How closely a card's section quotes one of `facts`: the best fact's share of its 6-character pieces found in the section. */
function quoted(body: string, facts: Array<{ ko: string }>): number {
  const plain = (text: string) => text.replace(/[\s,.()]/g, "");
  const text = plain(body);
  return Math.max(0, ...facts.map(({ ko }) => {
    const fact = plain(ko);
    const pieces = Array.from({ length: Math.max(0, fact.length - 5) }, (_, i) => fact.slice(i, i + 6));
    return pieces.length ? pieces.filter((piece) => text.includes(piece)).length / pieces.length : 0;
  }));
}
const pillarsOf = (form: Partial<SajuForm>) => Object.values(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...form })).pillars).flatMap((p) => (p ? [p.stem + p.branch] : []));
describe("premium samples", () => {
  it("parse as whole readings, as the record screens read them", () => {
    expect(DeepTarotReadingSchema.safeParse(deep.reading).success).toBe(true);
    expect(MatchReadingSchema.safeParse(match.reading).success).toBe(true);
    expect(MatchReadingSchema.safeParse(match2.reading).success).toBe(true);
    expect(isMatchReading(match2.reading)).toBe(true);
    expect(NewYearReadingSchema.safeParse(year.reading).success).toBe(true);
    expect([isDeepTarotReading(deep.reading), isMatchReading(match.reading), isNewYearReading(year.reading)]).toEqual([true, true, true]);
    expect(deep.cards.length).toBe(10);
    // saju only (owner 2026-10-17): the year ahead in four bands, no card
    for (const sample of [match, match2]) {
      expect(sample.reading.periods).toHaveLength(4);
      expect(JSON.stringify(sample)).not.toMatch(/"cards"|"deck"|cardId/);
    }
  });

  it("are all approved real outputs now: no placeholder left, so every product page shows its sample (the 궁합's from 2026-10-20)", () => {
    for (const sample of [deep, match, match2, year]) expect("placeholder" in sample).toBe(false);
    expect([sampleApproved("tarot-deep"), sampleApproved("match"), sampleApproved("newyear-2027")]).toEqual([true, true, true]);
    // the real 궁합: the year ahead in the four bands of the eval's moment (2026-11-20), written from the two births' saju
    for (const sample of [match, match2]) {
      expect(sample.reading.periods.map((p) => p.heading)).toEqual(["2026년 11월~2027년 1월", "2027년 2월~4월", "2027년 5월~7월", "2027년 8월~10월"]);
      expect(sample.reading.together.heading).toBe("서로에게 맞는 말과 행동");
    }
    expect(match.input.summary).toBe("연인 · 두 사람 모두 태어난 시를 알아요 · 고민: 요즘 대화가 줄었어요");
    expect(match.reading.saju.dayMasters.body).toContain("준호");
    expect(match2.input.summary).toBe("썸 · 상대가 태어난 시를 몰라요");
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

  it("record the card design their text describes, so their pages show those faces: the 1909 scans for D1 (never regenerated)", () => {
    const samples = [["D1", PREMIUM_SAMPLES["tarot-deep"], PREMIUM_SAMPLES["tarot-deep"].reading.positions]] as const;
    for (const [name, sample, sections] of samples) {
      expect([name, sample.deck]).toEqual([name, "rws1909"]);
      // Measured, not assumed: each card's section quotes the facts only its recorded deck draws far more than the other's.
      const score = { rws1909: 0, starlog: 0 };
      for (const { cardId, body } of sections) {
        const kb = kbCard(cardId);
        const pictures = { rws1909: kb.imagery.facts, starlog: kb.imagery.decks!.starlog!.facts };
        score.rws1909 += quoted(body, pictures.rws1909.filter((f) => !pictures.starlog.some((o) => o.ko === f.ko)));
        score.starlog += quoted(body, pictures.starlog.filter((f) => !pictures.rws1909.some((o) => o.ko === f.ko)));
      }
      const other = sample.deck === "starlog" ? "rws1909" : "starlog";
      expect(score[sample.deck], `${name} ${JSON.stringify(score)}`).toBeGreaterThan(score[other] * 2);
    }
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
