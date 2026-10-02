import { computeChart, ganzhiKo } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { maskGanzhiReadings } from "./ganzhi";
import { mockSajuFollowUp, mockSajuReading, mockSajuTeaser } from "./mock";
import { buildFactSet, type SajuFactSet } from "./prompts/saju";
import { isSoftViolation } from "./style";
import { validateSajuFollowUp, validateSajuReading, validateSajuTeaser } from "./validate";

const NOW = Date.parse("2026-10-02T03:00:00Z");
const hard = (violations: string[]) => violations.filter((v) => !isSoftViolation(v));
const factsOf = (patch: Partial<SajuForm>, now = NOW) => buildFactSet(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch })), now);

const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const SIXTY = Array.from({ length: 60 }, (_, i) => `${STEMS[i % 10]}${BRANCHES[i % 12]}`);
const pillarOf = (f: SajuFactSet, label: string) => f.pillars.find((p) => p.pillar.includes(label))?.gz;

/** The first birth date (from a start, one day at a time) whose facts satisfy `test`. */
function findChart(test: (f: SajuFactSet) => boolean, start: Partial<SajuForm>, step: (i: number) => Partial<SajuForm>): SajuFactSet {
  for (let i = 0; i < 4000; i++) {
    const f = factsOf({ ...start, ...step(i) });
    if (test(f)) return f;
  }
  throw new Error("no chart found");
}
const dayStep = (year: number, month: number) => (i: number) => {
  const d = new Date(Date.UTC(year, month - 1, 1 + i));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};

describe("간지 readings vs the banned-word checks (production bug: 壬申 read as 임신)", () => {
  it("masks 임신 only where it is the pillar", () => {
    expect(maskGanzhiReadings("임신(壬申) 대운이에요. 일주가 전날 일진인 壬申(임신)이 돼요. 임신년에는 차분해요.")).toBe("壬申(壬申) 대운이에요. 일주가 전날 일진인 壬申(壬申)이 돼요. 壬申년에는 차분해요.");
    expect(maskGanzhiReadings("임신과 출산은 다루지 않아요. 임신 일정은 쓰지 않아요.")).toBe("임신과 출산은 다루지 않아요. 임신 일정은 쓰지 않아요.");
  });

  it("no other of the sixty readings trips a banned topic or phrase in pillar context", () => {
    const facts = factsOf({});
    const reading = mockSajuReading(facts);
    const offending: string[] = [];
    for (const gz of SIXTY) {
      const ko = ganzhiKo(gz);
      const body = `${reading.observation.body} 명리에서는 ${ko}(${gz}) 대운을 이런 흐름으로 읽어요. ${gz}(${ko}) 일주도 마찬가지예요.`;
      const found = validateSajuReading({ ...reading, observation: { ...reading.observation, body } }, facts);
      const banned = found.filter((v) => /쓰지 않는 (주제|표현)|금지 표현/.test(v));
      if (banned.length) offending.push(`${gz} ${ko}: ${banned.join(" | ")}`);
    }
    expect(offending).toEqual([]);
  });

  const positions: Array<[string, () => SajuFactSet]> = [
    ["년주", () => factsOf({ year: 1992, month: 6, day: 15 })],
    ["월주", () => findChart((f) => pillarOf(f, "월주") === "壬申", {}, (i) => ({ year: 1960 + i, month: 8, day: 20 }))],
    ["일주", () => findChart((f) => pillarOf(f, "일주") === "壬申", {}, dayStep(1990, 1))],
    ["시주", () => findChart((f) => pillarOf(f, "시주") === "壬申", { timeKnown: true, hour: 16, minute: 0 }, dayStep(1990, 1))],
    ["대운", () => findChart((f) => Boolean(f.luck?.cycles.some((c) => c.gz === "壬申")), { gender: "male" }, (i) => ({ ...dayStep(1980, 3)(i * 37) }))],
    ["현재 대운", () => findChart((f) => f.luck?.current?.gz === "壬申", { gender: "female" }, (i) => ({ ...dayStep(1950, 1)(i * 11) }))],
    ["세운", () => factsOf({}, Date.parse("2052-06-01T03:00:00Z"))],
  ];

  it.each(positions)("passes a chart with 壬申 as its %s: teaser, prologue and follow-up", (_label, make) => {
    const facts = make();
    const glyphs = [facts.annual.gz, ...facts.pillars.map((p) => p.gz), ...(facts.luck?.cycles.map((c) => c.gz) ?? [])];
    expect(glyphs).toContain("壬申");
    expect(validateSajuTeaser(mockSajuTeaser(facts), facts)).toEqual([]);
    const reading = mockSajuReading(facts);
    expect(validateSajuReading(reading, facts)).toEqual([]);
    // the reading as the model writes it, and the engine's own note form
    const named = `${reading.observation.body} 임신(壬申) 기운이 놓인 자리도 함께 짚어 볼 만해요. 壬申(임신)의 자리예요.`;
    expect(hard(validateSajuReading({ ...reading, observation: { ...reading.observation, body: named } }, facts))).toEqual([]);
    expect(validateSajuFollowUp(mockSajuFollowUp(facts), facts)).toEqual([]);
  });

  it("still fails a reading that talks about pregnancy", () => {
    const facts = factsOf({ year: 1992, month: 6, day: 15 });
    const reading = mockSajuReading(facts);
    for (const sentence of ["올해는 임신 소식이 반가운 해예요.", "임신을 준비하기 좋은 흐름이에요."]) {
      const body = `${reading.observation.body} ${sentence}`;
      expect(hard(validateSajuReading({ ...reading, observation: { ...reading.observation, body } }, facts)).join(" ")).toMatch(/임신·출산/);
    }
  });
});
