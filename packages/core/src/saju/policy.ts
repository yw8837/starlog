import { equationOfTimeMinutes } from "manseryeok";

// saju-policy@1: the calendar/clock conventions the wrapper injects into manseryeok.
// Source: docs/research/saju-engine-eval.md §8 (P1–P13) and §9 (profiles R/D/DU/DL).

export const SAJU_POLICY_VERSION = "saju-policy@1";

/**
 * Clock used for the day and hour pillars (P3). Year and month pillars always use the birth instant (P2).
 * - LMT: local mean time at the birthplace longitude, no equation of time (default)
 * - LAT: local apparent (true solar) time = LMT + equation of time
 * - ERA_STANDARD: the legal standard time of the era with DST removed, no longitude correction
 * - FIXED_127_5: classic manseryeok convention, meridian 127.5°E (KST −30 min)
 * - WALL: the input wall clock as is. Compatibility/test profile R only; not a product option.
 */
export type SajuClock = "LMT" | "LAT" | "ERA_STANDARD" | "FIXED_127_5" | "WALL";

/**
 * 23:00–24:00 on the corrected clock (P4). The names spell out the rule because "야자시" means
 * different things in different engines.
 * - SPLIT_NEXT_DAY_STEM: day pillar stays on the current day; the 子 hour takes the next day's stem
 * - DAY_CHANGES_AT_23: the day pillar (and the hour stem) move to the next day at 23:00
 */
export type JasiRule = "SPLIT_NEXT_DAY_STEM" | "DAY_CHANGES_AT_23";

export interface SajuPolicy {
  version: string;
  clock: SajuClock;
  jasi: JasiRule;
  /** P1: read the input through Korea's historical offsets and DST (false = always UTC+9, profile R) */
  applyHistoricalDst: boolean;
  /** P2: warn when the birth instant is this close to a 절 */
  termBoundaryWarnSeconds: number;
  /** P13: warn when the corrected clock is this close to a 시진 boundary (odd hour) */
  hourBoundaryWarnMinutes: number;
}

/** Profile D of the research: history + DST, Seoul-style LMT at the birthplace, no EoT, split 子 hour. */
export const DEFAULT_POLICY: Readonly<SajuPolicy> = Object.freeze({
  version: SAJU_POLICY_VERSION,
  clock: "LMT",
  jasi: "SPLIT_NEXT_DAY_STEM",
  applyHistoricalDst: true,
  termBoundaryWarnSeconds: 120,
  hourBoundaryWarnMinutes: 2,
});

const CLOCKS: readonly SajuClock[] = ["LMT", "LAT", "ERA_STANDARD", "FIXED_127_5", "WALL"];
const JASI_RULES: readonly JasiRule[] = ["SPLIT_NEXT_DAY_STEM", "DAY_CHANGES_AT_23"];

