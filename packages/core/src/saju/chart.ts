import { calculateFourPillars, getSolarTerm, isValidSolarDate, lunarToSolar, solarToLunar, LUNAR_MAX_YEAR, LUNAR_MIN_YEAR } from "manseryeok";
import type { FourPillarsDetail, Pillar as EnginePillar } from "manseryeok";
import {
  BRANCHES, BRANCHES_KO, HIDDEN_STEMS, STEMS, STEMS_KO, branchElement, branchIndexOfKo, ganzhiKo, shiftGanzhi, stemElement,
  stemIndexOfKo,
} from "./labels";
import type { HiddenStem, SajuElement } from "./labels";
import {
  DEFAULT_POLICY, MAX_SUPPORTED_DATE, MIN_SUPPORTED_DATE, STANDARD_TIME_START, SUPPORTED_TIME_ZONE, SUPPORTED_TIME_ZONES, ZONE_LONGITUDE_RANGE,
  SajuError, correctedClockMs, kasiDstDisagreementAt, kasiKeepsSkippedHourAt, koreaCivilOffsetAt, koreaWallClockInstants, sajuAbroadEnabled, validatePolicy,
} from "./policy";
import type { JasiRule, ResolvedCivilTime, SajuPolicy } from "./policy";
import { zoneOffsetMsAt, zoneWallClockInstants } from "./zones";

/** Pinned engine (package.json `"manseryeok": "2.0.0"`); stored on every chart (P12). */
export const SAJU_ENGINE = "manseryeok@2.0.0" as const;

export interface SajuInput {
  calendar: "solar" | "lunar";
  year: number; month: number; day: number;
  /**
   * lunar only: 평달 (false) or 윤달 (true) as the user states it (P7), or "unknown" (모름): 평달 unless only
   * the leap month has that day; when that year has the leap month, LEAP_MONTH_UNKNOWN names its pillars
   */
  isLeapMonth?: boolean | "unknown";
  /** civil wall clock at the birthplace; null = unknown (P6) */
  time: { hour: number; minute: number } | null;
  gender: "female" | "male";
  /** `timeZone` (IANA) defaults to Asia/Seoul; SUPPORTED_TIME_ZONES lists the zones abroad (solar dates only) */
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
  /** 지장간 (월률분야): 여기, 중기 where there is one, then 본기, each with its role */
  hidden: HiddenStem[];
}

export type SajuWarningCode =
  | "TERM_BOUNDARY" | "HOUR_BOUNDARY" | "AMBIGUOUS_CIVIL_TIME" | "PRE_1908"
  /** time unknown: a year/month pillar changes during the civil day (details in `ambiguous`) */
  | "PILLAR_AMBIGUOUS"
  /** time unknown: births inside `window` would get the day pillar `window.dayPillar` instead */
  | "DAY_PILLAR_WINDOW"
  /** time known, corrected clock 23:00–24:00 under SPLIT_NEXT_DAY_STEM: calendars that change the day at 23:00 show `dayPillar` */
  | "JASI_DAY_PILLAR"
  /** time known, corrected clock within the P13 window after 00:00 under SPLIT_NEXT_DAY_STEM: `pillars` is a few minutes earlier, the day before */
  | "DAY_BOUNDARY"
  /** time known, inside a span where KASI's 역서 DST table and tzdata disagree (policy KASI_DST_DISAGREEMENTS): `pillars` is KASI's reading */
  | "DST_BOUNDARY"
  /** lunar date with 윤달 '모름' and that leap month exists: computed as 평달, `pillars` is the 윤달 chart */
  | "LEAP_MONTH_UNKNOWN";

export type PillarKey = "year" | "month" | "day" | "hour";

