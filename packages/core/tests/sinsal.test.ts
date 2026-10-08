import { describe, expect, it } from "vitest";
import { CHEONEUL, HAKDANG, MUNCHANG, SINSAL_NAMES, STEMS, TRINE_SINSAL, computeChart, sinsalOf } from "../src";
import type { Sinsal } from "../src";

// docs/superpowers/specs/2026-10-08-saju-enrichment-design.md §1
const base = { calendar: "solar" as const, gender: "female" as const, place: { name: "서울", longitude: 126.978 } };
const chartOf = (year: number, month: number, day: number, time: { hour: number; minute: number } | null) => computeChart({ ...base, year, month, day, time });
const gz = (p: { stem: string; branch: string } | null) => (p ? p.stem + p.branch : null);
const pillarsOf = (c: ReturnType<typeof chartOf>) => [gz(c.pillars.hour), gz(c.pillars.day), gz(c.pillars.month), gz(c.pillars.year)];
/** "역마: 연지辰→day寅, 일지寅→month申" */
const lines = (found: Sinsal[]) => found.map((s) => `${s.name}: ${s.hits.map((h) => `${h.basis}${h.basisGlyph}→${h.pillar}${h.branch}`).join(", ")}`);

describe("the tables are the spec's, word for word", () => {
  /** "甲戊庚→丑未 · 乙己→子申" → { 甲: "丑未", 戊: "丑未", … } */
  const byStems = (row: string) =>
    Object.fromEntries(row.split(" · ").flatMap((part) => {
      const [stems, branches] = part.split("→") as [string, string];
      return [...stems].map((stem) => [stem, branches]);
    }));
  /** "甲巳 乙午 …" → { 甲: "巳", 乙: "午", … } */
  const pairs = (row: string) => Object.fromEntries(row.split(" ").map((pair) => [pair.charAt(0), pair.charAt(1)]));

  it("천을귀인, 문창귀인, 학당귀인 by 일간", () => {
    expect(Object.fromEntries(STEMS.map((s) => [s, CHEONEUL[s]!.join("")]))).toEqual(byStems("甲戊庚→丑未 · 乙己→子申 · 丙丁→亥酉 · 辛→寅午 · 壬癸→卯巳"));
    expect(MUNCHANG).toEqual(pairs("甲巳 乙午 丙申 丁酉 戊申 己酉 庚亥 辛子 壬寅 癸卯"));
    expect(HAKDANG).toEqual(pairs("甲亥 乙午 丙寅 丁酉 戊寅 己酉 庚巳 辛子 壬申 癸卯"));
  });

  it("도화·역마·화개 by the 삼합 of 연지 or 일지", () => {
    const row = (name: "도화" | "역마" | "화개") => TRINE_SINSAL.map((t) => `${t.members}→${t[name]}`).join(" · ");
    expect(row("도화")).toBe("申子辰→酉 · 寅午戌→卯 · 巳酉丑→午 · 亥卯未→子");
    expect(row("역마")).toBe("申子辰→寅 · 寅午戌→申 · 巳酉丑→亥 · 亥卯未→巳");
    expect(row("화개")).toBe("申子辰→辰 · 寅午戌→戌 · 巳酉丑→丑 · 亥卯未→未");
  });
});

/**
 * Golden charts, each worked out by hand from the tables above (the engine gives the pillars). A hit is the target branch in
 * another visible pillar's 지지; the 일간's names search all four, a 연지 or 일지 name every pillar but its own.
 */