/** Runtime check for policies built outside TypeScript (stored JSON, env); returns a copy. */
export function validatePolicy(policy: SajuPolicy): SajuPolicy {
  const p = policy as Partial<Record<keyof SajuPolicy, unknown>> | null | undefined;
  const bad = (what: string) => new SajuError("INVALID_POLICY", `사주 계산 정책 설정이 올바르지 않아요(${what}).`);
  if (!p || typeof p !== "object") throw bad("policy");
  if (typeof p.version !== "string" || p.version === "") throw bad("version");
  if (!CLOCKS.includes(p.clock as SajuClock)) throw bad(`clock=${String(p.clock)}`);
  if (!JASI_RULES.includes(p.jasi as JasiRule)) throw bad(`jasi=${String(p.jasi)}`);
  if (typeof p.applyHistoricalDst !== "boolean") throw bad("applyHistoricalDst");
  for (const key of ["termBoundaryWarnSeconds", "hourBoundaryWarnMinutes"] as const) {
    const v = p[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw bad(key);
  }
  return { ...policy };
}

/** Fallback birthplace when the user does not pick one (P3). */
export const SEOUL = { name: "서울", longitude: 126.978 } as const;

export type SajuErrorCode =
  | "NONEXISTENT_CIVIL_TIME"
  | "INVALID_LUNAR_DATE"
  | "UNSUPPORTED_PLACE"
  | "OUT_OF_RANGE"
  | "INVALID_INPUT"
  | "INVALID_POLICY";

/** Typed input error; `message` is Korean UI copy. */
export class SajuError extends Error {
  readonly code: SajuErrorCode;
  constructor(code: SajuErrorCode, message: string) {
    super(message);
    this.name = "SajuError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------------------------
// P10 supported range, P11 place scope
// ---------------------------------------------------------------------------------------------

/** Earliest date the engine's minute-level 절입 table covers. 1800-01-01..1908-03-31 is read as LMT (P10). */
export const MIN_SUPPORTED_DATE = { year: 1800, month: 1, day: 1 } as const;
export const MAX_SUPPORTED_DATE = { year: 2100, month: 12, day: 31 } as const;
/** Korea adopted standard time on 1908-04-01 (UTC+8:30); earlier inputs are local mean time. */
export const STANDARD_TIME_START = { year: 1908, month: 4, day: 1 } as const;

/** Only Korean births are supported until P11 (overseas births) ships. */
export const SUPPORTED_TIME_ZONE = "Asia/Seoul";
/** Longitudes a Korean birthplace can have (Baengnyeongdo ~124.6°E .. Dokdo ~131.9°E, with margin). */
export const KOREA_LONGITUDE_RANGE = { min: 124, max: 132 } as const;

// ---------------------------------------------------------------------------------------------
// P1 Korea civil-time history
// ---------------------------------------------------------------------------------------------

const MINUTE_MS = 60_000;

// Wall-clock start of each period (read on the clock in force just before it), total UTC offset and
// standard offset in minutes. Same data as manseryeok's internal table (dist/time/korea-timezone.js,
// not exported), which the research checked against IANA tzdata 2026a; tests re-check it against
// the runtime's tzdata. 1948–60 DST ended at 24:00 of the previous day, written here as 00:00.
const KOREA_PERIODS_WALL: readonly (readonly [string, number, number])[] = [
  ["1908-04-01T00:00", 510, 510],
  ["1912-01-01T00:00", 540, 540],
  ["1948-06-01T00:00", 600, 540], ["1948-09-13T00:00", 540, 540],
  ["1949-04-03T00:00", 600, 540], ["1949-09-11T00:00", 540, 540],
  ["1950-04-01T00:00", 600, 540], ["1950-09-10T00:00", 540, 540],
  ["1951-05-06T00:00", 600, 540], ["1951-09-09T00:00", 540, 540],
  ["1954-03-21T00:00", 510, 510],
  ["1955-05-05T00:00", 570, 510], ["1955-09-09T00:00", 510, 510],
  ["1956-05-20T00:00", 570, 510], ["1956-09-30T00:00", 510, 510],
  ["1957-05-05T00:00", 570, 510], ["1957-09-22T00:00", 510, 510],
  ["1958-05-04T00:00", 570, 510], ["1958-09-21T00:00", 510, 510],
  ["1959-05-03T00:00", 570, 510], ["1959-09-20T00:00", 510, 510],
  ["1960-05-01T00:00", 570, 510], ["1960-09-18T00:00", 510, 510],
  ["1961-08-10T00:00", 540, 540],
  ["1987-05-10T02:00", 600, 540], ["1987-10-11T03:00", 540, 540],
  ["1988-05-08T02:00", 600, 540], ["1988-10-09T03:00", 540, 540],
];

export interface CivilOffset {
  /** total offset from UTC, DST included */
  offsetMinutes: number;
  /** the era's standard offset (DST removed) */
  standardOffsetMinutes: number;
}

const KOREA_PERIODS: readonly (CivilOffset & { startUTC: number })[] = KOREA_PERIODS_WALL.map(([wall, offsetMinutes, standardOffsetMinutes], i) => {
  const previousOffset = i === 0 ? offsetMinutes : KOREA_PERIODS_WALL[i - 1]![1];
  return { startUTC: Date.parse(`${wall}Z`) - previousOffset * MINUTE_MS, offsetMinutes, standardOffsetMinutes };
});

const CANDIDATE_OFFSETS = [...new Set(KOREA_PERIODS.map(p => p.offsetMinutes))];

/** Korea's civil offset at an absolute instant; null before standard time (1908-04-01). */
export function koreaCivilOffsetAt(instantMs: number): CivilOffset | null {
  let found: CivilOffset | null = null;
  for (const p of KOREA_PERIODS) {
    if (p.startUTC > instantMs) break;
    found = p;
  }
  return found && { offsetMinutes: found.offsetMinutes, standardOffsetMinutes: found.standardOffsetMinutes };
}

export interface ResolvedCivilTime extends CivilOffset {
  instantMs: number;
}

/**
 * Every instant a Korean wall-clock reading (fields as UTC ms) can denote, earliest first:
 * none inside a spring-forward gap, two inside a fall-back overlap. Valid from 1908-04-01.
 */
export function koreaWallClockInstants(wallMs: number): ResolvedCivilTime[] {
  const out: ResolvedCivilTime[] = [];
  for (const offset of CANDIDATE_OFFSETS) {
    const instantMs = wallMs - offset * MINUTE_MS;
    const civil = koreaCivilOffsetAt(instantMs);
    if (civil?.offsetMinutes === offset) out.push({ instantMs, ...civil });
  }
  return out.sort((a, b) => a.instantMs - b.instantMs);
}

// ---------------------------------------------------------------------------------------------
// P3 corrected clock
// ---------------------------------------------------------------------------------------------

/**
 * The clock used for the day and hour pillars, as UTC-field milliseconds, rounded to whole ms.
 * `civil` is the offset the input was read with (a birthplace LMT offset before 1908).
 */
export function correctedClockMs(clock: SajuClock, instantMs: number, wallMs: number, civil: CivilOffset, longitude: number): number {
  const lmt = instantMs + longitude * 4 * MINUTE_MS;
  switch (clock) {
    case "LMT": return Math.round(lmt);
    case "LAT": return Math.round(lmt + equationOfTimeMinutes(instantMs) * MINUTE_MS);
    case "ERA_STANDARD": return Math.round(instantMs + civil.standardOffsetMinutes * MINUTE_MS);
    case "FIXED_127_5": return Math.round(instantMs + 127.5 * 4 * MINUTE_MS);
    case "WALL": return wallMs;
  }
}