export interface SajuWarning {
  code: SajuWarningCode;
  /** Korean UI copy */
  message: string;
  /** DAY_PILLAR_WINDOW only: civil-clock minutes ("HH:mm", inclusive) and the day pillar they would get */
  window?: { from: string; to: string; dayPillar: string };
  /**
   * The day pillar the message names: the next day's for JASI_DAY_PILLAR (and for HOUR_BOUNDARY just before
   * 23:00 under SPLIT_NEXT_DAY_STEM); the other reading's when its day differs (DST_BOUNDARY, HOUR_BOUNDARY,
   * DAY_BOUNDARY, LEAP_MONTH_UNKNOWN)
   */
  dayPillar?: string;
  /**
   * HOUR_BOUNDARY, DAY_BOUNDARY (and JASI_DAY_PILLAR within the window after 23:00 or before 00:00), DST_BOUNDARY,
   * LEAP_MONTH_UNKNOWN: the other reading's pillars that differ from this chart, each as its candidates (two only
   * when the time is unknown and a 절 falls on the other reading's day). Every ganzhi the message names is here or
   * in `dayPillar`.
   */
  pillars?: Partial<Record<PillarKey, string[]>>;
}

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
  /** Korean 해요체 notes on what the calculation did; with 윤달 '모름' on a day only the 윤달 has, the first one says so */
  notes: string[];
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MINUTES = 540;
const TIME_UNKNOWN_NOTE = "태어난 시를 몰라 시주를 비웠어요. 시주가 다루는 해석은 하지 않아요.";

interface CivilDate { year: number; month: number; day: number }

