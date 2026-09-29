import { describe, it, expect } from "vitest";
import manseryeokPkg from "manseryeok/package.json";
import { getSolarTerm } from "manseryeok";
import { computeChart, DEFAULT_POLICY, SEOUL, SajuError, koreaCivilOffsetAt } from "../src";
import type { SajuChart, SajuInput, SajuPolicy, SajuErrorCode } from "../src";

const base = { calendar: "solar" as const, gender: "female" as const, place: { name: "서울", longitude: 126.98 } };

// Brief tests (values verified with lunar-javascript 1.7.7; they hold under manseryeok + saju-policy@1 as well).
describe("computeChart (brief)", () => {
  it("1990-01-01 12:00 → 己巳 丙子 丙寅, day master 병화", () => {
    const c = computeChart({ ...base, year: 1990, month: 1, day: 1, time: { hour: 12, minute: 0 } });
    expect([c.pillars.year.stem + c.pillars.year.branch, c.pillars.month.stem + c.pillars.month.branch, c.pillars.day.stem + c.pillars.day.branch]).toEqual(["己巳", "丙子", "丙寅"]);
    expect(c.dayMaster.ko).toBe("병화");
    expect(c.pillars.month.branchGod).toBe("정관");
    expect(c.pillars.year.stemGod).toBe("상관");
  });
  it("unknown time leaves the hour pillar empty and counts 6 visible characters", () => {
    const c = computeChart({ ...base, year: 1990, month: 1, day: 1, time: null });
    expect(c.pillars.hour).toBeNull();
    expect(Object.values(c.elements).reduce((a, b) => a + b, 0)).toBe(6);
    expect(c.elements).toEqual({ 목: 1, 화: 3, 토: 1, 금: 0, 수: 1 });
    expect(c.notes.join(" ")).toContain("시주");
  });
  it("unknown time does not silently use noon: day pillar still from the date, hour null", () => {
    const c = computeChart({ ...base, year: 1996, month: 3, day: 21, time: null });
    expect(c.pillars.hour).toBeNull();
  });
  it("female born in a yin year runs luck forward", () => {
    const c = computeChart({ ...base, year: 1990, month: 1, day: 1, time: { hour: 12, minute: 0 } });
    expect(c.luck.forward).toBe(true);
    expect(c.luck.pillars.slice(0, 4).map(p => p.ganzhi)).toEqual(["丁丑", "戊寅", "己卯", "庚辰"]);
  });
  it("lunar input converts (1989-12-05 lunar = 1990-01-01 solar)", () => {
    const c = computeChart({ ...base, calendar: "lunar", year: 1989, month: 12, day: 5, time: null });
    expect(c.solarDate).toBe("1990-01-01");
  });
  it("exposes the policy version used", () => { expect(computeChart({ ...base, year: 2000, month: 1, day: 1, time: null }).policy.version).toBe(DEFAULT_POLICY.version); });
});

// ---------------------------------------------------------------------------------------------
// docs/research/saju-engine-eval.md §9 golden tables. Expectations are copied from the doc; do not
// edit them to match engine output.
// ---------------------------------------------------------------------------------------------

const PROFILES = {
  R: { ...DEFAULT_POLICY, clock: "WALL", applyHistoricalDst: false },
  D: DEFAULT_POLICY,
  DU: { ...DEFAULT_POLICY, jasi: "DAY_CHANGES_AT_23" },
  DL: { ...DEFAULT_POLICY, clock: "LAT" },
} satisfies Record<string, SajuPolicy>;
type ProfileId = keyof typeof PROFILES;

const four = (c: SajuChart) =>
  [c.pillars.year, c.pillars.month, c.pillars.day, c.pillars.hour].map(p => (p ? p.stem + p.branch : "null")).join(" ");

function solarAt(ymd: string, hm: string | null, gender: "female" | "male" = "female"): SajuInput {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const time = hm === null ? null : { hour: Number(hm.slice(0, 2)), minute: Number(hm.slice(3, 5)) };
  return { calendar: "solar", year: y, month: m, day: d, time, gender, place: SEOUL };
}

function sajuErrorCode(fn: () => unknown): SajuErrorCode | "no error" | "not a SajuError" {
  try { fn(); return "no error"; } catch (e) { return e instanceof SajuError ? e.code : "not a SajuError"; }
}

