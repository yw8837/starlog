import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { SAJU_SAMPLE } from "./fixtures";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "./sajuForm";
import { SAJU_PROLOGUE_SECTIONS, SAMPLE_CHART_KEY, composeChartTeaser, isSampleChart } from "./sajuPrologue";

const chartOf = (patch: Partial<SajuForm>) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch }));

describe("SAMPLE_CHART_KEY", () => {
  it("is the chart the gold sample was written for (kept in step with the fixture JSON)", () => {
    const { pillars } = SAJU_SAMPLE.chart;
    expect(SAMPLE_CHART_KEY).toEqual({
      year: pillars.year.stem + pillars.year.branch,
      month: pillars.month.stem + pillars.month.branch,
      day: pillars.day.stem + pillars.day.branch,
      gender: SAJU_SAMPLE.input.gender,
      place: SAJU_SAMPLE.input.birthPlace,
    });
    expect(SAJU_SAMPLE.input.timeKnown).toBe(false);
  });
});

describe("isSampleChart", () => {
  it("is true for the sample input: same pillars, no hour, same gender, born in 서울", () => {
    expect(isSampleChart(chartOf({}))).toBe(true);
  });

  it("is false once anything the prologue text depends on differs, the birthplace included", () => {
    expect(isSampleChart(chartOf({ timeKnown: true, hour: 9, minute: 30 }))).toBe(false);
    expect(isSampleChart(chartOf({ gender: "male" }))).toBe(false);
    expect(isSampleChart(chartOf({ day: 2 }))).toBe(false);
    // Same pillars, but the sample's "0시 32분" and "약 −32분" are Seoul's correction.
    expect(isSampleChart(chartOf({ placeId: "busan" }))).toBe(false);
  });

  it("gives a 부산 birth on the sample day its own composed teaser", () => {
    const busan = chartOf({ placeId: "busan" });
    expect(busan.warnings.find((w) => w.code === "DAY_PILLAR_WINDOW")?.window?.to).not.toBe("00:32");
    expect(composeChartTeaser(busan)).toBe(
      "일간은 병화(丙火)예요. 태어난 달은 자월(子月)로, 겨울의 한가운데예요. 보이는 여섯 글자 가운데 불(火)이 셋이고, 쇠(金)는 하나도 없어요. 태어난 시를 몰라 시주 없이 여섯 글자로 봤어요.",
    );
  });
});

describe("composeChartTeaser", () => {
  it("states the sample chart's facts only: day master, season, element counts, the missing hour", () => {
    expect(composeChartTeaser(chartOf({}))).toBe(
      "일간은 병화(丙火)예요. 태어난 달은 자월(子月)로, 겨울의 한가운데예요. 보이는 여섯 글자 가운데 불(火)이 셋이고, 쇠(金)는 하나도 없어요. 태어난 시를 몰라 시주 없이 여섯 글자로 봤어요.",
    );
  });

  it("counts eight glyphs and drops the missing-hour sentence when the time is known", () => {
    expect(composeChartTeaser(chartOf({ timeKnown: true, hour: 9, minute: 30 }))).toBe(
      "일간은 병화(丙火)예요. 태어난 달은 자월(子月)로, 겨울의 한가운데예요. 보이는 여덟 글자 가운데 불(火)이 셋이고, 쇠(金)는 하나도 없어요.",
    );
  });

  it("names every element that shares the top count, and every missing one", () => {
    expect(composeChartTeaser(chartOf({ year: 1995, month: 3, day: 2, gender: "male" }))).toBe(
      "일간은 임수(壬水)예요. 태어난 달은 인월(寅月)로, 봄이 시작되는 달이에요. 보이는 여섯 글자 가운데 나무(木)·흙(土)·물(水)이 둘씩이고, 불(火)·쇠(金)는 하나도 없어요. 태어난 시를 몰라 시주 없이 여섯 글자로 봤어요.",
    );
  });

  it("has no missing-element clause when all five appear, and skips the season when the month pillar is uncertain", () => {
    const chart = chartOf({ year: 1995, month: 3, day: 6, gender: "male" });
    expect(chart.ambiguous.map((a) => a.pillar)).toEqual(["month"]);
    expect(composeChartTeaser(chart)).toBe("일간은 병화(丙火)예요. 보이는 여섯 글자 가운데 나무(木)가 둘이에요. 태어난 시를 몰라 시주 없이 여섯 글자로 봤어요.");
  });

  it("uses 이에요 after a day master that ends in a consonant", () => {
    const chart = chartOf({ year: 1990, month: 1, day: 9 });
    expect(chart.dayMaster.stem).toBe("甲");
    expect(composeChartTeaser(chart).startsWith("일간은 갑목(甲木)이에요.")).toBe(true);
  });
});

describe("SAJU_PROLOGUE_SECTIONS", () => {
  it("keeps one generic entry per paid section, in the sample's order and 'label · title' form", () => {
    expect(SAJU_PROLOGUE_SECTIONS).toHaveLength(SAJU_SAMPLE.paid.sections.length);
    expect(SAJU_PROLOGUE_SECTIONS.map((h) => h.split(" · ")[0])).toEqual(["월령과 뿌리", "오행 지도", "십성", "일지", "일하는 결과 쉬는 결", "지금의 10년", "계산 기준"]);
    for (const heading of SAJU_PROLOGUE_SECTIONS) expect(heading.split(" · ")).toHaveLength(2);
  });

  it("holds nothing that is only true of the sample chart", () => {
    const text = SAJU_PROLOGUE_SECTIONS.join(" ");
    for (const specific of ["한겨울", "丙", "巳", "庚", "辰", "불 셋", "정관", "상관", "편인", "비견", "경진", "시를 모를"]) {
      expect(text).not.toContain(specific);
    }
  });
});
