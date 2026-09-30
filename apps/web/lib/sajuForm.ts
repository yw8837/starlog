import {
  MAX_SUPPORTED_DATE,
  MIN_SUPPORTED_DATE,
  SajuError,
  computeChart,
  type SajuChart,
  type SajuErrorCode,
  type SajuInput,
} from "@starlog/core";

/**
 * Saju input form: the values the user picks, how they map onto the engine input, and the
 * friendly errors shown next to each field. Pure functions; storage lives in sajuFlow.ts.
 */

export interface BirthPlace {
  id: string;
  /** Shown in the select and passed to the engine as the place name. */
  label: string;
  /** Degrees east; provinces use the longitude of the city in brackets. */
  longitude: number;
}

export const BIRTH_PLACES: readonly BirthPlace[] = Object.freeze([
  { id: "seoul", label: "서울", longitude: 126.978 },
  { id: "busan", label: "부산", longitude: 129.075 },
  { id: "daegu", label: "대구", longitude: 128.601 },
  { id: "incheon", label: "인천", longitude: 126.705 },
  { id: "gwangju", label: "광주", longitude: 126.851 },
  { id: "daejeon", label: "대전", longitude: 127.385 },
  { id: "ulsan", label: "울산", longitude: 129.311 },
  { id: "sejong", label: "세종", longitude: 127.289 },
  { id: "gyeonggi", label: "경기(수원)", longitude: 127.029 },
  { id: "gangwon", label: "강원(춘천)", longitude: 127.73 },
  { id: "chungbuk", label: "충북(청주)", longitude: 127.489 },
  { id: "chungnam", label: "충남(홍성)", longitude: 126.661 },
  { id: "jeonbuk", label: "전북(전주)", longitude: 127.148 },
  { id: "jeonnam", label: "전남(무안)", longitude: 126.462 },
  { id: "gyeongbuk", label: "경북(안동)", longitude: 128.729 },
  { id: "gyeongnam", label: "경남(창원)", longitude: 128.681 },
  { id: "jeju", label: "제주", longitude: 126.531 },
]);

export const findPlace = (id: string): BirthPlace | undefined => BIRTH_PLACES.find((place) => place.id === id);

export type Calendar = SajuInput["calendar"];
export type Gender = SajuInput["gender"];

export interface SajuForm {
  calendar: Calendar;
  year: number;
  month: number;
  day: number;
  /** Only meaningful for lunar dates. */
  isLeapMonth: boolean;
  timeKnown: boolean;
  /** Stay null until picked, so an untouched select never becomes a birth time. */
  hour: number | null;
  minute: number | null;
  gender: Gender;
  placeId: string;
}

/** The sample chart's input (content/samples/saju-prologue.ko.json). */
export const DEFAULT_SAJU_FORM: SajuForm = Object.freeze({
  calendar: "solar",
  year: 1990,
  month: 1,
  day: 1,
  isLeapMonth: false,
  timeKnown: false,
  hour: null,
  minute: null,
  gender: "female",
  placeId: "seoul",
});

/** Oldest year in the year select (the engine itself reaches back to 1800). */
export const MIN_BIRTH_YEAR = 1900;

export const CALENDAR_LABEL: Record<Calendar, string> = { solar: "양력", lunar: "음력" };
export const GENDER_LABEL: Record<Gender, string> = { female: "여성", male: "남성" };

export const showLeapMonthOption = (form: SajuForm): boolean => form.calendar === "lunar";