describe("policy defaults (saju-policy@1, profile D)", () => {
  it("pins the research-recommended defaults", () => {
    expect(DEFAULT_POLICY).toEqual({
      version: "saju-policy@1", clock: "LMT", jasi: "SPLIT_NEXT_DAY_STEM", applyHistoricalDst: true,
      termBoundaryWarnSeconds: 120, hourBoundaryWarnMinutes: 2,
    });
    expect(SEOUL.longitude).toBe(126.978);
  });
  it("records the engine that computed the chart, and the installed engine is exactly that version", () => {
    expect(computeChart(solarAt("1990-01-01", "12:00")).engine).toBe("manseryeok@2.0.0");
    expect(manseryeokPkg.version).toBe("2.0.0");
  });
});

// [id, KST wall clock "YYYY-MM-DD HH:mm", R, D, DU, DL]
const GOLDEN: [string, string, string, string, string, string][] = [
  ["G01", "1990-01-01 12:00", "己巳 丙子 丙寅 甲午", "己巳 丙子 丙寅 甲午", "己巳 丙子 丙寅 甲午", "己巳 丙子 丙寅 甲午"],
  ["G02", "1990-01-05 22:00", "己巳 丙子 庚午 丁亥", "己巳 丙子 庚午 丁亥", "己巳 丙子 庚午 丁亥", "己巳 丙子 庚午 丁亥"],
  ["G03", "1990-01-05 23:00", "己巳 丙子 庚午 戊子", "己巳 丙子 庚午 丁亥", "己巳 丙子 庚午 丁亥", "己巳 丙子 庚午 丁亥"],
  ["G04", "1990-01-05 23:40", "己巳 丁丑 庚午 戊子", "己巳 丁丑 庚午 戊子", "己巳 丁丑 辛未 戊子", "己巳 丁丑 庚午 戊子"],
  ["G05", "2000-02-04 20:00", "己卯 丁丑 壬辰 庚戌", "己卯 丁丑 壬辰 庚戌", "己卯 丁丑 壬辰 庚戌", "己卯 丁丑 壬辰 庚戌"],
  ["G06", "2000-02-04 21:00", "己卯 丁丑 壬辰 辛亥", "己卯 丁丑 壬辰 庚戌", "己卯 丁丑 壬辰 庚戌", "己卯 丁丑 壬辰 庚戌"],
  ["G07", "2000-02-04 21:45", "庚辰 戊寅 壬辰 辛亥", "庚辰 戊寅 壬辰 辛亥", "庚辰 戊寅 壬辰 辛亥", "庚辰 戊寅 壬辰 庚戌"],
  ["G08", "1988-05-10 01:30", "戊辰 丁巳 乙丑 丁丑", "戊辰 丁巳 甲子 丙子", "戊辰 丁巳 乙丑 丙子", "戊辰 丁巳 乙丑 丙子"],
  ["G09", "1996-03-21 23:20", "丙子 辛卯 丁巳 壬子", "丙子 辛卯 丁巳 辛亥", "丙子 辛卯 丁巳 辛亥", "丙子 辛卯 丁巳 辛亥"],
  ["G10", "2023-04-05 08:00", "癸卯 乙卯 癸巳 丙辰", "癸卯 乙卯 癸巳 丙辰", "癸卯 乙卯 癸巳 丙辰", "癸卯 乙卯 癸巳 丙辰"],
  ["G11", "2023-04-05 12:00", "癸卯 丙辰 癸巳 戊午", "癸卯 丙辰 癸巳 戊午", "癸卯 丙辰 癸巳 戊午", "癸卯 丙辰 癸巳 戊午"],
  ["G12", "2026-09-30 00:10", "丙午 丁酉 丁未 庚子", "丙午 丁酉 丙午 庚子", "丙午 丁酉 丁未 庚子", "丙午 丁酉 丙午 庚子"],
  ["G13", "2024-02-04 17:26", "癸卯 乙丑 戊戌 辛酉", "癸卯 乙丑 戊戌 庚申", "癸卯 乙丑 戊戌 庚申", "癸卯 乙丑 戊戌 庚申"],
  ["G14", "2024-02-04 17:28", "甲辰 丙寅 戊戌 辛酉", "甲辰 丙寅 戊戌 庚申", "甲辰 丙寅 戊戌 庚申", "甲辰 丙寅 戊戌 庚申"],
  ["G15", "1987-07-01 00:40", "丁卯 丙午 辛亥 戊子", "丁卯 丙午 庚戌 戊子", "丁卯 丙午 辛亥 戊子", "丁卯 丙午 庚戌 戊子"],
  ["G16", "1960-06-01 13:20", "庚子 辛巳 庚申 癸未", "庚子 辛巳 庚申 壬午", "庚子 辛巳 庚申 壬午", "庚子 辛巳 庚申 壬午"],
  ["G17", "1958-01-15 00:50", "丁酉 癸丑 壬辰 庚子", "丁酉 癸丑 壬辰 庚子", "丁酉 癸丑 壬辰 庚子", "丁酉 癸丑 壬辰 庚子"],
  ["G18", "1950-07-01 00:30", "庚寅 壬午 丁酉 庚子", "庚寅 壬午 丙申 己亥", "庚寅 壬午 丙申 己亥", "庚寅 壬午 丙申 己亥"],
  ["G19", "2000-05-15 23:31", "庚辰 辛巳 癸酉 甲子", "庚辰 辛巳 癸酉 癸亥", "庚辰 辛巳 癸酉 癸亥", "庚辰 辛巳 癸酉 甲子"],
  ["G20", "2024-03-10 23:30", "甲辰 丁卯 癸酉 甲子", "甲辰 丁卯 癸酉 癸亥", "甲辰 丁卯 癸酉 癸亥", "甲辰 丁卯 癸酉 癸亥"],
];