export function computeChart(input: SajuInput, requestedPolicy: SajuPolicy = DEFAULT_POLICY): SajuChart {
  if (input.calendar === "lunar" && input.isLeapMonth === "unknown") return leapUnknownChart(input, requestedPolicy);
  const policy = validatePolicy(requestedPolicy); // a fresh copy, stored on the chart
  const { longitude, timeZone } = validatePlace(input.place);
  if (input.gender !== "female" && input.gender !== "male") throw invalidInput();
  if (timeZone !== "Asia/Seoul" && input.calendar === "lunar") throw new SajuError("UNSUPPORTED_CALENDAR", "해외 출생은 양력 생일로만 계산할 수 있어요.");
  const date = toSolarDate(input);
  const pre1908 = timeZone === "Asia/Seoul" && compareDates(date, STANDARD_TIME_START) < 0;
  const frame: CivilFrame = { longitude, timeZone, policy, pre1908 };

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

type SupportedZone = (typeof SUPPORTED_TIME_ZONES)[number];

function validatePlace(place: SajuInput["place"]): { longitude: number; timeZone: SupportedZone } {
  if (!place || !Number.isFinite(place.longitude)) throw invalidInput();
  const timeZone = place.timeZone ?? SUPPORTED_TIME_ZONE;
  const abroad = sajuAbroadEnabled();
  const range = timeZone === SUPPORTED_TIME_ZONE || abroad ? (ZONE_LONGITUDE_RANGE as Readonly<Record<string, { min: number; max: number }>>)[timeZone] : undefined;
  if (!range || place.longitude < range.min || place.longitude > range.max) {
    // Korean inputs (and every input while the flag is off) keep their sentence byte for byte; only other zones get the new one.
    const message = timeZone === SUPPORTED_TIME_ZONE || !abroad ? "지금은 한국에서 태어난 경우만 계산할 수 있어요." : "지금은 한국, 일본, 대만, 홍콩에서 태어난 경우만 계산할 수 있어요.";
    throw new SajuError("UNSUPPORTED_PLACE", message);
  }
  return { longitude: place.longitude, timeZone: timeZone as SupportedZone };
}

function toSolarDate(input: SajuInput): CivilDate {
  const { year, month, day } = input;
  if (![year, month, day].every(Number.isInteger)) throw invalidInput();
  let date: CivilDate;
  if (input.calendar === "lunar") {
    if (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR) throw outOfRange(); // the solar result is range-checked below
    const leap = input.isLeapMonth === true; // "unknown" never gets here (leapUnknownChart)
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

/**
 * 윤달 '모름' (P7): both readings are computed. The chart is the 평달 one (the 윤달 one when only the leap month
 * has that day); when that year has the leap month and its chart differs, LEAP_MONTH_UNKNOWN comes first with
 * the 윤달 chart's pillars. A year without that leap month is 평달 with no word about it. The input is kept as given.
 * With the 평달 chart in hand the 윤달 is only an alternative, so any input error there (that day missing, a time
 * its date skipped, past 2100) leaves nothing to name instead of failing the chart.
 */
function leapUnknownChart(input: SajuInput, policy: SajuPolicy): SajuChart {
  const attempt = (isLeapMonth: boolean, giveUp: (e: SajuError) => boolean): SajuChart | null => {
    try {
      return computeChart({ ...input, isLeapMonth }, policy);
    } catch (e) {
      if (e instanceof SajuError && giveUp(e)) return null;
      throw e;
    }
  };
  const regular = attempt(false, e => e.code === "INVALID_LUNAR_DATE");
  const leap = attempt(true, e => regular !== null || e.code === "INVALID_LUNAR_DATE");
  const { year, month, day } = input;
  if (!regular && !leap) throw new SajuError("INVALID_LUNAR_DATE", `음력 ${year}년 ${month}월 ${day}일은 평달에도 윤달에도 없는 날짜예요. 날짜를 다시 확인해 주세요.`);
  if (!regular) return { ...leap!, input: { ...input }, notes: [`음력 ${year}년 ${month}월 ${day}일은 윤달에만 있는 날이라 윤달로 계산했어요.`, ...leap!.notes] };
  const chart: SajuChart = { ...regular, input: { ...input } };
  if (!leap) return chart;
  const pillars = differingPillars(chartPillars(regular), chartPillars(leap));
  if (Object.keys(pillars).length === 0) return chart;
  const [leapYear, leapMonth, leapDay] = leap.solarDate.split("-").map(Number);
  // the year only when it is not the lunar year the sentence names (2033 윤11-20 is 2034-01-10)
  const leapDate = `${leapYear === year ? "" : `${leapYear}년 `}${leapMonth}월 ${leapDay}일`;
  const warning: SajuWarning = {
    code: "LEAP_MONTH_UNKNOWN",
    message: `음력 ${year}년 ${month}월은 평달과 윤달이 둘 다 있어서 평달로 계산했어요. 윤달이라면 양력 ${leapDate}생이고, ${pillarPhrase(pillars)} 돼요.`,
    pillars,
    ...(pillars.day ? { dayPillar: pillars.day[0] } : {}),
  };
  return { ...chart, warnings: [warning, ...regular.warnings] };
}

// ---------------------------------------------------------------------------------------------
// Civil time (P1, P8, P10)
// ---------------------------------------------------------------------------------------------

interface CivilFrame { longitude: number; timeZone: string; policy: SajuPolicy; pre1908: boolean }

/**
 * Instants a wall-clock reading can denote under the policy (empty = skipped by a clock jump).
 * Zones abroad read the runtime's tzdata and ignore applyHistoricalDst: tzdata is their history.
 */
function wallClockInstants(wallMs: number, frame: CivilFrame): ResolvedCivilTime[] {
  if (frame.timeZone !== "Asia/Seoul") return zoneWallClockInstants(wallMs, frame.timeZone);
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
  if (frame.timeZone !== "Asia/Seoul") return zoneOffsetMsAt(instantMs, frame.timeZone) / 60_000;
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
    const at = `${date.year}년 ${date.month}월 ${date.day}일 ${hhmm(wallMs)}`;
    // §6.2: an hour tzdata skips that KASI's table still has (it puts the jump elsewhere)
    const kept = frame.timeZone === "Asia/Seoul" && policy.applyHistoricalDst && !frame.pre1908 ? kasiKeepsSkippedHourAt(wallMs) : undefined;
    if (!kept) throw new SajuError("NONEXISTENT_CIVIL_TIME", `${at}은 시계를 앞당기며 건너뛴 시각이라 실제로는 없었어요. 출생 기록을 다시 확인해 주세요.`);
    const kasiStart = kept.kasiDst ? kept.from : kept.to;
    const startDay = kasiStart.slice(0, 10) === `${date.year}-${pad(date.month)}-${pad(date.day)}` ? "그날" : "전날";
    const kasi = kept.kasiDst
      ? `, 그 표대로 1시간을 빼는 만세력에서는 전날 ${hhmm(wallMs - HOUR_MS)}으로 계산해요.` // KASI's DST already runs: an hour earlier is the day before
      : " 이 시각이 있었어요."; // KASI's DST starts later that day: the hour is still standard time
    throw new SajuError("NONEXISTENT_CIVIL_TIME", `${at}은 국제 시간대 자료(tzdata) 기준으로 시계를 앞당기며 건너뛴 시각이라 여기서는 계산하지 않아요. `
      + `한국천문연구원 역서 표로는 ${startDay} ${Number(kasiStart.slice(11, 13))}시에 서머타임이 시작돼서${kasi} 출생 기록을 다시 확인해 주세요.`);
  }
  if (candidates.length > 1) {
    const dst = civil.offsetMinutes !== civil.standardOffsetMinutes ? "(서머타임 기준)" : "";
    warnings.push({ code: "AMBIGUOUS_CIVIL_TIME", message: `시계를 되돌려 같은 시각이 두 번 있었던 날이에요. 먼저 지나간 시각${dst}으로 계산했어요.` });
  }

  const clockMs = correctedClockMs(policy.clock, civil.instantMs, wallMs, civil, longitude);
  const detail = runEngine(civil.instantMs, clockMs, policy.jasi, gender);
  const ours = detailPillars(detail);
  /** Another reading of this birth (its instant and its clock): the pillars that differ from this chart. */
  const otherReading = (instantMs: number, otherClockMs: number) => differingPillars(ours, detailPillars(runEngine(instantMs, otherClockMs, policy.jasi, gender)));

  // P1 vs KASI's 역서: where its DST table and tzdata disagree by an hour, the pillars KASI's reading gives (research §6.2)
  const disputed = frame.timeZone === "Asia/Seoul" && policy.applyHistoricalDst && !frame.pre1908 ? kasiDstDisagreementAt(wallMs) : undefined;
  if (disputed && disputed.kasiDst !== (civil.offsetMinutes !== civil.standardOffsetMinutes)) {
    const offsetMinutes = civil.standardOffsetMinutes + (disputed.kasiDst ? 60 : 0);
    const kasi: ResolvedCivilTime = { instantMs: wallMs - offsetMinutes * MINUTE_MS, offsetMinutes, standardOffsetMinutes: civil.standardOffsetMinutes };
    const pillars = otherReading(kasi.instantMs, correctedClockMs(policy.clock, kasi.instantMs, wallMs, kasi, longitude));
    if (Object.keys(pillars).length > 0) {
      const start = disputed.edge === "start";
      // 1948–50 starts: KASI's clock jumped at 23:00, so this wall time never showed on its table; a calendar using
      // the table just subtracts the hour
      const reading = !disputed.kasiDst ? "아직 서머타임 전이라 1시간 늦은 순간이 되고, 그러면"
        : start ? `그날 ${Number(disputed.from.slice(11, 13))}시에 서머타임이 시작돼서, 그 표대로 1시간을 빼는 만세력에서는`
        : "아직 서머타임이라 1시간 이른 순간이 되고, 그러면";
      warnings.push({
        code: "DST_BOUNDARY",
        message: `${disputed.year}년 서머타임 ${start ? "시작" : "종료"} 무렵은 자료마다 1시간 차이가 나요. 여기서는 국제 시간대 자료(tzdata)를 따랐어요. `
          + `한국천문연구원 역서 표로는 ${reading} ${pillarPhrase(pillars)} 돼요.`,
        pillars,
        ...(pillars.day ? { dayPillar: pillars.day[0] } : {}),
      });
    }
  }

  // P2: 절입 within the warning window
  const windowMs = policy.termBoundaryWarnSeconds * 1000;
  const near = jeolAround(civil.instantMs).find(t => Math.abs(t.ms - civil.instantMs) <= windowMs);
  if (near) {
    const at = new Date(near.ms + civilOffsetMinutesAt(near.ms, frame) * MINUTE_MS);
    warnings.push({
      code: "TERM_BOUNDARY",
      message: `절입 시각(${near.name} ${at.getUTCMonth() + 1}월 ${at.getUTCDate()}일 ${hhmm(at.getTime())}) 앞뒤 ${spanLabel(policy.termBoundaryWarnSeconds)} 안에 태어나 ${near.name === "입춘" ? "연주·월주" : "월주"}가 만세력·천문 자료마다 달라질 수 있어요.`,
    });
  }
  // P13: a 시진 boundary (odd hour) within the window on the corrected clock: the pillars a few minutes the
  // other way give (the reading one minute before the boundary, or at it). The window counts whole minutes of
  // the clock as shown (seconds truncated), the unit the notice says: 22:50:55 and 23:10:55 are both 10 minutes.
  const timeOfDay = ((clockMs % DAY_MS) + DAY_MS) % DAY_MS;
  const dayStartMs = clockMs - timeOfDay;
  const boundary = (boundaryMs: number): { after: boolean; gap: string; pillars: PillarSet } | null => {
    const minutes = Math.abs(Math.floor(clockMs / MINUTE_MS) - boundaryMs / MINUTE_MS);
    if (minutes > policy.hourBoundaryWarnMinutes) return null;
    const after = clockMs >= boundaryMs;
    const otherClockMs = after ? boundaryMs - MINUTE_MS : boundaryMs;
    return { after, gap: minutes === 0 ? "1분 안쪽" : `${minutes}분`, pillars: otherReading(civil.instantMs + otherClockMs - clockMs, otherClockMs) };
  };
  let nearHour: { hour: number; after: boolean; gap: string; pillars: PillarSet } | null = null;
  for (let h = 1; h < 24; h += 2) {
    const found = boundary(dayStartMs + h * HOUR_MS);
    if (found) nearHour = { hour: h, ...found };
  }
  // P5: under the split rule the 일주 changes at 00:00 on the corrected clock (the 子 hour's pillar is the same on both sides)
  const split = policy.jasi === "SPLIT_NEXT_DAY_STEM";
  const withPillars = (b: ReturnType<typeof boundary>) => (b && Object.keys(b.pillars).length > 0 ? b : null);
  const afterMidnight = split ? withPillars(boundary(dayStartMs)) : null;
  const beforeMidnight = split ? withPillars(boundary(dayStartMs + DAY_MS)) : null;
  const next = shiftGanzhi(hanja(detail.day), 1);
  const nextDay = `다음 날 일진인 ${withKo(next)}${josa(next, "이", "가")} 돼요.`;
  // P4: the 23:00 hour keeps this day's pillar here; calendars that change the day at 23:00 show the next day's.
  // The boundaries at either end of the hour (23:00, then 00:00) join this line, so each moment gets one notice.
  const jasiHour = split && timeOfDay >= 23 * HOUR_MS;
  const joined = jasiHour && nearHour?.hour === 23 ? nearHour : null;
  if (jasiHour) {
    warnings.push({
      code: "JASI_DAY_PILLAR",
      message: `보정 시각(${hhmm(clockMs)})이 밤 11시대예요. 밤 11시대를 다음 날로 보는 만세력에서는 일주가 ${nextDay}`
        + (joined ? ` 시주가 바뀌는 시각(23:00)과도 ${joined.gap} 차이라, 실제로 몇 분 일찍 태어났다면 ${pillarPhrase(joined.pillars)} 돼요.` : "")
        + (beforeMidnight ? ` 일주가 바뀌는 자정(00:00)과도 ${beforeMidnight.gap} 차이라, 실제로 몇 분 늦게 태어났다면 여기서도 ${pillarPhrase(beforeMidnight.pillars)} 돼요.` : ""),
      dayPillar: next,
      ...(joined || beforeMidnight ? { pillars: { ...joined?.pillars, ...beforeMidnight?.pillars } } : {}),
    });
  }
  if (nearHour && !joined && Object.keys(nearHour.pillars).length > 0) {
    const { hour, after, gap, pillars } = nearHour;
    const head = `보정 시각(${hhmm(clockMs)})이 시주가 바뀌는 시각(${pad(hour)}:00)과 ${gap} 차이예요. 실제로 몇 분 ${after ? "일찍" : "늦게"} 태어났다면 ${pillarPhrase(pillars)}`;
    // just before 23:00 under the split rule a few minutes later is the 23:00 hour, which other calendars count as the next day
    const intoJasiHour = !after && hour === 23 && policy.jasi === "SPLIT_NEXT_DAY_STEM";
    warnings.push({
      code: "HOUR_BOUNDARY",
      message: intoJasiHour ? `${head} 되고, 밤 11시대를 다음 날로 보는 만세력에서는 일주도 ${nextDay}` : `${head} 돼요.`,
      pillars,
      ...(intoJasiHour ? { dayPillar: next } : pillars.day ? { dayPillar: pillars.day[0] } : {}),
    });
  }
  // just after 00:00 a few minutes earlier is the day before: another 일주, so another 일간
  if (afterMidnight) {
    const { gap, pillars } = afterMidnight;
    warnings.push({
      code: "DAY_BOUNDARY",
      message: `보정 시각(${hhmm(clockMs)})이 일주가 바뀌는 시각(00:00)과 ${gap} 차이예요. 실제로 몇 분 일찍 태어났다면 ${pillarPhrase(pillars)} 돼요.`,
      pillars,
      ...(pillars.day ? { dayPillar: pillars.day[0] } : {}),
    });
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
    if (dstMinutes !== 0) notes.push(`서머타임 기간이라 ${dstMinutes / 60}시간 빼서 계산했어요.`);
    if (civil.standardOffsetMinutes === 510) notes.push("당시 표준시(UTC+8:30) 기준으로 계산했어요.");
  }
  const label = { LMT: "경도 보정으로", LAT: "경도·균시차 보정으로", FIXED_127_5: "동경 127.5도 기준으로", ERA_STANDARD: null, WALL: null }[frame.policy.clock];
  // shift relative to the era's standard clock, so DST (noted above) is not counted twice
  const exactShift = (clockMs - (civil.instantMs + civil.standardOffsetMinutes * MINUTE_MS)) / MINUTE_MS;
  const shift = Math.round(exactShift);
  if (label && shift !== 0) {
    const c = new Date(clockMs);
    const dayDiff = compareDates({ year: c.getUTCFullYear(), month: c.getUTCMonth() + 1, day: c.getUTCDate() }, date);
    const dayTag = dayDiff < 0 ? "전날 " : dayDiff > 0 ? "다음 날 " : "";
    // "약" when the shift has seconds, so "약 32분" next to a truncated clock (12:00 → 11:27:55 → "11:27") reads right
    const about = Math.abs(exactShift - shift) > 1e-6 ? "약 " : "";
    notes.push(`${label} 시각을 ${about}${Math.abs(shift)}분 ${shift < 0 ? "앞당겨" : "늦춰"}(보정 시각 ${dayTag}${hhmm(clockMs)}) 계산했어요.`);
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

  const windows = dayPillarWindows(date, hanja(chosen.day), frame);
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
    warnings: [
      ...ambiguous.map(x => ({ code: "PILLAR_AMBIGUOUS" as const, message: pillarAmbiguousMessage(x) })),
      ...windows.map(w => w.warning),
    ],
    notes: windows.length
      ? [TIME_UNKNOWN_NOTE, `태어난 시를 몰라 일주는 날짜 기준으로 봤어요. ${windows.map(w => w.sentence).join(" ")}`]
      : [TIME_UNKNOWN_NOTE],
  };
}

function pillarAmbiguousMessage(x: AmbiguousPillar): string {
  const [before, after] = x.candidates as [string, string];
  return `태어난 시에 따라 ${x.pillar === "year" ? "연주" : "월주"}가 ${withKo(before)} 또는 ${withKo(after)}${josa(after, "이", "가")} 돼요. `
    + `${x.switchesAtKST} 이후라면 ${after}${josa(after, "이에요", "예요")}.`;
}

/**
 * Time unknown: the shown day pillar is the civil date's, but a birth at either edge of the civil day can
 * read as the neighbouring day on the corrected clock (P5): LMT/DST pull the start of the day back into
 * the previous day; DAY_CHANGES_AT_23 (or a forward correction) pushes the end into the next day.
 * Computed minute by minute for this date and policy; nothing is returned when the windows are empty (WALL).
 */
function dayPillarWindows(date: CivilDate, dayPillar: string, frame: CivilFrame): { sentence: string; warning: SajuWarning }[] {
  const midnight = Date.UTC(date.year, date.month - 1, date.day);
  const shiftAt = (wallMs: number): number | null => {
    const readings = wallClockInstants(wallMs, frame);
    if (readings.length === 0) return null; // skipped by a clock jump
    let shift = 0;
    for (const r of readings) { // an overlap minute counts if either reading moves the day
      const s = dayShift(correctedClockMs(frame.policy.clock, r.instantMs, wallMs, r, frame.longitude), midnight, frame.policy.jasi);
      if (s !== 0) shift = s;
    }
    return shift;
  };
  const scan = (want: -1 | 1): { from: number; to: number } | null => {
    let from: number | null = null;
    let to: number | null = null;
    for (let i = 0; i < 1440; i++) {
      const wallMs = midnight + (want < 0 ? i : 1439 - i) * MINUTE_MS;
      const s = shiftAt(wallMs);
      if (s === null) continue;
      if (s !== want) break;
      if (want < 0) { from ??= wallMs; to = wallMs; } else { to ??= wallMs; from = wallMs; }
    }
    return from === null || to === null ? null : { from, to };
  };

  const out: { sentence: string; warning: SajuWarning }[] = [];
  const start = scan(-1);
  if (start) {
    const [from, to] = [hhmm(start.from), hhmm(start.to)];
    const prev = shiftGanzhi(dayPillar, -1);
    out.push({
      sentence: `${from}~${to} 사이에 태어났다면 일주가 전날로 바뀔 수 있어요.`,
      warning: {
        code: "DAY_PILLAR_WINDOW",
        message: `${from}~${to} 사이에 태어났다면 일주가 전날 일진인 ${withKo(prev)}${josa(prev, "이", "가")} 돼요.`,
        window: { from, to, dayPillar: prev },
      },
    });
  }
  const end = scan(1);
  if (end) {
    const [from, to] = [hhmm(end.from), hhmm(end.to)];
    const next = shiftGanzhi(dayPillar, 1);
    out.push({
      sentence: `${from} 이후에 태어났다면 일주가 다음 날로 바뀔 수 있어요.`,
      warning: {
        code: "DAY_PILLAR_WINDOW",
        message: `${from} 이후에 태어났다면 일주가 다음 날 일진인 ${withKo(next)}${josa(next, "이", "가")} 돼요.`,
        window: { from, to, dayPillar: next },
      },
    });
  }
  return out;
}

/** -1 / 0 / +1: which day the corrected clock gives the day pillar, relative to the civil date (engine rule). */
function dayShift(clockMs: number, civilMidnightMs: number, jasi: JasiRule): number {
  let dayStart = Math.floor(clockMs / DAY_MS) * DAY_MS;
  if (jasi === "DAY_CHANGES_AT_23" && clockMs - dayStart >= 23 * HOUR_MS) dayStart += DAY_MS;
  return Math.sign(dayStart - civilMidnightMs);
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
    stemGod: gods.stem, branchGod: gods.branch, hidden: HIDDEN_STEMS[branch].map(h => ({ ...h })),
  };
}

const withKo = (ganzhi: string) => `${ganzhi}(${ganzhiKo(ganzhi)})`;

/** Pillars as candidate lists: one each, two where the time is unknown and a 절 falls that day. */
type PillarSet = Partial<Record<PillarKey, string[]>>;
const PILLAR_ORDER: readonly PillarKey[] = ["year", "month", "day", "hour"];
const PILLAR_KO: Readonly<Record<PillarKey, string>> = { year: "연주", month: "월주", day: "일주", hour: "시주" };

function detailPillars(d: FourPillarsDetail): PillarSet {
  return { year: [hanja(d.year)], month: [hanja(d.month)], day: [hanja(d.day)], hour: [hanja(d.hour)] };
}

/** A computed chart's pillars, with both candidates where `ambiguous` has them; no hour when the time is unknown. */
function chartPillars(c: SajuChart): PillarSet {
  const out: PillarSet = {};
  for (const key of PILLAR_ORDER) {
    const p = c.pillars[key];
    if (!p) continue;
    out[key] = [...(c.ambiguous.find(a => a.pillar === key)?.candidates ?? [p.stem + p.branch])];
  }
  return out;
}

/** The pillars of `other` that are not the same as `ours`. */
function differingPillars(ours: PillarSet, other: PillarSet): PillarSet {
  const out: PillarSet = {};
  for (const key of PILLAR_ORDER) {
    const candidates = other[key];
    if (candidates && candidates.join() !== (ours[key] ?? []).join()) out[key] = candidates;
  }
  return out;
}

/** "월주가 丙辰(병진), 일주가 癸巳(계사)가": pillar order, candidates joined by 또는, the particle on the last one. */
function pillarPhrase(pillars: PillarSet): string {
  const keys = PILLAR_ORDER.filter(key => pillars[key]?.length);
  return keys
    .map((key, i) => {
      const candidates = pillars[key]!;
      const particle = i === keys.length - 1 ? josa(candidates.at(-1)!, "이", "가") : "";
      return `${PILLAR_KO[key]}가 ${candidates.map(withKo).join(" 또는 ")}${particle}`;
    })
    .join(", ");
}

/** Korean particle by whether the ganzhi's hangul reading ends in a final consonant (받침). */
function josa(ganzhi: string, afterConsonant: string, afterVowel: string): string {
  const code = ganzhiKo(ganzhi).charCodeAt(1) - 0xac00;
  return code % 28 !== 0 ? afterConsonant : afterVowel;
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
