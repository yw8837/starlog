import { computeChart, type SajuChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { buildFactSet } from "@/lib/ai/prompts/saju";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { annualView, luckView } from "./sajuLuckView";

const chartOf = (patch: Partial<SajuForm>) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch }));
const at = (year: number, month: number, day: number, hour: number | null, minute = 0) =>
  chartOf({ year, month, day, timeKnown: hour !== null, hour, minute: hour === null ? null : minute });
const ym = (d: Date | null) => (d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` : null);

const CHARTS: Array<[string, SajuChart]> = [
  ["1996-02-07 07:20 (역행)", at(1996, 2, 7, 7, 20)],
  ["1995-07-04 14:10 (순행)", at(1995, 7, 4, 14, 10)],
  ["1993-12-12 07:20", at(1993, 12, 12, 7, 20)],
  ["sample 1990-01-01, time unknown", chartOf({})],
  ["도비 1988-08-15 10:22", at(1988, 8, 15, 10, 22)],
];
const NOWS = ["2026-10-23T03:00:00Z", "2027-01-20T03:00:00Z", "2031-07-01T03:00:00Z"].map(Date.parse);

describe("대운 on the chart: the reading's cycles", () => {
  for (const [name, chart] of CHARTS) {
    for (const now of NOWS) {
      it(`${name} at ${new Date(now).toISOString().slice(0, 10)}: the same 간지, dates, ten gods and current cycle as the facts`, () => {
        const view = luckView(chart, now)!;
        const facts = buildFactSet(chart, now).luck!;
        expect(view.cycles.map((c) => c.gz)).toEqual(chart.luck.pillars.map((p) => p.ganzhi));
        for (const fact of facts.cycles) {
          const mine = view.cycles.find((c) => c.gz === fact.gz)!;
          expect([ym(mine.from), ym(mine.to), mine.stemGod, mine.branchGod]).toEqual([fact.from, fact.to, fact.stemTenGod, fact.branchMainTenGod]);
        }
        expect(view.cycles.filter((c) => c.current).map((c) => c.gz)).toEqual(facts.current ? [facts.current.gz] : []);
        expect(view.approximate).toBe(chart.pillars.hour === null);
      });
    }
  }

  it("1996-02-07 at 2026-10-23: 丁亥 from 2016-11 (만 20세) is the current one, 丙戌 follows in 2026-11", () => {
    const view = luckView(CHARTS[0]![1], nowOf("2026-10-23"))!;
    const current = view.cycles.find((c) => c.current)!;
    expect([current.gz, current.ko, ym(current.from), ym(current.to), current.startAge, current.stemGod, current.branchGod]).toEqual(["丁亥", "정해", "2016-11", "2026-11", 20, "상관", "편인"]);
    expect(view.cycles[view.cycles.indexOf(current) + 1]!.gz).toBe("丙戌");
    // 만 나이 at the start of each cycle, 10 years apart
    expect(view.cycles.slice(0, 3).map((c) => c.startAge)).toEqual([0, 10, 20]);
  });

  it("no cycles when the engine gives none (time unknown on 입춘 day: the year pillar is not certain)", () => {
    const chart = at(1990, 2, 4, null);
    expect(chart.luck.forward === null || chart.luck.pillars.length === 0).toBe(true);
    expect(luckView(chart, NOWS[0]!)).toBeNull();
    expect(buildFactSet(chart, NOWS[0]!).luck).toBeNull();
  });
});

describe("세운 on the chart: the reading's year", () => {
  for (const [name, chart] of CHARTS) {
    for (const now of [...NOWS, Date.parse("2027-02-03T12:00:00Z"), Date.parse("2027-02-04T12:00:00Z")]) {
      it(`${name} at ${new Date(now).toISOString().slice(0, 16)}: the first card is the facts' 세운, then the next years`, () => {
        const years = annualView(chart, now);
        const facts = buildFactSet(chart, now).annual;
        expect(years).toHaveLength(3);
        expect([years[0]!.year, years[0]!.gz, years[0]!.stemGod, years[0]!.branchGod]).toEqual([facts.year, facts.gz, facts.stemTenGod, facts.branchMainTenGod]);
        expect(years.map((y) => y.year)).toEqual([facts.year, facts.year + 1, facts.year + 2]);
        expect(years.map((y) => y.current)).toEqual([true, false, false]);
      });
    }
  }

  it("2026-10-23: 丙午 2026 · 丁未 2027 · 戊申 2028; before 입춘 2027 the 세운 is still 2026's", () => {
    const chart = CHARTS[0]![1];
    expect(annualView(chart, nowOf("2026-10-23")).map((y) => `${y.year} ${y.gz} ${y.ko}`)).toEqual(["2026 丙午 병오", "2027 丁未 정미", "2028 戊申 무신"]);
    expect(annualView(chart, nowOf("2027-01-20"))[0]!.year).toBe(2026);
  });
});

function nowOf(date: string): number {
  return Date.parse(`${date}T03:00:00Z`);
}
