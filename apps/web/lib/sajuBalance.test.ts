import { BRANCHES, STEMS, computeChart, mainHiddenStem, stemElement, type SajuChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { buildFactSet, tenGod } from "@/lib/ai/prompts/saju";
import { buildTopicFactSet, groupOf } from "@/lib/ai/prompts/sajuTopics";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { ELEMENT_WORD, TEN_GOD_GROUPS, elementAxes, groupOfElement, groupShares, roundShares, tenGodOf } from "./sajuBalance";

const NOW = Date.parse("2026-10-23T03:00:00Z");
const chartOf = (patch: Partial<SajuForm>) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch }));
const at = (year: number, month: number, day: number, hour: number | null, minute = 0) =>
  chartOf({ year, month, day, timeKnown: hour !== null, hour, minute: hour === null ? null : minute });

/** The example charts of the saju guides (lib/guide-articles/saju-guides.test.ts), the sample chart and 도비 (NameChips.test.tsx). */
const EXAMPLES: Array<[string, SajuChart]> = [
  ["1996-02-07 07:20", at(1996, 2, 7, 7, 20)],
  ["1997-08-11 16:50", at(1997, 8, 11, 16, 50)],
  ["1995-07-04 14:10", at(1995, 7, 4, 14, 10)],
  ["1993-12-12 07:20", at(1993, 12, 12, 7, 20)],
  ["1999-10-03 20:30", at(1999, 10, 3, 20, 30)],
  ["1995-08-20 12:00", at(1995, 8, 20, 12)],
  ["1990-05-15 12:00", at(1990, 5, 15, 12)],
  ["sample 1990-01-01, time unknown", chartOf({})],
  ["도비 1988-08-15 10:22", at(1988, 8, 15, 10, 22)],
];

describe("오행 · 글자 수 (the radar)", () => {
  it.each(EXAMPLES)("%s: the counts are the engine's visible glyphs, the same numbers the reading's facts carry", (_, chart) => {
    const axes = elementAxes(chart);
    expect(axes.map((a) => a.element)).toEqual(["목", "화", "토", "금", "수"]);
    expect(Object.fromEntries(axes.map((a) => [a.element, a.count]))).toEqual(chart.elements);
    expect(Object.fromEntries(axes.map((a) => [a.element, a.count]))).toEqual(buildFactSet(chart, NOW).elements.counts);
    expect(axes.reduce((sum, a) => sum + a.count, 0)).toBe(chart.pillars.hour ? 8 : 6);
  });

  it("each axis names its element in plain words and its 십성 group to the day master: 도비 (壬, 시주부터 甲辰 壬寅 庚申 戊辰)", () => {
    const dobi = EXAMPLES.at(-1)![1];
    expect(dobi.dayMaster.stem).toBe("壬");
    expect(elementAxes(dobi).map((a) => `${a.word}(${a.group}) ${a.count}`)).toEqual(["나무(식상) 2", "불(재성) 0", "흙(관성) 3", "쇠(인성) 2", "물(비겁) 1"]);
  });

  it.each([
    ["甲", ["비겁", "식상", "재성", "관성", "인성"]],
    ["丙", ["인성", "비겁", "식상", "재성", "관성"]],
    ["戊", ["관성", "인성", "비겁", "식상", "재성"]],
    ["庚", ["재성", "관성", "인성", "비겁", "식상"]], // the reference: 나무(재성) · 불(관성) · 흙(인성) · 금(비겁) · 물(식상)
    ["辛", ["재성", "관성", "인성", "비겁", "식상"]],
    ["癸", ["식상", "재성", "관성", "인성", "비겁"]],
  ])("day master %s: 목화토금수 are %j", (stem, groups) => {
    expect(["목", "화", "토", "금", "수"].map((el) => groupOfElement(stemElement(stem), el as never))).toEqual(groups);
  });

  it("the group of every element agrees with the reading's ten god for all ten day masters", () => {
    for (const day of STEMS) for (const other of STEMS) expect(groupOfElement(stemElement(day), stemElement(other)), `${day}→${other}`).toBe(groupOf(tenGod(day, other)));
  });

  it("plain words for the elements are the reading's (쇠, not 금)", () => {
    expect(ELEMENT_WORD).toEqual({ 목: "나무", 화: "불", 토: "흙", 금: "쇠", 수: "물" });
  });
});

