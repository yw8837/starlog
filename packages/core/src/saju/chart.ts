import { calculateFourPillars, getSolarTerm, isValidSolarDate, lunarToSolar, solarToLunar, LUNAR_MAX_YEAR, LUNAR_MIN_YEAR } from "manseryeok";
import type { FourPillarsDetail, Pillar as EnginePillar } from "manseryeok";
import {
  BRANCHES, BRANCHES_KO, HIDDEN_STEMS, STEMS, STEMS_KO, branchElement, branchIndexOfKo, stemElement, stemIndexOfKo,
} from "./labels";
import type { SajuElement } from "./labels";
import {
  DEFAULT_POLICY, KOREA_LONGITUDE_RANGE, MAX_SUPPORTED_DATE, MIN_SUPPORTED_DATE, STANDARD_TIME_START, SUPPORTED_TIME_ZONE,
  SajuError, correctedClockMs, koreaCivilOffsetAt, koreaWallClockInstants,
} from "./policy";
import type { JasiRule, ResolvedCivilTime, SajuPolicy } from "./policy";

/** Pinned engine (package.json `"manseryeok": "2.0.0"`); stored on every chart (P12). */
export const SAJU_ENGINE = "manseryeok@2.0.0" as const;

export interface SajuInput {
  calendar: "solar" | "lunar";
  year: number; month: number; day: number;
  /** lunar only; the user states 평달/윤달 explicitly (P7) */
  isLeapMonth?: boolean;
  /** civil wall clock at the birthplace; null = unknown (P6) */
  time: { hour: number; minute: number } | null;
  gender: "female" | "male";
  /** `timeZone` (IANA) defaults to Asia/Seoul, the only zone supported until P11 */
  place: { name: string; longitude: number; timeZone?: string };
}

export interface Pillar {
  stem: string; branch: string;
  /** hangul reading, e.g. "기사" */
  ko: string;
  /** ten god of the stem relative to the day master ("일간" for the day master itself) */
  stemGod: string;
  /** ten god of the branch's 본기 */
  branchGod: string;
  /** 지장간, 본기 first */
  hidden: string[];
}

export type SajuWarningCode = "TERM_BOUNDARY" | "HOUR_BOUNDARY" | "AMBIGUOUS_CIVIL_TIME" | "PRE_1908";
export interface SajuWarning { code: SajuWarningCode; message: string }

/** Time unknown (P6): a pillar that changes during the civil day. `switchesAtKST` is the civil clock ("HH:mm"). */
export interface AmbiguousPillar { pillar: "year" | "month"; candidates: string[]; switchesAtKST: string }

export interface SajuLuck {
  /** null when the year pillar is not certain (time unknown on 입춘 day) */
  forward: boolean | null;
  /** 대운수: round(days to the adjacent 절 / 3), min 1 (P9); null when time is unknown */
  startAge: number | null;
  start: { years: number; months: number; days: number } | null;
  /** empty when the month pillar is not certain */
  pillars: { ganzhi: string; ko: string; startAge: number | null }[];
}

export interface SajuChart {
  engine: typeof SAJU_ENGINE;
  policy: SajuPolicy;
  input: SajuInput;
  solarDate: string;
  /** "YYYY-MM-DD", leap months as "YYYY-윤MM-DD" */
  lunarDate: string;
  /** birth instant (ISO, UTC); null when time is unknown */
  instantUTC: string | null;
  /** the clock the day/hour pillars were read on ("HH:mm", seconds truncated); null when time is unknown */
  correctedLocalTime: string | null;
  /** corrected clock minus input wall clock, minutes (1 decimal); null when time is unknown */
  correctionMinutes: number | null;
  /** the 절 that opened the month pillar */
  monthStartTerm: { name: string; hanja: string; instantUTC: string } | null;
  pillars: { year: Pillar; month: Pillar; day: Pillar; hour: Pillar | null };
  dayMaster: { stem: string; ko: string; element: SajuElement };
  /** visible stems + branches only (8, or 6 when time is unknown) */
  elements: Record<SajuElement, number>;
  luck: SajuLuck;
  ambiguous: AmbiguousPillar[];
  warnings: SajuWarning[];
  /** Korean 해요체 notes on what the calculation did */
  notes: string[];
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MINUTES = 540;
const TIME_UNKNOWN_NOTE = "태어난 시를 몰라 시주를 비웠어요. 시주가 다루는 해석은 하지 않아요.";

interface CivilDate { year: number; month: number; day: number }

export function computeChart(input: SajuInput, policy: SajuPolicy = DEFAULT_POLICY): SajuChart {
  const longitude = validatePlace(input.place);
  if (input.gender !== "female" && input.gender !== "male") throw invalidInput();
  const date = toSolarDate(input);
  const pre1908 = compareDates(date, STANDARD_TIME_START) < 0;
  const frame: CivilFrame = { longitude, policy, pre1908 };

  const warnings: SajuWarning[] = [];
  if (pre1908) {
    warnings.push({ code: "PRE_1908", message: "1908년 4월 이전 출생이라 입력 시각을 출생지 지방평균시로 보고 계산했어요. 당시 기록 방식에 따라 결과가 달라질 수 있어요." });
  }
  const reading = input.time ? readKnownTime(date, input.time, input.gender, frame) : readUnknownTime(date, input.gender, frame);
  warnings.push(...reading.warnings);

  const d = reading.detail;
  const year = toPillar(d.year, d.tenGods.year);
  const month = toPillar(d.month, d.tenGods.month);
  const day = toPillar(d.day, d.tenGods.day);
  const hour = input.time ? toPillar(d.hour, d.tenGods.hour) : null;

  const elements: Record<SajuElement, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const p of [year, month, day, hour]) {
    if (!p) continue;
    elements[stemElement(p.stem)]++;
    elements[branchElement(p.branch)]++;
  }
  const dayElement = stemElement(day.stem);
  const lunar = solarToLunar(date.year, date.month, date.day);