/** Days offered in the day select. Lunar months have 29 or 30 days; the engine rejects a 30th that does not exist. */
export function daysInMonth(calendar: Calendar, year: number, month: number): number {
  if (calendar === "lunar") return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Applies a date change, keeping the day inside the month and dropping 윤달 for solar dates. */
export function withDate(form: SajuForm, patch: Partial<Pick<SajuForm, "calendar" | "year" | "month" | "day">>): SajuForm {
  const next = { ...form, ...patch };
  const day = Math.min(next.day, daysInMonth(next.calendar, next.year, next.month));
  return { ...next, day, isLeapMonth: next.calendar === "lunar" ? next.isLeapMonth : false };
}

export function toSajuInput(form: SajuForm): SajuInput {
  const place = findPlace(form.placeId);
  return {
    calendar: form.calendar,
    year: form.year,
    month: form.month,
    day: form.day,
    ...(form.calendar === "lunar" ? { isLeapMonth: form.isLeapMonth } : {}),
    time: form.timeKnown && form.hour !== null && form.minute !== null ? { hour: form.hour, minute: form.minute } : null,
    gender: form.gender,
    // An unknown id reaches the engine as NaN, which it rejects as invalid input.
    place: place ? { name: place.label, longitude: place.longitude } : { name: form.placeId, longitude: Number.NaN },
  };
}

// ---- errors ----

export type SajuField = "date" | "time" | "place" | "form";

export interface FieldError {
  field: SajuField;
  message: string;
}

export const SAJU_ERROR_MESSAGES: Readonly<Record<SajuErrorCode, FieldError>> = Object.freeze({
  NONEXISTENT_CIVIL_TIME: {
    field: "time",
    message: "그날은 시계를 앞당기면서 건너뛴 시각이 있었어요. 고른 시각은 실제로 없던 시각이라, 출생 기록을 다시 확인해 주세요.",
  },
  INVALID_LUNAR_DATE: { field: "date", message: "음력으로는 없는 날짜예요. 평달·윤달과 날짜를 다시 확인해 주세요." },
  INVALID_INPUT: { field: "date", message: "날짜나 시각이 올바르지 않아요. 다시 확인해 주세요." },
  OUT_OF_RANGE: {
    field: "date",
    message: `${MIN_SUPPORTED_DATE.year}년부터 ${MAX_SUPPORTED_DATE.year}년까지 태어난 경우만 계산할 수 있어요.`,
  },
  UNSUPPORTED_PLACE: { field: "place", message: "지금은 한국에서 태어난 경우만 계산할 수 있어요." },
  INVALID_POLICY: { field: "form", message: "계산 기준을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." },
});

const UNKNOWN_ERROR: FieldError = { field: "form", message: "명식을 계산하지 못했어요. 입력한 내용을 다시 확인해 주세요." };

export function describeSajuError(error: unknown): FieldError {
  if (error instanceof SajuError) return SAJU_ERROR_MESSAGES[error.code] ?? UNKNOWN_ERROR;
  return UNKNOWN_ERROR;
}

export interface CivilDay {
  year: number;
  month: number;
  day: number;
}

export function todayInKorea(now: Date = new Date()): CivilDay {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1, day: kst.getUTCDate() };
}

const dayNumber = ({ year, month, day }: CivilDay) => year * 10_000 + month * 100 + day;

/** Checks the form, then runs the engine; either the chart or the one error to show. */
export function checkSajuForm(form: SajuForm, today: CivilDay): { chart: SajuChart } | { error: FieldError } {
  if (form.timeKnown && (form.hour === null || form.minute === null)) {
    return { error: { field: "time", message: "태어난 시각을 골라 주세요." } };
  }
  if (form.calendar === "solar" && dayNumber(form) > dayNumber(today)) {
    return { error: { field: "date", message: "오늘 이후의 날짜는 고를 수 없어요." } };
  }
  try {
    return { chart: computeChart(toSajuInput(form)) };
  } catch (error) {
    return { error: describeSajuError(error) };
  }
}

// ---- display ----

export const formatTime = (hour: number, minute: number) => `${hour}시 ${minute}분`;

export function formatBirthDate(form: SajuForm): string {
  const leap = form.calendar === "lunar" && form.isLeapMonth ? "윤" : "";
  return `${form.year}년 ${leap}${form.month}월 ${form.day}일`;
}

/** Live echo under the date fields, e.g. "→ 1990년 1월 1일 (양력)". */
export const confirmationLine = (form: SajuForm) => `→ ${formatBirthDate(form)} (${CALENDAR_LABEL[form.calendar]})`;

export function formatTimePart(form: SajuForm): string {
  return form.timeKnown && form.hour !== null && form.minute !== null ? formatTime(form.hour, form.minute) : "시간 모름";
}

/** "1990년 1월 1일 · 양력 · 시간 모름" */
export const profileSummary = (form: SajuForm) => `${formatBirthDate(form)} · ${CALENDAR_LABEL[form.calendar]} · ${formatTimePart(form)}`;

/** Everything the chart was computed from: "1990년 1월 1일 (양력) · 시간 모름 · 여성 · 서울" */
export function chartInputLine(form: SajuForm): string {
  const place = findPlace(form.placeId)?.label ?? form.placeId;
  return `${formatBirthDate(form)} (${CALENDAR_LABEL[form.calendar]}) · ${formatTimePart(form)} · ${GENDER_LABEL[form.gender]} · ${place}`;
}

// ---- storage shape ----

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** A saved form read back from storage, or null when anything is off (then the sample is used). */
export function sanitizeSajuForm(value: unknown): SajuForm | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.calendar !== "solar" && v.calendar !== "lunar") return null;
  if (!isInt(v.year, MIN_SUPPORTED_DATE.year, MAX_SUPPORTED_DATE.year) || !isInt(v.month, 1, 12) || !isInt(v.day, 1, 31)) return null;
  if (v.gender !== "female" && v.gender !== "male") return null;
  if (typeof v.placeId !== "string" || !findPlace(v.placeId)) return null;
  const timeKnown = v.timeKnown === true;
  if (timeKnown && (!isInt(v.hour, 0, 23) || !isInt(v.minute, 0, 59))) return null;
  return {
    calendar: v.calendar,
    year: v.year,
    month: v.month,
    day: v.day,
    isLeapMonth: v.calendar === "lunar" && v.isLeapMonth === true,
    timeKnown,
    hour: timeKnown ? (v.hour as number) : null,
    minute: timeKnown ? (v.minute as number) : null,
    gender: v.gender,
    placeId: v.placeId,
  };
}
