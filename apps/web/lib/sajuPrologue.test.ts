import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { SAJU_SAMPLE } from "./fixtures";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "./sajuForm";
import { SAJU_PROLOGUE_SECTIONS, composeChartTeaser, isSampleChart } from "./sajuPrologue";

const chartOf = (patch: Partial<SajuForm>) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch }));

describe("isSampleChart", () => {
  it("is true for the sample input, and for any input with the same pillars, no hour and the same gender", () => {
    expect(isSampleChart(chartOf({}))).toBe(true);
    // Another birthplace, same day: pillars do not change when the time is unknown.
    expect(isSampleChart(chartOf({ placeId: "busan" }))).toBe(true);
  });

  it("is false once anything the prologue text depends on differs", () => {
    expect(isSampleChart(chartOf({ timeKnown: true, hour: 9, minute: 30 }))).toBe(false);
    expect(isSampleChart(chartOf({ gender: "male" }))).toBe(false);
    expect(isSampleChart(chartOf({ day: 2 }))).toBe(false);
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