describe("§9 golden four pillars (R / D / DU / DL)", () => {
  const rows = GOLDEN.flatMap(([id, at, ...byProfile]) =>
    (["R", "D", "DU", "DL"] as const).map((p, i) => ({ id, at, profile: p as ProfileId, expected: byProfile[i]! })));
  it.each(rows)("$id $at [$profile] → $expected", ({ at, profile, expected }) => {
    const [ymd, hm] = at.split(" ") as [string, string];
    expect(four(computeChart(solarAt(ymd, hm), PROFILES[profile]))).toBe(expected);
  });

  const allProfiles = Object.keys(PROFILES) as ProfileId[];
  it.each(allProfiles)("G11u 음력 2023 윤2-15, time unknown [%s]: month ambiguous at 10:13 (청명)", profile => {
    const c = computeChart({ ...base, place: SEOUL, calendar: "lunar", year: 2023, month: 2, day: 15, isLeapMonth: true, time: null }, PROFILES[profile]);
    expect(c.solarDate).toBe("2023-04-05");
    expect(c.pillars.year.stem + c.pillars.year.branch).toBe("癸卯");
    expect(c.pillars.day.stem + c.pillars.day.branch).toBe("癸巳");
    expect(c.pillars.hour).toBeNull();
    expect(c.ambiguous).toEqual([{ pillar: "month", candidates: ["乙卯", "丙辰"], switchesAtKST: "10:13" }]);
    // The shown month is the candidate that holds for most of the civil day (10:13 → 丙辰); ambiguous[] is the contract.
    expect(c.pillars.month.stem + c.pillars.month.branch).toBe("丙辰");
  });
  it.each(allProfiles)("G21 1970-06-15, time unknown [%s] → 庚戌 壬午 丙寅 null, no ambiguity", profile => {
    const c = computeChart(solarAt("1970-06-15", null), PROFILES[profile]);
    expect(four(c)).toBe("庚戌 壬午 丙寅 null");
    expect(c.ambiguous).toEqual([]);
  });
});

describe("§9 lunar conversion golden (KASI)", () => {
  const LUNAR: [string, number, number, number, boolean, string][] = [
    ["L1", 2023, 2, 15, true, "2023-04-05"],
    ["L2", 2023, 2, 15, false, "2023-03-06"],
    ["L3", 2017, 5, 15, true, "2017-07-08"],
    ["L4", 2017, 6, 15, false, "2017-08-06"],
    ["L5", 1997, 1, 1, false, "1997-02-08"],
    ["L7", 2020, 4, 1, true, "2020-05-23"],
  ];
  it.each(LUNAR)("%s 음력 %i-%i-%i (윤 %s) → %s", (_id, year, month, day, isLeapMonth, solar) => {
    const c = computeChart({ ...base, calendar: "lunar", year, month, day, isLeapMonth, time: null });
    expect(c.solarDate).toBe(solar);
  });
  it("L6 음력 2017 윤6-15 does not exist → INVALID_LUNAR_DATE", () => {
    expect(sajuErrorCode(() => computeChart({ ...base, calendar: "lunar", year: 2017, month: 6, day: 15, isLeapMonth: true, time: null })))
      .toBe("INVALID_LUNAR_DATE");
  });
  it("shows the lunar date next to the solar date, with the leap-month marker", () => {
    expect(computeChart({ ...base, calendar: "lunar", year: 2023, month: 2, day: 15, isLeapMonth: true, time: null }).lunarDate).toBe("2023-윤02-15");
    expect(computeChart(solarAt("1990-01-01", null)).lunarDate).toBe("1989-12-05");
  });
});