describe("tenGodOf", () => {
  it("is the reading's ten god for every stem and every branch's 본기, from all ten day masters", () => {
    for (const day of STEMS) {
      for (const other of STEMS) expect(tenGodOf(day, other), `${day}→${other}`).toBe(tenGod(day, other));
      for (const branch of BRANCHES) expect(tenGodOf(day, mainHiddenStem(branch)), `${day}→${branch}`).toBe(tenGod(day, mainHiddenStem(branch)));
    }
  });
});

describe("십성 · 비율 (the donut)", () => {
  it.each(EXAMPLES)("%s: the counts are the topic reading's 다섯 묶음 (천간과 지지 본기, 일간 제외)", (_, chart) => {
    const shares = groupShares(chart);
    const topic = buildTopicFactSet(chart, NOW, "money");
    expect(shares.items.map((g) => g.group)).toEqual([...TEN_GOD_GROUPS]);
    expect(shares.items.map((g) => [g.group, g.count])).toEqual(topic.groups.items.map((g) => [g.name, g.count]));
    expect(shares.total).toBe(chart.pillars.hour ? 7 : 5);
    expect(shares.items.reduce((sum, g) => sum + g.count, 0)).toBe(shares.total);
    // the places are the reading's, as the chart labels them (연, not 년)
    expect(shares.items.map((g) => g.places)).toEqual(topic.groups.items.map((g) => g.visible.map((v) => v.replace(/^년/, "연"))));
  });

  it.each(EXAMPLES)("%s: the percentages add up to 100 and each is its count's share, rounded", (_, chart) => {
    const { items, total } = groupShares(chart);
    expect(items.reduce((sum, g) => sum + g.percent, 0)).toBe(100);
    for (const g of items) expect(Math.abs(g.percent - (g.count / total) * 100), g.group).toBeLessThan(1);
  });

  it.each(EXAMPLES)("%s: a group equals its element's glyph count, less the day master for 비겁 (radar and donut agree)", (_, chart) => {
    const axes = elementAxes(chart);
    for (const g of groupShares(chart).items) {
      const axis = axes.find((a) => a.element === g.element)!;
      expect(axis.group).toBe(g.group);
      expect(g.count, g.group).toBe(axis.count - (g.group === "비겁" ? 1 : 0));
    }
  });

  it.each(EXAMPLES)("%s: a group missing on the surface is marked hidden exactly when the reading finds it in a 지장간", (_, chart) => {
    const topic = buildTopicFactSet(chart, NOW, "money");
    for (const g of groupShares(chart).items) {
      const fact = topic.groups.items.find((f) => f.name === g.group)!;
      expect(g.hiddenOnly, g.group).toBe(g.count === 0 && fact.hidden.length > 0);
    }
  });

  it("도비 (壬): 비겁 0 (숨음) · 식상 2 · 재성 0 (숨음) · 관성 3 · 인성 2 of 7 → 0 · 29 · 0 · 43 · 28", () => {
    const { items } = groupShares(EXAMPLES.at(-1)![1]);
    expect(items.map((g) => [g.group, g.word, g.count, g.percent, g.hiddenOnly])).toEqual([
      ["비겁", "물", 0, 0, true],
      ["식상", "나무", 2, 29, false],
      ["재성", "불", 0, 0, true],
      ["관성", "흙", 3, 43, false],
      ["인성", "쇠", 2, 28, false],
    ]);
    expect(items.find((g) => g.group === "관성")!.places).toEqual(["연간 戊 편관", "연지 辰 편관", "시지 辰 편관"]);
  });
});

describe("roundShares", () => {
  it("largest remainder: the leftover points go to the biggest remainders, the earlier one on a tie", () => {
    expect(roundShares([3, 1, 2, 1, 0])).toEqual([43, 14, 29, 14, 0]);
    expect(roundShares([1, 1, 1, 0, 0])).toEqual([34, 33, 33, 0, 0]);
    expect(roundShares([1, 1, 1, 1, 1])).toEqual([20, 20, 20, 20, 20]);
    expect(roundShares([2, 1, 1, 1, 0])).toEqual([40, 20, 20, 20, 0]);
  });
});
