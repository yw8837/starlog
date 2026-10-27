import { BRANCHES, STEMS, computeChart, type SajuInput } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { ILJU, KEYWORD_PATH, iljuByHanja, iljuBySlug, iljuOfBirth, keywordPath } from "./keyword2027";
import { sitemapEntriesFor } from "./seo";

/**
 * 2027년 나의 키워드 (free test ②): the 일주 from a birth date, by the app's own 만세력 with the time unknown
 * (the rule the saju flow and 별자리 인연 use), and the 60 slugs the result pages live at.
 */

/**
 * An oracle apart from the engine: the 60-day cycle runs unbroken, and 1970-01-01 was 辛巳 (index 17), so a civil
 * day's 일진 is (days since 1970-01-01 + 17) mod 60. Checked by hand against 2000-01-01 戊午 and 1900-01-01 甲戌.
 */
function civilDayPillar(year: number, month: number, day: number): string {
  const days = Date.UTC(year, month - 1, day) / 86_400_000;
  const i = (((days + 17) % 60) + 60) % 60;
  return STEMS[i % 10]! + BRANCHES[i % 12]!;
}

const SEOUL = { name: "서울", longitude: 126.978 };
const TODAY = { year: 2026, month: 10, day: 22 };
const solar = (year: number, month: number, day: number) => ({ calendar: "solar" as const, year, month, day, isLeapMonth: false });
const hanjaOf = (result: ReturnType<typeof iljuOfBirth>) => ("ilju" in result ? result.ilju.hanja : result.error);
const chartAt = (date: { year: number; month: number; day: number }, time: SajuInput["time"]) =>
  computeChart({ calendar: "solar", ...date, time, gender: "female", place: SEOUL });

describe("the 60 일주", () => {
  it("run in the order of the 60-day cycle, each once, from 甲子 to 癸亥", () => {
    expect(ILJU).toHaveLength(60);
    expect(ILJU[0]).toMatchObject({ hanja: "甲子", ko: "갑자", slug: "gap-ja" });
    expect(ILJU[59]).toMatchObject({ hanja: "癸亥", ko: "계해", slug: "gye-hae" });
    expect(new Set(ILJU.map((i) => i.hanja)).size).toBe(60);
    for (const [n, ilju] of ILJU.entries()) expect(ilju.hanja).toBe(STEMS[n % 10]! + BRANCHES[n % 12]!);
  });

  it("each has its own lower-case romanized slug, read back the same way", () => {
    const slugs = ILJU.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(60);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z]+-[a-z]+$/);
    for (const ilju of ILJU) {
      expect(iljuBySlug(ilju.slug)).toBe(ilju);
      expect(iljuByHanja(ilju.hanja)).toBe(ilju);
      expect(keywordPath(ilju)).toBe(`${KEYWORD_PATH}/${ilju.slug}`);
    }
    expect(KEYWORD_PATH).toBe("/2027-keyword");
    expect(iljuBySlug("GAP-JA")).toBeNull();
    expect(iljuBySlug("gap-chuk")).toBeNull();
  });
});

