import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { buildNewYearFacts, monthHeading, newyearPreviewFacts } from "./prompts/newyear";

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

  it("reads each 월건 against its 세운 by stems too (R2), calls a 월건 equal to the 세운 같은 간지 (R4), and leaves out the standard reading's monthly", () => {
    const rel = (i: number) => n.year.months[i]!.relationToYear.map((r) => `${r.type} ${r.members.join("-")}`);
    expect(rel(0)).toEqual(["해(害) 丑(1월 월건 지지)-午(丙午 세운 지지)", "천간합(天干合) 辛(1월 월건 천간)-丙(丙午 세운 천간)"]); // 辛丑 in 丙午
    expect(rel(1)).toEqual(["천간합(天干合) 壬(2월 월건 천간)-丁(丁未 세운 천간)"]); // 壬寅 in 丁未
    expect(rel(2)).toEqual(["반합(半合, 나무 기운) 卯(3월 월건 지지)-未(丁未 세운 지지)", "천간충(天干沖) 癸(3월 월건 천간)-丁(丁未 세운 천간)"]);
    expect(rel(6)).toEqual(["같은 간지 丁未(7월 월건)-丁未(丁未 세운)"]);
    expect(n.facts.monthly).toBeUndefined();
  });

  it("previews the 2027 세운's relations once each, without 같은 글자·같은 간지", () => {
    const line = (year: number, month: number, day: number) => newyearPreviewFacts(buildNewYearFacts(chart({ year, month, day })))[1];
    expect(line(1968, 1, 8)).toBe("내 명식과 · 충(沖), 형(刑), 천간충(天干沖)"); // 丁未 癸丑 丁丑: 같은 간지, two 丑, two 丁
    expect(line(1963, 5, 24)).toBe("내 명식과 · 반합(半合, 나무 기운), 천간충(天干沖)"); // 癸卯 丁巳 丁卯: two 卯, two 丁
    expect(line(1964, 2, 28)).toBe("내 명식과 · 따로 묶이거나 부딪히는 글자는 없어요"); // 甲辰 丙寅 丁未: 같은 간지 only
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
