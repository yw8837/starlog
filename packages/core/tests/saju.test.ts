import { describe, it, expect } from "vitest";
import manseryeokPkg from "manseryeok/package.json";
import { getSolarTerm } from "manseryeok";
import {
  BRANCHES, computeChart, DEFAULT_POLICY, HIDDEN_STEMS, KASI_DST_DISAGREEMENTS, SEOUL, SajuError, koreaCivilOffsetAt, koreaWallClockInstants, mainHiddenStem,
} from "../src";
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

// docs/research/analysis-gap-review-2026-10.md §3 B1, N12: the Korean 월률분야 table (orrery; ssaju's role names).
describe("지장간 table: 월률분야, every entry with its role", () => {
  const entries = (b: (typeof BRANCHES)[number]) => HIDDEN_STEMS[b].map(h => `${h.role} ${h.stem}`).join(", ");
  it("pins all twelve branches: 여기, 중기 where there is one, 정기 (called 본기)", () => {
    expect(Object.fromEntries(BRANCHES.map(b => [b, entries(b)]))).toEqual({
      子: "여기 壬, 본기 癸", 丑: "여기 癸, 중기 辛, 본기 己", 寅: "여기 戊, 중기 丙, 본기 甲", 卯: "여기 甲, 본기 乙",
      辰: "여기 乙, 중기 癸, 본기 戊", 巳: "여기 戊, 중기 庚, 본기 丙", 午: "여기 丙, 중기 己, 본기 丁", 未: "여기 丁, 중기 乙, 본기 己",
      申: "여기 戊, 중기 壬, 본기 庚", 酉: "여기 庚, 본기 辛", 戌: "여기 辛, 중기 丁, 본기 戊", 亥: "여기 戊, 중기 甲, 본기 壬",
    });
  });
  it("reads a branch's ten god by its 본기", () => {
    expect(BRANCHES.map(mainHiddenStem).join("")).toBe("癸己甲乙戊丙丁己庚辛戊壬");
    expect(computeChart({ ...base, year: 1990, month: 1, day: 1, time: null }).pillars.month.branchGod).toBe("정관"); // 子: 본기 癸
  });
  it("hands the chart's pillars the same entries", () => {
    expect(computeChart({ ...base, year: 1990, month: 1, day: 5, time: { hour: 23, minute: 40 } }).pillars.month.hidden) // 丁丑
      .toEqual([{ stem: "癸", role: "여기" }, { stem: "辛", role: "중기" }, { stem: "己", role: "본기" }]);
  });
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

describe("policy defaults (saju-policy@2, profile D)", () => {
  it("pins the research-recommended defaults", () => {
    expect(DEFAULT_POLICY).toEqual({
      // @2 (2026-10-08): @1's pillar rules with 윤달 '모름', the 10-minute P13 and the KASI/tzdata DST notices
      version: "saju-policy@2", clock: "LMT", jasi: "SPLIT_NEXT_DAY_STEM", applyHistoricalDst: true,
      // P13 window widened from 2 to 10 minutes (owner, 2026-10-07 tester review)
      termBoundaryWarnSeconds: 120, hourBoundaryWarnMinutes: 10,
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
    expect(c.warnings.filter(w => w.code === "PILLAR_AMBIGUOUS").map(w => w.message))
      .toEqual(["태어난 시에 따라 월주가 乙卯(을묘) 또는 丙辰(병진)이 돼요. 10:13 이후라면 丙辰이에요."]);
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
    expect(c.warnings.find(w => w.code === "AMBIGUOUS_CIVIL_TIME")?.message)
      .toBe("시계를 되돌려 같은 시각이 두 번 있었던 날이에요. 먼저 지나간 시각(서머타임 기준)으로 계산했어요.");
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
    // contract (P9 min-1 clamp): exactly 1 day before 입춘 2024-02-04 17:27 → 1/3 rounds to 0 → 대운수 1
    ["clamp", "2024-02-03 17:27", "female", true, 1, { years: 0, months: 4, days: 0 }, "丙寅"],
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
    expect(c.warnings.filter(w => w.code === "PILLAR_AMBIGUOUS").map(w => w.message)).toEqual([
      "태어난 시에 따라 연주가 癸卯(계묘) 또는 甲辰(갑진)이 돼요. 17:27 이후라면 甲辰이에요.",
      "태어난 시에 따라 월주가 乙丑(을축) 또는 丙寅(병인)이 돼요. 17:27 이후라면 丙寅이에요.",
    ]);
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
    expect(c.notes).toEqual(["경도 보정으로 시각을 약 32분 앞당겨(보정 시각 11:27) 계산했어요."]);
    expect(c.warnings).toEqual([]);
    expect(c.ambiguous).toEqual([]);
  });
  it("explains DST and a corrected time that falls on the previous day", () => {
    const c = computeChart(solarAt("1988-05-10", "01:30"));
    expect(c.instantUTC).toBe("1988-05-09T15:30:00.000Z");
    expect(c.correctedLocalTime).toBe("23:57");
    expect(c.notes).toEqual([
      "서머타임 기간이라 1시간 빼서 계산했어요.",
      "경도 보정으로 시각을 약 32분 앞당겨(보정 시각 전날 23:57) 계산했어요.",
    ]);
  });
  it("explains the UTC+8:30 era", () => {
    const c = computeChart(solarAt("1958-01-15", "00:50"));
    expect(c.instantUTC).toBe("1958-01-14T16:20:00.000Z");
    expect(c.notes).toEqual(["당시 표준시(UTC+8:30) 기준으로 계산했어요.", "경도 보정으로 시각을 약 2분 앞당겨(보정 시각 00:47) 계산했어요."]);
  });
  it("time unknown: no instant or corrected clock; fixed note plus the day-pillar window (D, 1990-01-01 → 00:00~00:32)", () => {
    const c = computeChart(solarAt("1990-01-01", null));
    expect([c.instantUTC, c.correctedLocalTime, c.correctionMinutes]).toEqual([null, null, null]);
    expect(c.notes).toEqual([
      "태어난 시를 몰라 시주를 비웠어요. 시주가 다루는 해석은 하지 않아요.",
      "태어난 시를 몰라 일주는 날짜 기준으로 봤어요. 00:00~00:32 사이에 태어났다면 일주가 전날로 바뀔 수 있어요.",
    ]);
    expect(c.warnings).toEqual([{
      code: "DAY_PILLAR_WINDOW",
      message: "00:00~00:32 사이에 태어났다면 일주가 전날 일진인 乙丑(을축)이 돼요.",
      window: { from: "00:00", to: "00:32", dayPillar: "乙丑" },
    }]);
    // the window edge agrees with known-time charts: 00:32 → previous day, 00:33 → same day
    expect(four(computeChart(solarAt("1990-01-01", "00:32"))).split(" ")[2]).toBe("乙丑");
    expect(four(computeChart(solarAt("1990-01-01", "00:33"))).split(" ")[2]).toBe("丙寅");
  });
  it("time unknown on a DST date: the window grows by the DST hour (1987-07-01 D → 00:00~01:32)", () => {
    const c = computeChart(solarAt("1987-07-01", null));
    expect(c.warnings.map(w => w.window)).toEqual([{ from: "00:00", to: "01:32", dayPillar: "庚戌" }]);
    expect(c.notes[1]).toBe("태어난 시를 몰라 일주는 날짜 기준으로 봤어요. 00:00~01:32 사이에 태어났다면 일주가 전날로 바뀔 수 있어요.");
    // same date under DU: 00:33–01:32 reads 23:00+ of the previous day, which already counts as this day
    expect(computeChart(solarAt("1987-07-01", null), PROFILES.DU).warnings.map(w => w.window))
      .toEqual([{ from: "00:00", to: "00:32", dayPillar: "庚戌" }]);
  });
  it("time unknown under DU: the window sits at the end of the day (1990-01-01 → from 23:33)", () => {
    const c = computeChart(solarAt("1990-01-01", null), PROFILES.DU);
    expect(c.warnings).toEqual([{
      code: "DAY_PILLAR_WINDOW",
      message: "23:33 이후에 태어났다면 일주가 다음 날 일진인 丁卯(정묘)가 돼요.",
      window: { from: "23:33", to: "23:59", dayPillar: "丁卯" },
    }]);
    expect(c.notes[1]).toBe("태어난 시를 몰라 일주는 날짜 기준으로 봤어요. 23:33 이후에 태어났다면 일주가 다음 날로 바뀔 수 있어요.");
    expect(four(computeChart(solarAt("1990-01-01", "23:32"), PROFILES.DU)).split(" ")[2]).toBe("丙寅");
    expect(four(computeChart(solarAt("1990-01-01", "23:33"), PROFILES.DU)).split(" ")[2]).toBe("丁卯");
  });
  it("time unknown with an uncorrected clock (WALL, split) has no day-pillar window", () => {
    const c = computeChart(solarAt("1990-01-01", null), PROFILES.R);
    expect(c.warnings).toEqual([]);
    expect(c.notes).toEqual(["태어난 시를 몰라 시주를 비웠어요. 시주가 다루는 해석은 하지 않아요."]);
  });
  it("warns within 120 s of a 절 (G13: 17:26 vs 입춘 17:27)", () => {
    const c = computeChart(solarAt("2024-02-04", "17:26"));
    // 16:53:55 corrected is also within 10 min of the 17:00 시진 boundary
    expect(c.warnings.map(w => w.code)).toEqual(["TERM_BOUNDARY", "HOUR_BOUNDARY"]);
    expect(c.warnings[0]!.message).toBe("절입 시각(입춘 2월 4일 17:27) 앞뒤 2분 안에 태어나 연주·월주가 만세력·천문 자료마다 달라질 수 있어요.");
    expect(computeChart(solarAt("2024-02-04", "17:24")).warnings.filter(w => w.code === "TERM_BOUNDARY")).toEqual([]);
  });
  it("names the 시주 across the nearest 시진 boundary (G19 D: 22:58:55), the next day's 일주 under DU", () => {
    const c = computeChart(solarAt("2000-05-15", "23:31"));
    expect(c.correctedLocalTime).toBe("22:58");
    expect(c.warnings).toEqual([{
      code: "HOUR_BOUNDARY",
      message: "보정 시각(22:58)이 시주가 바뀌는 시각(23:00)과 2분 차이예요. 실제로 몇 분 늦게 태어났다면 시주가 甲子(갑자)가 되고, 밤 11시대를 다음 날로 보는 만세력에서는 일주도 다음 날 일진인 甲戌(갑술)이 돼요.",
      pillars: { hour: ["甲子"] },
      dayPillar: "甲戌",
    }]);
    // 22:57:55 is inside the 10-minute window now (it was 125 s outside the old 2-minute one)
    expect(computeChart(solarAt("2024-03-10", "23:30")).warnings.map(w => w.code)).toEqual(["HOUR_BOUNDARY"]);
    expect(computeChart(solarAt("2000-05-15", "23:31"), PROFILES.DU).warnings).toEqual([{
      code: "HOUR_BOUNDARY",
      message: "보정 시각(22:58)이 시주가 바뀌는 시각(23:00)과 2분 차이예요. 실제로 몇 분 늦게 태어났다면 일주가 甲戌(갑술), 시주가 甲子(갑자)가 돼요.",
      pillars: { day: ["甲戌"], hour: ["甲子"] },
      dayPillar: "甲戌",
    }]);
  });
  it("time known, corrected clock in the 23:00 hour: names the 일주 a calendar that changes the day at 23:00 shows (G12 D: 23:37 → 丁未)", () => {
    const c = computeChart(solarAt("2026-09-30", "00:10"));
    expect([c.correctedLocalTime, four(c).split(" ")[2]]).toEqual(["23:37", "丙午"]);
    expect(c.warnings).toEqual([{
      code: "JASI_DAY_PILLAR",
      message: "보정 시각(23:37)이 밤 11시대예요. 밤 11시대를 다음 날로 보는 만세력에서는 일주가 다음 날 일진인 丁未(정미)가 돼요.",
      dayPillar: "丁未",
    }]);
    // that calendar is profile DU: it already shows 丁未, so it gets no such line
    const du = computeChart(solarAt("2026-09-30", "00:10"), PROFILES.DU);
    expect([four(du).split(" ")[2], du.warnings]).toEqual(["丁未", []]);
    expect(computeChart(solarAt("1990-01-05", "23:40")).warnings.map(w => [w.code, w.dayPillar])).toEqual([["JASI_DAY_PILLAR", "辛未"]]); // G04 D 23:07
    // 22:58 (G19 D) and an unknown time are not in the 23:00 hour
    expect(computeChart(solarAt("2000-05-15", "23:31")).warnings.map(w => w.code)).toEqual(["HOUR_BOUNDARY"]);
    expect(computeChart(solarAt("2026-09-30", null)).warnings.map(w => w.code)).toEqual(["DAY_PILLAR_WINDOW"]);
  });
  it("JASI_DAY_PILLAR at the edges of the 23:00 hour: a DST birth that lands in it, and the first and last second around 23:00", () => {
    // 1988-07-01 00:50 under DST = 06-30 23:50 standard → 23:17 corrected: 06-30's 丙辰 here, 07-01's 丁巳 elsewhere
    const dst = computeChart(solarAt("1988-07-01", "00:50"));
    expect([dst.correctedLocalTime, four(dst).split(" ")[2]]).toEqual(["23:17", "丙辰"]);
    expect(dst.warnings.map(w => [w.code, w.dayPillar])).toEqual([["JASI_DAY_PILLAR", "丁巳"]]);
    // Seoul (126.978°E): 23:33 → 23:00:55 is in the hour, 23:32 → 22:59:55 is not (both are near the 시진 boundary).
    // In the hour the two notices are one: the 23:00 boundary joins the JASI line instead of a second warning.
    expect(computeChart(solarAt("2024-03-10", "23:33")).warnings.map(w => w.code)).toEqual(["JASI_DAY_PILLAR"]);
    expect(computeChart(solarAt("2024-03-10", "23:32")).warnings.map(w => w.code)).toEqual(["HOUR_BOUNDARY"]);
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
    expect(fixed.notes).toEqual(["동경 127.5도 기준으로 시각을 30분 앞당겨(보정 시각 11:30) 계산했어요."]); // whole minutes: no "약"
  });
  it("every note and warning ends as a full 해요체 sentence", () => {
    const charts = [
      ...GOLDEN.flatMap(([, at]) => (Object.keys(PROFILES) as ProfileId[]).map(p => computeChart(solarAt(...(at.split(" ") as [string, string])), PROFILES[p]))),
      ...["1990-01-01", "2024-02-04", "1987-07-01", "1900-01-01"].map(d => computeChart(solarAt(d, null))),
      computeChart(solarAt("1987-10-11", "02:30")),
      // DST_BOUNDARY, HOUR_BOUNDARY (both sides, 23:00 merged with JASI), midnight (DAY_BOUNDARY, merged with JASI) and LEAP_MONTH_UNKNOWN
      ...[["1955-09-09", "00:30"], ["1948-05-31", "23:45"], ["1951-05-06", "12:00"], ["2000-05-15", "23:31"], ["2024-03-10", "23:33"], ["1995-03-15", "07:00"],
        ["2000-05-15", "00:37"], ["2000-05-15", "00:28"], ["2024-03-10", "23:43"]]
        .map(([d, hm]) => computeChart(solarAt(d!, hm!))),
      computeChart({ ...base, calendar: "lunar", year: 2023, month: 2, day: 15, isLeapMonth: "unknown", time: null }),
      computeChart({ ...base, calendar: "lunar", year: 1952, month: 5, day: 30, isLeapMonth: "unknown", time: null }),
      computeChart({ ...base, calendar: "lunar", year: 2033, month: 11, day: 20, isLeapMonth: "unknown", time: null }),
    ];
    const texts = charts.flatMap(c => [...c.notes, ...c.warnings.map(w => w.message)]);
    expect(texts.length).toBeGreaterThan(50);
    expect(texts.filter(t => !/요\.$/.test(t))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// P13 widened (owner, 2026-10-07 tester review): within 10 min of a 시진 boundary on the corrected clock the
// notice names the 시주 a few minutes the other way gives. 128.5°E puts the clock exactly 26 min behind KST,
// so wall 07:30 reads 07:04 (tester Emma, 경북, 07:30 → 07:04). Expected pillars by the 五鼠遁 rule:
// 1995-03-15 is 乙巳 (子 丙子 … 卯 己卯, 辰 庚辰, 亥 丁亥); 1995-03-16 is 丙午 (子 戊子).
// ---------------------------------------------------------------------------------------------

describe("P13 시진 boundary within 10 minutes: the other 시주", () => {
  const at = (hm: string, policy: SajuPolicy = DEFAULT_POLICY) => computeChart({ ...solarAt("1995-03-15", hm), place: { name: "경북", longitude: 128.5 } }, policy);
  const hourOf = (c: SajuChart) => c.pillars.hour!.stem + c.pillars.hour!.branch;

  it("07:04 (wall 07:30): the 시주 changes at 07:00, a few minutes earlier gives 己卯", () => {
    const c = at("07:30");
    expect([c.correctedLocalTime, hourOf(c)]).toEqual(["07:04", "庚辰"]);
    expect(c.warnings).toEqual([{
      code: "HOUR_BOUNDARY",
      message: "보정 시각(07:04)이 시주가 바뀌는 시각(07:00)과 4분 차이예요. 실제로 몇 분 일찍 태어났다면 시주가 己卯(기묘)가 돼요.",
      pillars: { hour: ["己卯"] },
    }]);
  });
  it("06:55 (wall 07:21): a few minutes later gives 庚辰", () => {
    const c = at("07:21");
    expect([c.correctedLocalTime, hourOf(c)]).toEqual(["06:55", "己卯"]);
    expect(c.warnings).toEqual([{
      code: "HOUR_BOUNDARY",
      message: "보정 시각(06:55)이 시주가 바뀌는 시각(07:00)과 5분 차이예요. 실제로 몇 분 늦게 태어났다면 시주가 庚辰(경진)이 돼요.",
      pillars: { hour: ["庚辰"] },
    }]);
  });
  it("07:11 (wall 07:37) is outside; 06:50 and 07:10 are the window's edges, 06:49 is outside; 07:00 itself is just after", () => {
    expect(at("07:37").warnings).toEqual([]);
    expect(at("07:15").warnings).toEqual([]); // 06:49
    expect(at("07:16").warnings.map(w => w.message)).toEqual(["보정 시각(06:50)이 시주가 바뀌는 시각(07:00)과 10분 차이예요. 실제로 몇 분 늦게 태어났다면 시주가 庚辰(경진)이 돼요."]);
    expect(at("07:36").warnings.map(w => w.message)).toEqual(["보정 시각(07:10)이 시주가 바뀌는 시각(07:00)과 10분 차이예요. 실제로 몇 분 일찍 태어났다면 시주가 己卯(기묘)가 돼요."]);
    expect(at("07:26").warnings.map(w => w.message)).toEqual(["보정 시각(07:00)이 시주가 바뀌는 시각(07:00)과 1분 안쪽 차이예요. 실제로 몇 분 일찍 태어났다면 시주가 己卯(기묘)가 돼요."]);
  });
  it("22:55 (wall 23:21): a few minutes later is the 子 hour on the next day's stem, and other calendars move the 일주", () => {
    const c = at("23:21");
    expect([c.correctedLocalTime, hourOf(c)]).toEqual(["22:55", "丁亥"]);
    expect(c.warnings).toEqual([{
      code: "HOUR_BOUNDARY",
      message: "보정 시각(22:55)이 시주가 바뀌는 시각(23:00)과 5분 차이예요. 실제로 몇 분 늦게 태어났다면 시주가 戊子(무자)가 되고, 밤 11시대를 다음 날로 보는 만세력에서는 일주도 다음 날 일진인 丙午(병오)가 돼요.",
      pillars: { hour: ["戊子"] },
      dayPillar: "丙午",
    }]);
  });
  it("23:04 (wall 23:30): one notice for the 23:00 hour, the JASI line with the boundary added", () => {
    const c = at("23:30");
    expect([c.correctedLocalTime, hourOf(c)]).toEqual(["23:04", "戊子"]);
    expect(c.warnings).toEqual([{
      code: "JASI_DAY_PILLAR",
      message: "보정 시각(23:04)이 밤 11시대예요. 밤 11시대를 다음 날로 보는 만세력에서는 일주가 다음 날 일진인 丙午(병오)가 돼요. 시주가 바뀌는 시각(23:00)과도 4분 차이라, 실제로 몇 분 일찍 태어났다면 시주가 丁亥(정해)가 돼요.",
      dayPillar: "丙午",
      pillars: { hour: ["丁亥"] },
    }]);
    // past the window the JASI line stands alone, as before
    expect(at("23:37").warnings).toEqual([{
      code: "JASI_DAY_PILLAR",
      message: "보정 시각(23:11)이 밤 11시대예요. 밤 11시대를 다음 날로 보는 만세력에서는 일주가 다음 날 일진인 丙午(병오)가 돼요.",
      dayPillar: "丙午",
    }]);
  });
  it("under DU the 23:00 boundary moves this chart's own 일주 as well", () => {
    const du = { ...DEFAULT_POLICY, jasi: "DAY_CHANGES_AT_23" } satisfies SajuPolicy;
    expect(at("23:21", du).warnings).toEqual([{
      code: "HOUR_BOUNDARY",
      message: "보정 시각(22:55)이 시주가 바뀌는 시각(23:00)과 5분 차이예요. 실제로 몇 분 늦게 태어났다면 일주가 丙午(병오), 시주가 戊子(무자)가 돼요.",
      pillars: { day: ["丙午"], hour: ["戊子"] },
      dayPillar: "丙午",
    }]);
    expect(at("23:30", du).warnings).toEqual([{
      code: "HOUR_BOUNDARY",
      message: "보정 시각(23:04)이 시주가 바뀌는 시각(23:00)과 4분 차이예요. 실제로 몇 분 일찍 태어났다면 일주가 乙巳(을사), 시주가 丁亥(정해)가 돼요.",
      pillars: { day: ["乙巳"], hour: ["丁亥"] },
      dayPillar: "乙巳",
    }]);
  });
  it("tester Emma's place, 경북 안동 (128.729°E): 07:30 reads 07:04 and names 07:00", () => {
    const c = computeChart({ ...solarAt("1995-03-15", "07:30"), place: { name: "경북 안동", longitude: 128.729 } });
    expect(c.correctedLocalTime).toBe("07:04");
    expect(c.warnings.map(w => w.message)).toEqual(["보정 시각(07:04)이 시주가 바뀌는 시각(07:00)과 4분 차이예요. 실제로 몇 분 일찍 태어났다면 시주가 己卯(기묘)가 돼요."]);
  });
  it("decides in whole minutes of the clock as shown, the unit the notice says: 서울 22:50:55 and 23:10:55 are both 10 minutes", () => {
    // 2024-03-10 is 癸酉 (亥 hour 癸亥); 23:00–24:00 is the 子 hour on 甲戌's stem (甲子)
    const before = computeChart(solarAt("2024-03-10", "23:23")); // 22:50:54.7
    const after = computeChart(solarAt("2024-03-10", "23:43")); // 23:10:54.7
    expect([before.correctedLocalTime, after.correctedLocalTime]).toEqual(["22:50", "23:10"]);
    expect(before.warnings.map(w => [w.code, w.pillars])).toEqual([["HOUR_BOUNDARY", { hour: ["甲子"] }]]);
    expect(before.warnings[0]!.message).toContain("보정 시각(22:50)이 시주가 바뀌는 시각(23:00)과 10분 차이예요.");
    expect(after.warnings).toEqual([{
      code: "JASI_DAY_PILLAR",
      message: "보정 시각(23:10)이 밤 11시대예요. 밤 11시대를 다음 날로 보는 만세력에서는 일주가 다음 날 일진인 甲戌(갑술)이 돼요. 시주가 바뀌는 시각(23:00)과도 10분 차이라, 실제로 몇 분 일찍 태어났다면 시주가 癸亥(계해)가 돼요.",
      dayPillar: "甲戌",
      pillars: { hour: ["癸亥"] },
    }]);
    // 11 minutes either side is outside: 22:49:55, and 23:11:55 with the JASI line alone
    expect(computeChart(solarAt("2024-03-10", "23:22")).warnings).toEqual([]);
    expect(computeChart(solarAt("2024-03-10", "23:44")).warnings.map(w => [w.code, w.pillars])).toEqual([["JASI_DAY_PILLAR", undefined]]);
  });
});

// ---------------------------------------------------------------------------------------------
// P5 with P13's window: under the split rule the 일주 changes at 00:00 on the corrected clock. The 子 hour runs
// across it on the same stem (23:59 of 壬申 day and 00:04 of 癸酉 day are both 壬子), so the 일주 (and the 일간)
// is what a few minutes changes. 2000-05-14 is 壬申, 2000-05-15 癸酉 (G19).
// ---------------------------------------------------------------------------------------------

describe("midnight on the corrected clock: the 일주 a few minutes the other way", () => {
  it("서울 00:37 reads 00:04: a few minutes earlier is the day before, 壬申 instead of 癸酉", () => {
    const c = computeChart(solarAt("2000-05-15", "00:37"));
    expect([c.correctedLocalTime, four(c)]).toEqual(["00:04", "庚辰 辛巳 癸酉 壬子"]);
    expect(c.warnings).toEqual([{
      code: "DAY_BOUNDARY",
      message: "보정 시각(00:04)이 일주가 바뀌는 시각(00:00)과 4분 차이예요. 실제로 몇 분 일찍 태어났다면 일주가 壬申(임신)이 돼요.",
      pillars: { day: ["壬申"] },
      dayPillar: "壬申",
    }]);
    expect(four(computeChart(solarAt("2000-05-15", "00:32")))).toBe("庚辰 辛巳 壬申 壬子"); // 23:59:55 the day before
  });
  it("the window's edges in whole minutes: 00:00:55 is under a minute, 00:10:55 is 10 minutes, 00:11:55 is outside", () => {
    expect(computeChart(solarAt("2000-05-15", "00:33")).warnings.map(w => w.message))
      .toEqual(["보정 시각(00:00)이 일주가 바뀌는 시각(00:00)과 1분 안쪽 차이예요. 실제로 몇 분 일찍 태어났다면 일주가 壬申(임신)이 돼요."]);
    expect(computeChart(solarAt("2000-05-15", "00:43")).warnings.map(w => [w.code, w.dayPillar])).toEqual([["DAY_BOUNDARY", "壬申"]]);
    expect(computeChart(solarAt("2000-05-15", "00:44")).warnings).toEqual([]);
  });
  it("just before midnight it joins the JASI line, which already names the next day's 일주: one notice for the moment", () => {
    const c = computeChart(solarAt("2000-05-15", "00:28")); // 23:55:55 on 05-14
    expect(c.warnings).toEqual([{
      code: "JASI_DAY_PILLAR",
      message: "보정 시각(23:55)이 밤 11시대예요. 밤 11시대를 다음 날로 보는 만세력에서는 일주가 다음 날 일진인 癸酉(계유)가 돼요. 일주가 바뀌는 자정(00:00)과도 5분 차이라, 실제로 몇 분 늦게 태어났다면 여기서도 일주가 癸酉(계유)가 돼요.",
      dayPillar: "癸酉",
      pillars: { day: ["癸酉"] },
    }]);
    expect(computeChart(solarAt("2000-05-15", "00:21")).warnings.map(w => [w.code, w.pillars])).toEqual([["JASI_DAY_PILLAR", undefined]]); // 23:48:55
  });
  it("under DU the day changed at 23:00 already, so midnight moves nothing", () => {
    expect(computeChart(solarAt("2000-05-15", "00:37"), PROFILES.DU).warnings).toEqual([]);
    expect(computeChart(solarAt("2000-05-15", "00:28"), PROFILES.DU).warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// docs/research/manseryeok-references-2026-10.md §6.2: KASI's 역서 DST table and tzdata differ by an hour at the
// 1948–51 starts and the 1955–60 ends. P1 follows tzdata; inside the wall-clock span between the two
// transitions the notice names the pillars KASI's table gives, when they differ. Seoul (126.978°E).
// ---------------------------------------------------------------------------------------------

describe("DST_BOUNDARY: KASI's 역서 table vs tzdata (§6.2)", () => {
  const dst = (c: SajuChart) => c.warnings.filter(w => w.code === "DST_BOUNDARY");

  it("1955 end, inside [09-09 00:00, 01:00): KASI still reads DST, an hour earlier, so the previous day's 일주", () => {
    const c = computeChart(solarAt("1955-09-09", "00:30"));
    expect([c.correctedLocalTime, four(c)]).toEqual(["00:27", "乙未 乙酉 癸酉 壬子"]);
    expect(dst(c)).toEqual([{
      code: "DST_BOUNDARY",
      message: "1955년 서머타임 종료 무렵은 자료마다 1시간 차이가 나요. 여기서는 국제 시간대 자료(tzdata)를 따랐어요. 한국천문연구원 역서 표로는 아직 서머타임이라 1시간 이른 순간이 되고, 그러면 일주가 壬申(임신)이 돼요.",
      pillars: { day: ["壬申"] },
      dayPillar: "壬申",
    }]);
  });
  it("1955 end, both edges: 00:00 and 00:59 inside, 01:00 and the evening before outside", () => {
    // 00:00 reads 23:57 on 09-08 (子); KASI's reading is 22:57 (亥 of 壬申 day = 辛亥)
    expect(dst(computeChart(solarAt("1955-09-09", "00:00"))).map(w => w.pillars)).toEqual([{ hour: ["辛亥"] }]);
    expect(dst(computeChart(solarAt("1955-09-09", "00:59"))).map(w => w.pillars)).toEqual([{ day: ["壬申"] }]);
    expect(dst(computeChart(solarAt("1955-09-09", "01:00")))).toEqual([]);
    expect(dst(computeChart(solarAt("1955-09-08", "23:59")))).toEqual([]); // DST in both (tzdata: the repeated hour, read as DST)
  });
  it("1948 start, inside [05-31 23:00, 24:00): KASI's clock jumped at 23:00, so a calendar using its table subtracts an hour: the 亥 hour", () => {
    const c = computeChart(solarAt("1948-05-31", "23:45"));
    expect([c.correctedLocalTime, four(c)]).toEqual(["23:12", "戊子 丁巳 丙辰 庚子"]);
    expect(dst(c)).toEqual([{
      code: "DST_BOUNDARY",
      message: "1948년 서머타임 시작 무렵은 자료마다 1시간 차이가 나요. 여기서는 국제 시간대 자료(tzdata)를 따랐어요. 한국천문연구원 역서 표로는 그날 23시에 서머타임이 시작돼서, 그 표대로 1시간을 빼는 만세력에서는 시주가 己亥(기해)가 돼요.",
      pillars: { hour: ["己亥"] },
    }]);
  });
  it("1948 start, both edges, and no notice inside when the hour keeps the chart (22:27 and 21:27 are both 亥)", () => {
    expect(dst(computeChart(solarAt("1948-05-31", "23:59"))).map(w => w.pillars)).toEqual([{ hour: ["己亥"] }]);
    expect(dst(computeChart(solarAt("1948-05-31", "22:59")))).toEqual([]);
    expect(dst(computeChart(solarAt("1948-05-31", "23:00")))).toEqual([]);
    expect(dst(computeChart(solarAt("1948-06-01", "01:00")))).toEqual([]);
    expect(sajuErrorCode(() => computeChart(solarAt("1948-06-01", "00:30")))).toBe("NONEXISTENT_CIVIL_TIME"); // tzdata's skipped hour (P8 as before)
  });
  it("refuses tzdata's skipped hour as before, saying the refusal is tzdata's and that KASI's table has that hour (1948–51 starts)", () => {
    const refusal = (ymd: string, hm: string) => {
      try { computeChart(solarAt(ymd, hm)); return "no error"; } catch (e) { return e instanceof SajuError ? `${e.code}: ${e.message}` : "not a SajuError"; }
    };
    // 1948–50: KASI's DST began at 23:00 the evening before, so this hour is DST on its table
    expect(refusal("1948-06-01", "00:30")).toBe("NONEXISTENT_CIVIL_TIME: 1948년 6월 1일 00:30은 국제 시간대 자료(tzdata) 기준으로 시계를 앞당기며 건너뛴 시각이라 여기서는 계산하지 않아요. "
      + "한국천문연구원 역서 표로는 전날 23시에 서머타임이 시작돼서, 그 표대로 1시간을 빼는 만세력에서는 전날 23:30으로 계산해요. 출생 기록을 다시 확인해 주세요.");
    expect(refusal("1949-04-03", "00:00")).toContain("1949년 4월 3일 00:00은 국제 시간대 자료(tzdata) 기준으로");
    expect(refusal("1950-04-01", "00:59")).toContain("그 표대로 1시간을 빼는 만세력에서는 전날 23:59으로 계산해요.");
    // 1951: KASI's DST began at 23:00 that day, so this hour is still standard time on its table
    expect(refusal("1951-05-06", "00:30")).toBe("NONEXISTENT_CIVIL_TIME: 1951년 5월 6일 00:30은 국제 시간대 자료(tzdata) 기준으로 시계를 앞당기며 건너뛴 시각이라 여기서는 계산하지 않아요. "
      + "한국천문연구원 역서 표로는 그날 23시에 서머타임이 시작돼서 이 시각이 있었어요. 출생 기록을 다시 확인해 주세요.");
    // where both agree the hour was skipped, the sentence is as before
    for (const [ymd, hm] of [["1955-05-05", "00:30"], ["1987-05-10", "02:30"]] as const) {
      expect(refusal(ymd, hm)).toBe(`NONEXISTENT_CIVIL_TIME: ${Number(ymd.slice(0, 4))}년 ${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8))}일 ${hm}은 시계를 앞당기며 건너뛴 시각이라 실제로는 없었어요. 출생 기록을 다시 확인해 주세요.`);
    }
  });
  it("1951 start: tzdata starts 23 hours before KASI; inside, KASI reads standard time, an hour later", () => {
    const noon = computeChart(solarAt("1951-05-06", "12:00"));
    expect([noon.correctedLocalTime, four(noon)]).toEqual(["10:27", "辛卯 壬辰 丙午 癸巳"]);
    expect(dst(noon)).toEqual([{
      code: "DST_BOUNDARY",
      message: "1951년 서머타임 시작 무렵은 자료마다 1시간 차이가 나요. 여기서는 국제 시간대 자료(tzdata)를 따랐어요. 한국천문연구원 역서 표로는 아직 서머타임 전이라 1시간 늦은 순간이 되고, 그러면 시주가 甲午(갑오)가 돼요.",
      pillars: { hour: ["甲午"] },
    }]);
    // 입하 (1951-05-06 17:09 KST) falls inside that hour at 17:30: the month pillar is the one that changes
    expect(dst(computeChart(solarAt("1951-05-06", "17:30"))).map(w => w.pillars)).toEqual([{ month: ["癸巳"] }]);
    expect(dst(computeChart(solarAt("1951-05-06", "23:00")))).toEqual([]);
    expect(dst(computeChart(solarAt("1951-05-05", "23:59")))).toEqual([]);
  });
  it("needs the DST table (not profile R); 1987–88 agree", () => {
    expect(dst(computeChart(solarAt("1955-09-09", "00:30"), PROFILES.R))).toEqual([]);
    expect(dst(computeChart(solarAt("1987-05-10", "03:30")))).toEqual([]);
    expect(dst(computeChart(solarAt("1987-10-11", "03:30")))).toEqual([]);
  });
});

// §6.2 as printed ([연도, KASI 시작, tzdata 시작, KASI 종료, tzdata 종료]), each change read on the clock just before
// it; "24시" is the next day's 00:00. Copied from the doc; do not edit it to match the code.
const DST_TABLE_6_2: [number, string, string, string, string][] = [
  [1948, "5/31 23시", "5/31 24시", "9/12 24시", "9/12 24시"],
  [1949, "4/2 23시", "4/2 24시", "9/10 24시", "9/10 24시"],
  [1950, "3/31 23시", "3/31 24시", "9/9 24시", "9/9 24시"],
  [1951, "5/6 23시", "5/5 24시", "9/8 24시", "9/8 24시"],
  [1955, "5/5 0시", "5/5 0시", "9/9 1시", "9/9 0시"],
  [1956, "5/20 0시", "5/20 0시", "9/30 1시", "9/30 0시"],
  [1957, "5/5 0시", "5/5 0시", "9/22 1시", "9/22 0시"],
  [1958, "5/4 0시", "5/4 0시", "9/21 1시", "9/21 0시"],
  [1959, "5/3 0시", "5/3 0시", "9/20 1시", "9/20 0시"],
  [1960, "5/1 0시", "5/1 0시", "9/18 1시", "9/18 0시"],
  [1987, "5/10 2시", "5/10 2시", "10/11 3시", "10/11 3시"],
  [1988, "5/8 2시", "5/8 2시", "10/9 3시", "10/9 3시"],
];

describe("KASI_DST_DISAGREEMENTS is §6.2, row by row", () => {
  /** "5/31 24시" of 1948 → "1948-06-01T00:00" */
  const wall = (year: number, at: string) => {
    const [, month, day, hour] = /^(\d+)\/(\d+) (\d+)시$/.exec(at)!.map(Number) as [number, number, number, number];
    return new Date(Date.UTC(year, month - 1, day, hour)).toISOString().slice(0, 16);
  };
  const table = DST_TABLE_6_2.map(([year, ...cells]) => {
    const [kasiStart, tzStart, kasiEnd, tzEnd] = cells.map(cell => wall(year, cell)) as [string, string, string, string];
    return { year, kasiStart, tzStart, kasiEnd, tzEnd };
  });
  const span = (year: number, edge: "start" | "end", kasi: string, tz: string, kasiDst: boolean) => {
    const [from, to] = [kasi, tz].sort() as [string, string];
    return { year, edge, from, to, kasiDst };
  };

  it("has a row for each of the 10 places the two columns differ, with the side that reads the span as DST", () => {
    const spans = table.flatMap(({ year, kasiStart, tzStart, kasiEnd, tzEnd }) => [
      ...(kasiStart === tzStart ? [] : [span(year, "start", kasiStart, tzStart, kasiStart < tzStart)]), // KASI earlier: its DST already runs
      ...(kasiEnd === tzEnd ? [] : [span(year, "end", kasiEnd, tzEnd, kasiEnd > tzEnd)]), // KASI later: its DST still runs
    ]);
    expect(spans).toHaveLength(10);
    expect(KASI_DST_DISAGREEMENTS).toEqual(spans);
  });

  it("matches §6.2's tzdata column with the P1 table: the hour after each start is skipped, the hour before each end repeats", () => {
    const at = (iso: string, minutes: number) => Date.parse(`${iso}Z`) + minutes * 60_000;
    for (const { year, tzStart, tzEnd } of table) {
      expect([-1, 0, 59, 60].map(m => koreaWallClockInstants(at(tzStart, m)).length), `${year} start`).toEqual([1, 0, 0, 1]);
      expect([-61, -60, -1, 0].map(m => koreaWallClockInstants(at(tzEnd, m)).length), `${year} end`).toEqual([1, 2, 2, 1]);
    }
  });

  it("names KASI's pillars inside each of the 10 spans (23:45 at the 1948–50 starts, noon in 1951's 23 hours, 00:30 after the ends)", () => {
    for (const d of KASI_DST_DISAGREEMENTS) {
      const minutes = d.edge === "end" ? 30 : d.kasiDst ? 45 : 12 * 60;
      const [ymd, hm] = new Date(Date.parse(`${d.from}Z`) + minutes * 60_000).toISOString().slice(0, 16).split("T") as [string, string];
      const notice = computeChart(solarAt(ymd, hm)).warnings.find(w => w.code === "DST_BOUNDARY");
      expect(notice?.message.startsWith(`${d.year}년 서머타임 ${d.edge === "start" ? "시작" : "종료"} 무렵은 자료마다 1시간 차이가 나요.`), `${d.year} ${d.edge}`).toBe(true);
      expect(Object.keys(notice?.pillars ?? {}).length, `${d.year} ${d.edge}`).toBeGreaterThan(0);
      if (d.edge === "start" && d.kasiDst) expect(notice?.message, `${d.year}`).toContain("그날 23시에 서머타임이 시작돼서, 그 표대로 1시간을 빼는 만세력에서는");
    }
  });
});

// ---------------------------------------------------------------------------------------------
// P7 with 윤달 '모름' (owner, 2026-10-07): 평달 unless only the leap month has the day; when that year has the
// leap month, a notice names the 윤달 chart's pillars. Expected 윤달 pillars: §9 G11 / G11u (2023 윤2-15).
// ---------------------------------------------------------------------------------------------

describe("음력 윤달 모름 (P7)", () => {
  const lunar = (year: number, month: number, day: number, isLeapMonth: boolean | "unknown", hm: string | null = null): SajuInput => ({
    calendar: "lunar", year, month, day, isLeapMonth, time: hm === null ? null : { hour: Number(hm.slice(0, 2)), minute: Number(hm.slice(3, 5)) }, gender: "female", place: SEOUL,
  });

  it("that year has the leap month: the 평달 chart, and a notice with the 윤달 chart's pillars", () => {
    const c = computeChart(lunar(2023, 2, 15, "unknown", "12:00"));
    const regular = computeChart(lunar(2023, 2, 15, false, "12:00"));
    expect([c.solarDate, c.lunarDate, four(c)]).toEqual(["2023-03-06", "2023-02-15", four(regular)]);
    expect(four(computeChart(lunar(2023, 2, 15, true, "12:00")))).toBe("癸卯 丙辰 癸巳 戊午"); // G11
    expect(c.input.isLeapMonth).toBe("unknown");
    expect(c.warnings[0]).toEqual({
      code: "LEAP_MONTH_UNKNOWN",
      message: "음력 2023년 2월은 평달과 윤달이 둘 다 있어서 평달로 계산했어요. 윤달이라면 양력 4월 5일생이고, 월주가 丙辰(병진), 일주가 癸巳(계사)가 돼요.",
      pillars: { month: ["丙辰"], day: ["癸巳"] },
      dayPillar: "癸巳",
    });
    expect(c.warnings.slice(1)).toEqual(regular.warnings);
  });
  it("time unknown: a 윤달 day with a 절 names both month candidates (G11u: 청명 10:13)", () => {
    const c = computeChart(lunar(2023, 2, 15, "unknown"));
    expect(c.warnings[0]!.message).toBe("음력 2023년 2월은 평달과 윤달이 둘 다 있어서 평달로 계산했어요. 윤달이라면 양력 4월 5일생이고, 월주가 乙卯(을묘) 또는 丙辰(병진), 일주가 癸巳(계사)가 돼요.");
    expect(c.warnings[0]!.pillars).toEqual({ month: ["乙卯", "丙辰"], day: ["癸巳"] });
  });
  it("no leap month that year, or not in that month: 평달, silently", () => {
    for (const [month, day] of [[3, 15], [2, 30]] as const) { // 2023 has 윤2월 only, and 윤2월 has no 30th
      const c = computeChart(lunar(2023, month, day, "unknown", "12:00"));
      const regular = computeChart(lunar(2023, month, day, false, "12:00"));
      expect({ ...c, input: regular.input }).toEqual(regular);
    }
  });
  it("a day only the 윤달 has: computed as 윤달, said in the notes", () => {
    const c = computeChart(lunar(1952, 5, 30, "unknown"));
    expect([c.solarDate, c.lunarDate]).toEqual(["1952-07-21", "1952-윤05-30"]);
    expect(c.notes[0]).toBe("음력 1952년 5월 30일은 윤달에만 있는 날이라 윤달로 계산했어요.");
    expect(c.warnings.map(w => w.code)).not.toContain("LEAP_MONTH_UNKNOWN");
  });
  it("a day neither has → INVALID_LUNAR_DATE", () => {
    expect(sajuErrorCode(() => computeChart(lunar(2017, 5, 30, "unknown")))).toBe("INVALID_LUNAR_DATE");
  });
  it("the 윤달 reading failing leaves the 평달 chart with nothing to name (음력 1955 3-14 00:30: 윤3-14 is 05-05, in the skipped DST hour)", () => {
    expect(sajuErrorCode(() => computeChart(lunar(1955, 3, 14, true, "00:30")))).toBe("NONEXISTENT_CIVIL_TIME");
    const c = computeChart(lunar(1955, 3, 14, "unknown", "00:30"));
    const regular = computeChart(lunar(1955, 3, 14, false, "00:30"));
    expect([c.solarDate, c.input.isLeapMonth]).toEqual(["1955-04-06", "unknown"]);
    expect({ ...c, input: regular.input }).toEqual(regular);
    // an error in the 평달 reading itself still stands
    expect(sajuErrorCode(() => computeChart(lunar(1955, 3, 14, "unknown", "24:00")))).toBe("INVALID_INPUT");
  });
  it("names the year when the 윤달's solar date is in another year (2033 윤11-20 → 2034-01-10)", () => {
    expect(computeChart(lunar(2033, 11, 20, true)).solarDate).toBe("2034-01-10");
    const c = computeChart(lunar(2033, 11, 20, "unknown"));
    expect(c.solarDate).toBe("2033-12-11");
    expect(c.warnings[0]).toEqual({
      code: "LEAP_MONTH_UNKNOWN",
      message: "음력 2033년 11월은 평달과 윤달이 둘 다 있어서 평달로 계산했어요. 윤달이라면 양력 2034년 1월 10일생이고, 월주가 乙丑(을축), 일주가 丙寅(병인)이 돼요.",
      pillars: { month: ["乙丑"], day: ["丙寅"] },
      dayPillar: "丙寅",
    });
  });
});

describe("policy validation", () => {
  it("DEFAULT_POLICY is frozen and each chart carries its own copy", () => {
    expect(Object.isFrozen(DEFAULT_POLICY)).toBe(true);
    const c = computeChart(solarAt("1990-01-01", "12:00"));
    expect(c.policy).toEqual(DEFAULT_POLICY);
    expect(c.policy).not.toBe(DEFAULT_POLICY);
  });
  it.each([
    ["unknown clock", { clock: "TRUE_SOLAR" }],
    ["unknown jasi", { jasi: "same-day" }],
    ["non-boolean DST flag", { applyHistoricalDst: "yes" }],
    ["negative term window", { termBoundaryWarnSeconds: -1 }],
    ["NaN hour window", { hourBoundaryWarnMinutes: Number.NaN }],
    ["empty version", { version: "" }],
  ])("INVALID_POLICY for %s", (_label, patch) => {
    const policy = { ...DEFAULT_POLICY, ...patch } as unknown as SajuPolicy;
    expect(sajuErrorCode(() => computeChart(solarAt("1990-01-01", "12:00"), policy))).toBe("INVALID_POLICY");
    expect(sajuErrorCode(() => computeChart(solarAt("1990-01-01", null), policy))).toBe("INVALID_POLICY");
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
  it("INVALID_INPUT for a bad gender, calendar or longitude", () => {
    const ok = solarAt("1990-01-01", "12:00");
    expect(sajuErrorCode(() => computeChart({ ...ok, gender: "other" } as unknown as SajuInput))).toBe("INVALID_INPUT");
    expect(sajuErrorCode(() => computeChart({ ...ok, gender: undefined } as unknown as SajuInput))).toBe("INVALID_INPUT");
    expect(sajuErrorCode(() => computeChart({ ...ok, calendar: "julian" } as unknown as SajuInput))).toBe("INVALID_INPUT");
    expect(sajuErrorCode(() => computeChart({ ...ok, place: { name: "?", longitude: Number.NaN } }))).toBe("INVALID_INPUT");
    expect(sajuErrorCode(() => computeChart({ ...ok, place: { name: "?", longitude: Number.POSITIVE_INFINITY } }))).toBe("INVALID_INPUT");
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
