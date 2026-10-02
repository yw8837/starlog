import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { buildNewYearFacts, monthHeading } from "./prompts/newyear";

const chart = (extra: Partial<typeof DEFAULT_SAJU_FORM> = {}) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...extra }));

describe("2027 facts", () => {
  // Month pillars and 절입 from manseryeok 2.0.0 (getSolarTermsOfYear(2027), calculateFourPillars on the 15th), checked 2026-10-01.
  const n = buildNewYearFacts(chart({ year: 1993, month: 8, day: 17, timeKnown: true, hour: 7, minute: 20, gender: "male", placeId: "busan" }));

  it("reads the 2027 세운 as 丁未 and January as still 丙午", () => {
    expect(n.facts.annual).toMatchObject({ year: 2027, gz: "丁未" });
    expect(n.year.january.gz).toBe("丙午");
    expect(n.year.months.map((m) => m.gz)).toEqual(["辛丑", "壬寅", "癸卯", "甲辰", "乙巳", "丙午", "丁未", "戊申", "己酉", "庚戌", "辛亥", "壬子"]);
    expect(n.year.months[0]!.yearGz).toBe("丙午");
    expect(n.year.months[1]!.yearGz).toBe("丁未");
  });

  it("takes each month's opening 절 from the engine, in KST", () => {
    expect(n.year.months[1]!.term).toEqual({ name: "입춘", kst: "2월 4일 10:46" });
    expect(n.year.months[2]!.term?.name).toBe("경칩");
    expect(n.year.months.map((m) => m.term?.kst.replace(/ \d\d:\d\d$/, ""))).toEqual([
      "1월 5일", "2월 4일", "3월 6일", "4월 5일", "5월 6일", "6월 6일", "7월 7일", "8월 8일", "9월 8일", "10월 8일", "11월 8일", "12월 7일",
    ]);
    expect(monthHeading(n.year.months[0]!, n.year.january)).toBe("1월 · 신축월 (아직 병오년, 입춘 전)");
    expect(monthHeading(n.year.months[1]!, n.year.january)).toBe("2월 · 임인월 (4일 입춘부터 정미년)");
    expect(monthHeading(n.year.months[11]!, n.year.january)).toBe("12월 · 임자월 (7일 대설부터)");
  });

  it("gives every month its ten gods relative to the day master", () => {
    for (const m of n.year.months) {
      expect(m.stemTenGod).toMatch(/^(비견|겁재|식신|상관|편재|정재|편관|정관|편인|정인)$/);
      expect(m.display).toBe(`${m.ko}(${m.gz})`);
    }
  });

  it("picks the least element for the light lucky suggestion, without numbers or directions", () => {
    const counts = chart({ year: 1993, month: 8, day: 17, timeKnown: true, hour: 7, minute: 20, gender: "male", placeId: "busan" }).elements;
    expect(counts[n.year.lucky.elementKey]).toBe(Math.min(...Object.values(counts)));
    expect(JSON.stringify(n.year.lucky)).not.toMatch(/번호|로또|동쪽|서쪽|남쪽|북쪽/);
  });

  it("allows 2026–2028 and every month glyph", () => {
    expect(n.allowed.years).toEqual(expect.arrayContaining([2026, 2027, 2028]));
    expect(n.allowed.glyphs).toEqual(expect.arrayContaining(["丙", "午", "丁", "未", "壬", "寅", "子"]));
  });

  it("works without a birth time", () => {
    const unknown = buildNewYearFacts(chart());
    expect(unknown.facts.input.timeKnown).toBe(false);
    expect(unknown.year.months).toHaveLength(12);
  });
});