describe("§9 절입 moments (manseryeok table vs JPL DE441, ±60 s)", () => {
  // [name, year, manseryeok term index, JPL instant in KST]
  const TERMS: [string, number, number, string][] = [
    ["1990 소한", 1990, 0, "1990-01-05T23:33:14+09:00"],
    ["2000 입춘", 2000, 2, "2000-02-04T21:40:23+09:00"],
    ["2024 입춘", 2024, 2, "2024-02-04T17:27:08+09:00"],
    ["2023 입춘", 2023, 2, "2023-02-04T11:42:34+09:00"],
    ["2023 청명", 2023, 6, "2023-04-05T10:13:04+09:00"],
    ["2024 경칩", 2024, 4, "2024-03-05T11:22:47+09:00"],
    ["1988 입하", 1988, 8, "1988-05-05T16:01:44+09:00"],
    ["1996 경칩", 1996, 4, "1996-03-05T16:09:37+09:00"],
    ["2026 백로", 2026, 16, "2026-09-07T23:41:18+09:00"],
    ["2026 한로", 2026, 18, "2026-10-08T15:29:18+09:00"],
  ];
  it.each(TERMS)("%s", (_name, year, index, jpl) => {
    expect(Math.abs(getSolarTerm(year, index).date.getTime() - Date.parse(jpl))).toBeLessThanOrEqual(60_000);
  });
});

describe("§9 civil-time exceptions (P8)", () => {
  it.each(["1987-05-10 02:30", "1988-05-08 02:30"])("%s was skipped by the DST jump → NONEXISTENT_CIVIL_TIME", at => {
    const [ymd, hm] = at.split(" ") as [string, string];
    expect(sajuErrorCode(() => computeChart(solarAt(ymd, hm)))).toBe("NONEXISTENT_CIVIL_TIME");
  });
  it.each([
    ["1987-10-11 02:30", "1987-10-10T16:30:00.000Z"],
    ["1988-10-09 02:30", "1988-10-08T16:30:00.000Z"],
  ])("%s happened twice → read as DST (the earlier one) with AMBIGUOUS_CIVIL_TIME", (at, instant) => {
    const [ymd, hm] = at.split(" ") as [string, string];
    const c = computeChart(solarAt(ymd, hm));
    expect(c.instantUTC).toBe(instant);
    expect(c.warnings.map(w => w.code)).toContain("AMBIGUOUS_CIVIL_TIME");
  });
  it("also rejects the skipped hour when 1948–60 DST started at midnight", () => {
    expect(sajuErrorCode(() => computeChart(solarAt("1955-05-05", "00:30")))).toBe("NONEXISTENT_CIVIL_TIME");
    expect(computeChart(solarAt("1955-05-05", "01:00")).instantUTC).toBe("1955-05-04T15:30:00.000Z");
  });
  it("profile R (no DST table) does not reject or flag anything", () => {
    const c = computeChart(solarAt("1987-05-10", "02:30"), PROFILES.R);
    expect(c.instantUTC).toBe("1987-05-09T17:30:00.000Z");
    expect(c.warnings).toEqual([]);
  });
});