describe("sinsalOf on golden charts", () => {
  it("도비 (1988-08-15 10:22 서울 여): 문창·학당·역마·화개, no 천을귀인, no 도화", () => {
    const c = chartOf(1988, 8, 15, { hour: 10, minute: 22 });
    expect(pillarsOf(c)).toEqual(["甲辰", "壬寅", "庚申", "戊辰"]);
    // 壬: 천을 卯巳 (none of 辰寅申辰), 문창 寅 (일지), 학당 申 (월지). 연지 辰 (申子辰): 도화 酉 none, 역마 寅 (일지), 화개 辰 (시지; the
    // 연지 itself does not count). 일지 寅 (寅午戌): 도화 卯 none, 역마 申 (월지), 화개 戌 none.
    expect(lines(sinsalOf(c))).toEqual([
      "문창귀인: 일간壬→day寅",
      "학당귀인: 일간壬→month申",
      "역마: 연지辰→day寅, 일지寅→month申",
      "화개: 연지辰→hour辰",
    ]);
    expect(sinsalOf(c)[2]).toMatchObject({ name: "역마", basis: "연지", basisGlyph: "辰" });
  });

  it("도비 with the hour unknown: the hour pillar is not searched, so 화개 (시지 辰) goes and the rest stays", () => {
    const c = chartOf(1988, 8, 15, null);
    expect(pillarsOf(c)).toEqual([null, "壬寅", "庚申", "戊辰"]);
    expect(lines(sinsalOf(c))).toEqual(["문창귀인: 일간壬→day寅", "학당귀인: 일간壬→month申", "역마: 연지辰→day寅, 일지寅→month申"]);
  });

  it("1975-03-07 09:00: 천을귀인 twice, 도화 by 연지, 화개 by 일지", () => {
    const c = chartOf(1975, 3, 7, { hour: 9, minute: 0 });
    expect(pillarsOf(c)).toEqual(["甲辰", "壬子", "己卯", "乙卯"]);
    // 壬: 천을 卯巳 → 연지 卯, 월지 卯; 문창 寅, 학당 申 none. 연지 卯 (亥卯未): 도화 子 (일지), 역마 巳 none, 화개 未 none.
    // 일지 子 (申子辰): 도화 酉 none, 역마 寅 none, 화개 辰 (시지).
    expect(lines(sinsalOf(c))).toEqual(["천을귀인: 일간壬→year卯, 일간壬→month卯", "도화: 연지卯→day子", "화개: 일지子→hour辰"]);
  });

  it("1983-09-09 01:00: 문창귀인 on the 연지, 도화 by both bases (three places)", () => {
    const c = chartOf(1983, 9, 9, { hour: 1, minute: 0 });
    expect(pillarsOf(c)).toEqual(["丙子", "庚子", "辛酉", "癸亥"]);
    // 庚: 천을 丑未 none, 문창 亥 (연지), 학당 巳 none. 연지 亥 (亥卯未): 도화 子 (일지, 시지), 역마 巳 none, 화개 未 none.
    // 일지 子 (申子辰): 도화 酉 (월지), 역마 寅 none, 화개 辰 none.
    expect(lines(sinsalOf(c))).toEqual(["문창귀인: 일간庚→year亥", "도화: 연지亥→day子, 연지亥→hour子, 일지子→month酉"]);
  });

  it("1960-02-14 01:30: 학당귀인 on the 일지 itself, and a pillar both bases find counts once", () => {
    const c = chartOf(1960, 2, 14, { hour: 1, minute: 30 });
    expect(pillarsOf(c)).toEqual(["辛丑", "壬申", "戊寅", "庚子"]);
    // 壬: 천을 卯巳 none, 문창 寅 (월지), 학당 申 (일지: the 일간's names search every pillar). 연지 子 and 일지 申 are both 申子辰:
    // 역마 寅 is the 월지 by either, so once (by 연지); 도화 酉 and 화개 辰 none.
    expect(lines(sinsalOf(c))).toEqual(["문창귀인: 일간壬→month寅", "학당귀인: 일간壬→day申", "역마: 연지子→month寅"]);
  });

  it("1995-07-05 02:30: all six names (the 일지 酉 holds the three 귀인; 역마 by 일지 lands on the 연지)", () => {
    const c = chartOf(1995, 7, 5, { hour: 2, minute: 30 });
    expect(pillarsOf(c)).toEqual(["辛丑", "丁酉", "壬午", "乙亥"]);
    // 丁: 천을 亥酉 → 연지 亥, 일지 酉; 문창 酉, 학당 酉 → 일지. 연지 亥 (亥卯未): 子·巳·未 none. 일지 酉 (巳酉丑): 도화 午 (월지),
    // 역마 亥 (연지), 화개 丑 (시지).
    expect(lines(sinsalOf(c))).toEqual([
      "천을귀인: 일간丁→year亥, 일간丁→day酉",
      "문창귀인: 일간丁→day酉",
      "학당귀인: 일간丁→day酉",
      "도화: 일지酉→month午",
      "역마: 일지酉→year亥",
      "화개: 일지酉→hour丑",
    ]);
    expect(sinsalOf(c).map((s) => s.name)).toEqual([...SINSAL_NAMES]);
  });

  it("1987-09-09 09:30: no name at all", () => {
    const c = chartOf(1987, 9, 9, { hour: 9, minute: 30 });
    expect(pillarsOf(c)).toEqual(["壬辰", "辛酉", "己酉", "丁卯"]);
    // 辛: 천을 寅午, 문창 子, 학당 子 none of 辰酉酉卯. 연지 卯 (亥卯未): 子·巳·未 none. 일지 酉 (巳酉丑): 午·亥·丑 none.
    expect(sinsalOf(c)).toEqual([]);
  });
});