  return {
    engine: SAJU_ENGINE,
    policy,
    input: { ...input },
    solarDate: `${date.year}-${pad(date.month)}-${pad(date.day)}`,
    lunarDate: `${lunar.year}-${lunar.isLeapMonth ? "윤" : ""}${pad(lunar.month)}-${pad(lunar.day)}`,
    instantUTC: reading.instantMs === null ? null : new Date(reading.instantMs).toISOString(),
    correctedLocalTime: reading.clockMs === null ? null : hhmm(reading.clockMs),
    correctionMinutes: reading.correctionMinutes,
    monthStartTerm: reading.monthStartTerm,
    pillars: { year, month, day, hour },
    dayMaster: { stem: day.stem, ko: day.ko.slice(0, 1) + dayElement, element: dayElement },
    elements,
    luck: reading.luck,
    ambiguous: reading.ambiguous,
    warnings,
    notes: reading.notes,
  };
}

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

function invalidInput(): SajuError {
  return new SajuError("INVALID_INPUT", "날짜나 시각이 올바르지 않아요. 다시 확인해 주세요.");
}

function validatePlace(place: SajuInput["place"]): number {
  if (!place || !Number.isFinite(place.longitude)) throw invalidInput();
  const { min, max } = KOREA_LONGITUDE_RANGE;
  if ((place.timeZone ?? SUPPORTED_TIME_ZONE) !== SUPPORTED_TIME_ZONE || place.longitude < min || place.longitude > max) {
    throw new SajuError("UNSUPPORTED_PLACE", "지금은 한국에서 태어난 경우만 계산할 수 있어요.");
  }
  return place.longitude;
}

function toSolarDate(input: SajuInput): CivilDate {
  const { year, month, day } = input;
  if (![year, month, day].every(Number.isInteger)) throw invalidInput();
  let date: CivilDate;
  if (input.calendar === "lunar") {
    if (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR) throw outOfRange(); // the solar result is range-checked below
    const leap = input.isLeapMonth ?? false;
    try {
      date = lunarToSolar(year, month, day, leap);
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      throw new SajuError("INVALID_LUNAR_DATE", `음력 ${year}년 ${leap ? "윤" : ""}${month}월 ${day}일은 없는 날짜예요. 평달·윤달과 날짜를 다시 확인해 주세요.`);
    }
  } else if (input.calendar === "solar") {
    if (!isValidSolarDate(year, month, day)) throw invalidInput();
    date = { year, month, day };
  } else {
    throw invalidInput();
  }
  if (compareDates(date, MIN_SUPPORTED_DATE) < 0 || compareDates(date, MAX_SUPPORTED_DATE) > 0) throw outOfRange();
  return date;
}

function outOfRange(): SajuError {
  return new SajuError("OUT_OF_RANGE", `${MIN_SUPPORTED_DATE.year}년부터 ${MAX_SUPPORTED_DATE.year}년까지 태어난 경우만 계산할 수 있어요.`);
}

// ---------------------------------------------------------------------------------------------
// Civil time (P1, P8, P10)
// ---------------------------------------------------------------------------------------------

interface CivilFrame { longitude: number; policy: SajuPolicy; pre1908: boolean }