describe("§9 대운 golden (P9: round, min 1)", () => {
  const DY: [string, string, "male" | "female", boolean, number, { years: number; months: number; days: number } | null, string][] = [
    ["DY1", "1990-01-01 12:00", "male", false, 8, { years: 8, months: 3, days: 28 }, "乙亥"],
    ["DY2", "1990-01-01 12:00", "female", true, 1, { years: 1, months: 5, days: 28 }, "丁丑"],
    ["DY3", "2000-02-04 21:00", "male", false, 10, null, "丙子"],
    ["DY4", "1988-05-10 01:30", "male", true, 9, null, "戊午"],
  ];
  it.each(DY)("%s %s %s", (_id, at, gender, forward, startAge, start, first) => {
    const [ymd, hm] = at.split(" ") as [string, string];
    const c = computeChart(solarAt(ymd, hm, gender));
    expect(c.luck.forward).toBe(forward);
    expect(c.luck.startAge).toBe(startAge);
    if (start) expect(c.luck.start).toEqual(start);
    expect(c.luck.pillars[0]).toEqual({ ganzhi: first, ko: expect.any(String), startAge });
    expect(c.luck.pillars[1]!.startAge).toBe(startAge + 10);
  });
  it("time unknown: direction only when the year pillar is certain, no 대운수", () => {
    const c = computeChart(solarAt("1990-01-01", null));
    expect(c.luck.forward).toBe(true);
    expect(c.luck.startAge).toBeNull();
    expect(c.luck.start).toBeNull();
    expect(c.luck.pillars.slice(0, 4).map(p => [p.ganzhi, p.startAge])).toEqual([["丁丑", null], ["戊寅", null], ["己卯", null], ["庚辰", null]]);
  });
  it("time unknown on 입춘 day: year and month both ambiguous, so no luck direction or pillars", () => {
    const c = computeChart(solarAt("2024-02-04", null));
    expect(c.ambiguous).toEqual([
      { pillar: "year", candidates: ["癸卯", "甲辰"], switchesAtKST: "17:27" },
      { pillar: "month", candidates: ["乙丑", "丙寅"], switchesAtKST: "17:27" },
    ]);
    expect(four(c)).toBe("癸卯 乙丑 戊戌 null"); // 00:00–17:26 is the longer part of the day
    expect(c.luck).toEqual({ forward: null, startAge: null, start: null, pillars: [] });
  });
});

describe("provenance, corrections and warnings (P3, P10, P12, P13)", () => {
  it("records instant, corrected clock and the 절 that opened the month", () => {
    const c = computeChart(solarAt("1990-01-01", "12:00"));
    expect(c.instantUTC).toBe("1990-01-01T03:00:00.000Z");
    expect(c.correctedLocalTime).toBe("11:27");
    expect(c.correctionMinutes).toBe(-32.1);
    expect(c.monthStartTerm).toEqual({ name: "대설", hanja: "大雪", instantUTC: "1989-12-07T03:21:00.000Z" });
    expect(c.notes).toContain("경도 보정으로 32분 앞당겨 계산했어요 (보정 시각 11:27)");
    expect(c.warnings).toEqual([]);
    expect(c.ambiguous).toEqual([]);
  });
  it("explains DST and a corrected time that falls on the previous day", () => {
    const c = computeChart(solarAt("1988-05-10", "01:30"));
    expect(c.instantUTC).toBe("1988-05-09T15:30:00.000Z");
    expect(c.correctedLocalTime).toBe("23:57");
    expect(c.notes).toEqual([
      "서머타임 기간이라 1시간 빼서 계산했어요",
      "경도 보정으로 32분 앞당겨 계산했어요 (보정 시각 전날 23:57)",
    ]);
  });
  it("explains the UTC+8:30 era", () => {
    const c = computeChart(solarAt("1958-01-15", "00:50"));
    expect(c.instantUTC).toBe("1958-01-14T16:20:00.000Z");
    expect(c.notes).toEqual(["당시 표준시(UTC+8:30) 기준으로 계산했어요", "경도 보정으로 2분 앞당겨 계산했어요 (보정 시각 00:47)"]);
  });
  it("time unknown: no instant or corrected clock, and the fixed note", () => {
    const c = computeChart(solarAt("1990-01-01", null));
    expect([c.instantUTC, c.correctedLocalTime, c.correctionMinutes]).toEqual([null, null, null]);
    expect(c.notes).toEqual(["태어난 시를 몰라 시주를 비웠어요. 시주가 다루는 해석은 하지 않아요."]);
  });
  it("warns within 120 s of a 절 (G13: 17:26 vs 입춘 17:27)", () => {
    const c = computeChart(solarAt("2024-02-04", "17:26"));
    expect(c.warnings.map(w => w.code)).toEqual(["TERM_BOUNDARY"]);
    expect(c.warnings[0]!.message).toContain("입춘");
    expect(computeChart(solarAt("2024-02-04", "17:24")).warnings).toEqual([]);
  });
  it("warns within 2 min of a 시진 boundary on the corrected clock (G19 D: 22:58:55)", () => {
    const c = computeChart(solarAt("2000-05-15", "23:31"));
    expect(c.correctedLocalTime).toBe("22:58");
    expect(c.warnings.map(w => w.code)).toEqual(["HOUR_BOUNDARY"]);
    expect(computeChart(solarAt("2024-03-10", "23:30")).warnings).toEqual([]); // 22:57:55 is 125 s away
  });
  it("before 1908-04-01 reads the input as birthplace local mean time and warns", () => {
    const c = computeChart(solarAt("1900-01-01", "12:00"));
    expect(c.instantUTC).toBe("1900-01-01T03:32:05.280Z");
    expect(c.correctedLocalTime).toBe("12:00");
    expect(c.warnings.map(w => w.code)).toEqual(["PRE_1908"]);
    expect(c.notes).toEqual([]);
  });
  it("ERA_STANDARD drops DST only; FIXED_127_5 is the classic −30 min", () => {
    const era = { ...DEFAULT_POLICY, clock: "ERA_STANDARD" } satisfies SajuPolicy;
    expect(four(computeChart(solarAt("1958-01-15", "00:50"), era))).toBe("丁酉 癸丑 壬辰 庚子");
    const g16 = computeChart(solarAt("1960-06-01", "13:20"), era);
    expect([g16.correctedLocalTime, g16.pillars.hour!.stem + g16.pillars.hour!.branch]).toEqual(["12:20", "壬午"]);
    const fixed = computeChart(solarAt("1990-01-01", "12:00"), { ...DEFAULT_POLICY, clock: "FIXED_127_5" });
    expect([fixed.correctedLocalTime, fixed.correctionMinutes]).toEqual(["11:30", -30]);
  });
});