describe("the 일주 of a birth date", () => {
  it("is the civil date's 일진 for known dates", () => {
    expect(hanjaOf(iljuOfBirth(solar(2000, 1, 1), TODAY))).toBe("戊午");
    expect(hanjaOf(iljuOfBirth(solar(1900, 1, 1), TODAY))).toBe("甲戌");
    expect(civilDayPillar(2000, 1, 1)).toBe("戊午");
    expect(civilDayPillar(1900, 1, 1)).toBe("甲戌");
  });

  it("agrees with the 60-day oracle across 1900–2026", () => {
    const misses: string[] = [];
    for (let t = Date.UTC(1900, 0, 1); t <= Date.UTC(2026, 9, 21); t += 211 * 86_400_000) {
      const d = new Date(t);
      const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      const got = hanjaOf(iljuOfBirth(solar(y, m, day), TODAY));
      if (got !== civilDayPillar(y, m, day)) misses.push(`${y}-${m}-${day}: ${got}`);
    }
    expect(misses).toEqual([]);
  });

  it("reads a lunar date (윤달 too) through its solar day", () => {
    // 음력 1990-01-01 is 양력 1990-01-27; 음력 2020 윤4월 1일 is 양력 2020-05-23.
    expect(hanjaOf(iljuOfBirth({ calendar: "lunar", year: 1990, month: 1, day: 1, isLeapMonth: false }, TODAY))).toBe(civilDayPillar(1990, 1, 27));
    expect(hanjaOf(iljuOfBirth({ calendar: "lunar", year: 2020, month: 4, day: 1, isLeapMonth: true }, TODAY))).toBe(civilDayPillar(2020, 5, 23));
    expect(hanjaOf(iljuOfBirth({ calendar: "lunar", year: 2020, month: 4, day: 1, isLeapMonth: false }, TODAY))).toBe(civilDayPillar(2020, 4, 23));
  });

  it("follows the app's rule around midnight: with the time unknown the date decides, as the saju flow reads it", () => {
    const date = { year: 1995, month: 3, day: 14 };
    const own = hanjaOf(iljuOfBirth(solar(1995, 3, 14), TODAY));
    const unknown = chartAt(date, null);
    expect(own).toBe(unknown.pillars.day.stem + unknown.pillars.day.branch);
    // The saju flow names the minutes after 00:00 that the 서울 clock (LMT, about 32 minutes) reads as the day before.
    expect(unknown.warnings.find((w) => w.code === "DAY_PILLAR_WINDOW")?.window).toMatchObject({ from: "00:00" });
    // A time-known birth: the 23:00 hour keeps this date's 일주 (SPLIT_NEXT_DAY_STEM); 00:10 is still the day before.
    const late = chartAt(date, { hour: 23, minute: 30 });
    const early = chartAt(date, { hour: 0, minute: 10 });
    expect(late.pillars.day.stem + late.pillars.day.branch).toBe(own);
    expect(early.pillars.day.stem + early.pillars.day.branch).toBe(civilDayPillar(1995, 3, 13));
  });

  it("is not moved by a 절기: on 입춘 day the year pillar is open, the 일주 is the date's", () => {
    const chart = chartAt({ year: 2024, month: 2, day: 4 }, null);
    expect(chart.ambiguous.map((a) => a.pillar)).toContain("year");
    expect(hanjaOf(iljuOfBirth(solar(2024, 2, 4), TODAY))).toBe(civilDayPillar(2024, 2, 4));
    expect(civilDayPillar(2024, 2, 4)).toBe("戊戌");
  });

  it("refuses a day after today and a lunar day that does not exist, with the saju form's words", () => {
    expect(iljuOfBirth(solar(2026, 10, 23), TODAY)).toEqual({ error: "오늘 이후의 날짜는 고를 수 없어요." });
    expect(hanjaOf(iljuOfBirth(solar(2026, 10, 22), TODAY))).toBe(civilDayPillar(2026, 10, 22));
    // 2021 has no 윤1월.
    expect(iljuOfBirth({ calendar: "lunar", year: 2021, month: 1, day: 1, isLeapMonth: true }, TODAY)).toEqual({
      error: "음력으로는 없는 날짜예요. 평달·윤달과 날짜를 다시 확인해 주세요.",
    });
  });
});

describe("the sitemap", () => {
  it("lists the test alone on the app host: its 60 result pages are noindex (Search Console: thin duplicates), so not listed", () => {
    const paths = sitemapEntriesFor("app").map((e) => e.path).filter((p) => p === KEYWORD_PATH || p.startsWith(`${KEYWORD_PATH}/`));
    expect(paths).toEqual([KEYWORD_PATH]);
    for (const ilju of ILJU) expect(paths).not.toContain(keywordPath(ilju));
    expect(sitemapEntriesFor("guide").some((e) => e.path.startsWith(KEYWORD_PATH))).toBe(false);
  });
});