/** Instants a wall-clock reading can denote under the policy (empty = skipped by a clock jump). */
function wallClockInstants(wallMs: number, frame: CivilFrame): ResolvedCivilTime[] {
  if (!frame.policy.applyHistoricalDst) {
    return [{ instantMs: wallMs - KST_OFFSET_MINUTES * MINUTE_MS, offsetMinutes: KST_OFFSET_MINUTES, standardOffsetMinutes: KST_OFFSET_MINUTES }];
  }
  if (frame.pre1908) {
    const lmtMinutes = frame.longitude * 4;
    return [{ instantMs: wallMs - Math.round(lmtMinutes * MINUTE_MS), offsetMinutes: lmtMinutes, standardOffsetMinutes: lmtMinutes }];
  }
  return koreaWallClockInstants(wallMs);
}

/** Civil offset at an instant, for showing engine moments (절입) on the user's clock. */
function civilOffsetMinutesAt(instantMs: number, frame: CivilFrame): number {
  if (!frame.policy.applyHistoricalDst) return KST_OFFSET_MINUTES;
  return koreaCivilOffsetAt(instantMs)?.offsetMinutes ?? frame.longitude * 4;
}

// ---------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------

/**
 * Runs manseryeok with every policy decision already made: year/month from `instantMs`, day/hour
 * from `clockMs`. With applyHistoricalDst=false the engine reads its fields as UTC+9 and puts the
 * day/hour clock at instant + longitude×4 min, so we pass the UTC+9 fields of our instant and the
 * "longitude" that lands on our clock. Engine fields have minute resolution; only pre-1908 LMT
 * instants carry seconds, and 절입 moments are whole minutes, so year/month are unaffected.
 */
function runEngine(instantMs: number, clockMs: number, jasi: JasiRule, gender: SajuInput["gender"]): FourPillarsDetail {
  const kstMs = Math.floor((instantMs + KST_OFFSET_MINUTES * MINUTE_MS) / MINUTE_MS) * MINUTE_MS;
  const engineInstantMs = kstMs - KST_OFFSET_MINUTES * MINUTE_MS;
  // Date truncates fractional ms toward zero; nudge by half a ms so float error cannot move the engine's clock off ours.
  const nudge = clockMs >= 0 ? 0.5 : -0.5;
  const longitude = (clockMs - engineInstantMs + nudge) / (4 * MINUTE_MS);
  const k = new Date(kstMs);
  return calculateFourPillars({
    year: k.getUTCFullYear(), month: k.getUTCMonth() + 1, day: k.getUTCDate(), hour: k.getUTCHours(), minute: k.getUTCMinutes(),
    trueSolarTime: { longitude, applyEquationOfTime: false, applyHistoricalDst: false },
    dayBoundary: jasi === "SPLIT_NEXT_DAY_STEM" ? "splitJasi" : "jasi",
    gender,
  });
}

interface Reading {
  detail: FourPillarsDetail;
  instantMs: number | null;
  clockMs: number | null;
  correctionMinutes: number | null;
  monthStartTerm: SajuChart["monthStartTerm"];
  luck: SajuLuck;
  ambiguous: AmbiguousPillar[];
  warnings: SajuWarning[];
  notes: string[];
}