describe("input errors", () => {
  it("OUT_OF_RANGE outside 1800-01-01..2100-12-31", () => {
    expect(sajuErrorCode(() => computeChart(solarAt("1799-12-31", "12:00")))).toBe("OUT_OF_RANGE");
    expect(sajuErrorCode(() => computeChart(solarAt("2101-01-01", "12:00")))).toBe("OUT_OF_RANGE");
    expect(sajuErrorCode(() => computeChart(solarAt("2100-12-31", null)))).toBe("no error");
    expect(sajuErrorCode(() => computeChart({ ...base, calendar: "lunar", year: 1799, month: 1, day: 1, time: null }))).toBe("OUT_OF_RANGE");
    expect(sajuErrorCode(() => computeChart({ ...base, calendar: "lunar", year: 1799, month: 12, day: 20, time: null }))).toBe("no error"); // = 1800-01-14
  });
  it("UNSUPPORTED_PLACE for births outside Korea (P11 is not in this release)", () => {
    expect(sajuErrorCode(() => computeChart({ ...solarAt("1990-01-01", "12:00"), place: { name: "New York", longitude: -74.006 } }))).toBe("UNSUPPORTED_PLACE");
    expect(sajuErrorCode(() => computeChart({ ...solarAt("1990-01-01", "12:00"), place: { name: "도쿄", longitude: 139.69, timeZone: "Asia/Tokyo" } }))).toBe("UNSUPPORTED_PLACE");
    expect(sajuErrorCode(() => computeChart({ ...solarAt("1990-01-01", "12:00"), place: { name: "부산", longitude: 129.075, timeZone: "Asia/Seoul" } }))).toBe("no error");
  });
  it("INVALID_INPUT for impossible dates and clock values", () => {
    expect(sajuErrorCode(() => computeChart(solarAt("2023-02-29", "12:00")))).toBe("INVALID_INPUT");
    expect(sajuErrorCode(() => computeChart({ ...solarAt("2023-02-28", null), time: { hour: 24, minute: 0 } }))).toBe("INVALID_INPUT");
  });
});

describe("Korea civil-time table (P1) matches the runtime's IANA tzdata for Asia/Seoul", () => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  });
  const tzdataOffsetMin = (ms: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return (Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!) - ms) / 60_000;
  };
  it("every 6 hours from 1908-04-01 to 1995-01-01, and minute by minute around every change", () => {
    const mismatches: string[] = [];
    const check = (ms: number) => {
      const ours = koreaCivilOffsetAt(ms)?.offsetMinutes;
      const tz = tzdataOffsetMin(ms);
      if (ours !== tz) mismatches.push(`${new Date(ms).toISOString()} ours=${ours} tzdata=${tz}`);
      return tz;
    };
    const step = 6 * 3_600_000;
    let changes = 0;
    let prev = check(Date.UTC(1908, 3, 1));
    for (let ms = Date.UTC(1908, 3, 1) + step; ms < Date.UTC(1995, 0, 1); ms += step) {
      const now = check(ms);
      if (now !== prev) {
        changes++;
        for (let m = ms - step; m <= ms; m += 60_000) check(m);
      }
      prev = now;
    }
    expect(mismatches).toEqual([]);
    expect(changes).toBe(27); // 1912, 1954, 1961 standard-time moves + 12 DST seasons × 2 (research §4.5: 27)
  });
});