function readKnownTime(date: CivilDate, time: NonNullable<SajuInput["time"]>, gender: SajuInput["gender"], frame: CivilFrame): Reading {
  const { hour, minute } = time;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) throw invalidInput();
  const { policy, longitude } = frame;
  const wallMs = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const warnings: SajuWarning[] = [];

  const candidates = wallClockInstants(wallMs, frame);
  const civil = candidates[0];
  if (!civil) {
    throw new SajuError("NONEXISTENT_CIVIL_TIME",
      `${date.year}년 ${date.month}월 ${date.day}일 ${hhmm(wallMs)}은 시계를 앞당기며 건너뛴 시각이라 실제로는 없었어요. 출생 기록을 다시 확인해 주세요.`);
  }
  if (candidates.length > 1) {
    const dst = civil.offsetMinutes !== civil.standardOffsetMinutes ? "(서머타임)" : "";
    warnings.push({ code: "AMBIGUOUS_CIVIL_TIME", message: `시계를 되돌려 같은 시각이 두 번 있었던 날이에요. 앞의 시각${dst}으로 계산했어요.` });
  }

  const clockMs = correctedClockMs(policy.clock, civil.instantMs, wallMs, civil, longitude);
  const detail = runEngine(civil.instantMs, clockMs, policy.jasi, gender);

  // P2: 절입 within the warning window
  const windowMs = policy.termBoundaryWarnSeconds * 1000;
  const near = jeolAround(civil.instantMs).find(t => Math.abs(t.ms - civil.instantMs) <= windowMs);
  if (near) {
    const at = new Date(near.ms + civilOffsetMinutesAt(near.ms, frame) * MINUTE_MS);
    warnings.push({
      code: "TERM_BOUNDARY",
      message: `절입 시각(${near.name} ${at.getUTCMonth() + 1}월 ${at.getUTCDate()}일 ${hhmm(at.getTime())}) 앞뒤 ${spanLabel(policy.termBoundaryWarnSeconds)} 안에 태어나 ${near.name === "입춘" ? "연주·월주" : "월주"}가 기관·천문력에 따라 달라질 수 있어요.`,
    });
  }
  // P13: 시진 boundary (odd hours) on the corrected clock
  const timeOfDay = ((clockMs % DAY_MS) + DAY_MS) % DAY_MS;
  for (let h = 1; h < 24; h += 2) {
    if (Math.abs(timeOfDay - h * HOUR_MS) <= policy.hourBoundaryWarnMinutes * MINUTE_MS) {
      warnings.push({
        code: "HOUR_BOUNDARY",
        message: `보정 시각이 시진 경계(${pad(h)}:00) 앞뒤 ${policy.hourBoundaryWarnMinutes}분 안이라 출생 기록 오차에 따라 시주가 달라질 수 있어요.`,
      });
    }
  }

  const luck = detail.luckPillars!;
  return {
    detail,
    instantMs: civil.instantMs,
    clockMs,
    correctionMinutes: Math.round(((clockMs - wallMs) / MINUTE_MS) * 10) / 10 || 0,
    monthStartTerm: monthStartTerm(civil.instantMs),
    luck: {
      forward: luck.forward,
      startAge: luck.startAge,
      start: { years: luck.startYears, months: luck.startMonths, days: luck.startDays },
      pillars: luck.pillars.map(p => ({ ganzhi: hanja(p.pillar), ko: p.korean, startAge: p.age })),
    },
    ambiguous: [],
    warnings,
    notes: correctionNotes(date, civil, clockMs, frame),
  };
}

function correctionNotes(date: CivilDate, civil: ResolvedCivilTime, clockMs: number, frame: CivilFrame): string[] {
  const notes: string[] = [];
  if (frame.policy.applyHistoricalDst && !frame.pre1908) {
    const dstMinutes = civil.offsetMinutes - civil.standardOffsetMinutes;
    if (dstMinutes !== 0) notes.push(`서머타임 기간이라 ${dstMinutes / 60}시간 빼서 계산했어요`);
    if (civil.standardOffsetMinutes === 510) notes.push("당시 표준시(UTC+8:30) 기준으로 계산했어요");
  }
  const label = { LMT: "경도 보정으로", LAT: "경도·균시차 보정으로", FIXED_127_5: "동경 127.5도 기준으로", ERA_STANDARD: null, WALL: null }[frame.policy.clock];
  // shift relative to the era's standard clock, so DST (noted above) is not counted twice
  const shift = Math.round((clockMs - (civil.instantMs + civil.standardOffsetMinutes * MINUTE_MS)) / MINUTE_MS);
  if (label && shift !== 0) {
    const c = new Date(clockMs);
    const dayDiff = compareDates({ year: c.getUTCFullYear(), month: c.getUTCMonth() + 1, day: c.getUTCDate() }, date);
    const dayTag = dayDiff < 0 ? "전날 " : dayDiff > 0 ? "다음 날 " : "";
    notes.push(`${label} ${Math.abs(shift)}분 ${shift < 0 ? "앞당겨" : "늦춰"} 계산했어요 (보정 시각 ${dayTag}${hhmm(clockMs)})`);
  }
  return notes;
}

/**
 * P6: never assume noon. Probe the first and last minute of the civil day; year/month come from those
 * instants and are reported as ambiguous when a 절 falls in between. The day pillar is the civil date's
 * (research §9 G11u/G21: no day ambiguity under any profile), so the probes read the day on the wall clock
 * with the split 子 rule. The shown year/month is the candidate that holds for more of the day.
 */
function readUnknownTime(date: CivilDate, gender: SajuInput["gender"], frame: CivilFrame): Reading {
  const first = dayProbe(date, "first", frame);
  const last = dayProbe(date, "last", frame);
  const a = runEngine(first.instantMs, first.wallMs, "SPLIT_NEXT_DAY_STEM", gender);
  const b = runEngine(last.instantMs, last.wallMs, "SPLIT_NEXT_DAY_STEM", gender);

  const ambiguous: AmbiguousPillar[] = [];
  let chosen = a;
  let chosenInstant = first.instantMs;
  const switchTerm = jeolAround(first.instantMs).find(t => t.ms > first.instantMs && t.ms <= last.instantMs);
  if (switchTerm && (hanja(a.year) !== hanja(b.year) || hanja(a.month) !== hanja(b.month))) {
    const switchesAtKST = hhmm(switchTerm.ms + civilOffsetMinutesAt(switchTerm.ms, frame) * MINUTE_MS);
    for (const key of ["year", "month"] as const) {
      if (hanja(a[key]) !== hanja(b[key])) ambiguous.push({ pillar: key, candidates: [hanja(a[key]), hanja(b[key])], switchesAtKST });
    }
    if (switchTerm.ms - first.instantMs < last.instantMs + MINUTE_MS - switchTerm.ms) {
      chosen = b;
      chosenInstant = last.instantMs;
    }
  }

  const yearCertain = !ambiguous.some(x => x.pillar === "year");
  const monthCertain = !ambiguous.some(x => x.pillar === "month");
  const luck = chosen.luckPillars!;
  return {
    detail: chosen,
    instantMs: null,
    clockMs: null,
    correctionMinutes: null,
    monthStartTerm: monthStartTerm(chosenInstant),
    luck: {
      forward: yearCertain ? luck.forward : null,
      startAge: null,
      start: null,
      pillars: yearCertain && monthCertain ? luck.pillars.map(p => ({ ganzhi: hanja(p.pillar), ko: p.korean, startAge: null })) : [],
    },
    ambiguous,
    warnings: [],
    notes: [TIME_UNKNOWN_NOTE],
  };
}

/** First (or last) existing minute of the civil day and its instant (earliest reading first, latest last). */
function dayProbe(date: CivilDate, which: "first" | "last", frame: CivilFrame): { wallMs: number; instantMs: number } {
  const midnight = Date.UTC(date.year, date.month - 1, date.day);
  for (let i = 0; i < 180; i++) {
    const wallMs = midnight + (which === "first" ? i : 1439 - i) * MINUTE_MS;
    const instants = wallClockInstants(wallMs, frame);
    const pick = which === "first" ? instants[0] : instants[instants.length - 1];
    if (pick) return { wallMs, instantMs: pick.instantMs };
  }
  throw new Error("No existing wall-clock minute near the day boundary"); // gaps are at most 60 min
}

// ---------------------------------------------------------------------------------------------
// 절 (month-opening solar terms)
// ---------------------------------------------------------------------------------------------

interface Jeol { name: string; hanja: string; ms: number }

/** 절 (even term indices) from the year before to the year after the instant, in time order. */
function jeolAround(instantMs: number): Jeol[] {
  const y = new Date(instantMs).getUTCFullYear();
  const out: Jeol[] = [];
  for (const year of [y - 1, y, y + 1]) {
    for (let index = 0; index < 24; index += 2) {
      const t = getSolarTerm(year, index);
      out.push({ name: t.name, hanja: t.hanja, ms: t.date.getTime() });
    }
  }
  return out.sort((p, q) => p.ms - q.ms);
}

function monthStartTerm(instantMs: number): SajuChart["monthStartTerm"] {
  const t = jeolAround(instantMs).filter(j => j.ms <= instantMs).at(-1);
  return t ? { name: t.name, hanja: t.hanja, instantUTC: new Date(t.ms).toISOString() } : null;
}

// ---------------------------------------------------------------------------------------------
// Labels and formatting
// ---------------------------------------------------------------------------------------------

function hanja(p: EnginePillar): string {
  return STEMS[stemIndexOfKo(p.heavenlyStem)]! + BRANCHES[branchIndexOfKo(p.earthlyBranch)]!;
}

function toPillar(p: EnginePillar, gods: { stem: string; branch: string }): Pillar {
  const si = stemIndexOfKo(p.heavenlyStem);
  const bi = branchIndexOfKo(p.earthlyBranch);
  const branch = BRANCHES[bi]!;
  return {
    stem: STEMS[si]!, branch, ko: STEMS_KO[si]! + BRANCHES_KO[bi]!,
    stemGod: gods.stem, branchGod: gods.branch, hidden: [...HIDDEN_STEMS[branch]],
  };
}

function compareDates(a: CivilDate, b: CivilDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:mm" of UTC-field milliseconds, seconds truncated (a clock at 11:27:55 shows 11:27). */
function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function spanLabel(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60}분` : `${seconds}초`;
}
