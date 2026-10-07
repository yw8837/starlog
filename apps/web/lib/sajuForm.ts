import {
  MAX_SUPPORTED_DATE,
  MIN_SUPPORTED_DATE,
  SajuError,
  computeChart,
  type SajuChart,
  type SajuErrorCode,
  type SajuInput,
} from "@starlog/core";
import { BIRTH_PLACE_ROWS, LEGACY_PLACE_IDS } from "./birthPlaces";

/**
 * Saju input form: the values the user picks, how they map onto the engine input, and the
 * friendly errors shown next to each field. Pure functions; storage lives in sajuFlow.ts.
 */

export interface BirthPlace {
  id: string;
  /** Shown in the select and on the chart, and passed to the engine as the place name: "서울", "경북 포항". */
  label: string;
  /** Degrees east of the 시·군 청사 (source and date in lib/birthPlaces.ts). */
  longitude: number;
  /** The select's group: 특별시·광역시, or the 도. */
  group: string;
}

/** Every 시·군, each 특별시·광역시 and 세종 as one (161), 서울 first. */
export const BIRTH_PLACES: readonly BirthPlace[] = Object.freeze(BIRTH_PLACE_ROWS.map(({ id, label, longitude, group }) => ({ id, label, longitude, group })));

/** The select's groups (optgroups) in order, each with its places. */
export const BIRTH_PLACE_GROUPS: readonly { label: string; places: readonly BirthPlace[] }[] = Object.freeze(
  [...new Set(BIRTH_PLACES.map((place) => place.group))].map((label) => ({ label, places: BIRTH_PLACES.filter((place) => place.group === label) })),
);

/**
 * The place for an id. The 17 ids from before the 시·군 list (`gyeonggi` …) still read, as the city each
 * stood for (경기 → 수원), so stored forms and links keep working; the id itself is never rewritten.
 */
export function findPlace(id: string): BirthPlace | undefined {
  const current = Object.hasOwn(LEGACY_PLACE_IDS, id) ? LEGACY_PLACE_IDS[id] : id;
  return BIRTH_PLACES.find((place) => place.id === current);
}

export type Calendar = SajuInput["calendar"];
export type Gender = SajuInput["gender"];

export interface SajuForm {
  calendar: Calendar;
  year: number;
  month: number;
  day: number;
  /** Only meaningful for lunar dates. */
  isLeapMonth: boolean;
  /** Lunar dates only: 평달인지 윤달인지 모름. Kept only as `true` (isLeapMonth is then false); absent otherwise. */
  leapMonthUnknown?: boolean;
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

/**
 * The form while it is filled in (W-07): without a saved profile the date and the gender start
 * empty, so nobody gets the sample's chart by leaving the fields as they are. 서울 stays the default
 * birthplace (shown and changeable).
 */
export interface SajuDraft extends Omit<SajuForm, "year" | "month" | "day" | "gender"> {
  year: number | null;
  month: number | null;
  day: number | null;
  gender: Gender | null;
}

export const EMPTY_SAJU_DRAFT: SajuDraft = Object.freeze({
  calendar: "solar",
  year: null,
  month: null,
  day: null,
  isLeapMonth: false,
  timeKnown: false,
  hour: null,
  minute: null,
  gender: null,
  placeId: "seoul",
});

/** A saved profile as a draft: every field filled. */
export const draftOf = (form: SajuForm): SajuDraft => ({ ...form });

/** Oldest year in the year select (the engine itself reaches back to 1800). */
export const MIN_BIRTH_YEAR = 1900;

export const CALENDAR_LABEL: Record<Calendar, string> = { solar: "양력", lunar: "음력" };
export const GENDER_LABEL: Record<Gender, string> = { female: "여성", male: "남성" };

export const showLeapMonthOption = (form: Pick<SajuForm, "calendar">): boolean => form.calendar === "lunar";

/** The lunar month as the user knows it: 평달, 윤달, or 모름 (the engine computes both and names the other). */
export type LeapChoice = "regular" | "leap" | "unknown";
export const LEAP_CHOICE_LABEL: Record<LeapChoice, string> = { regular: "평달", leap: "윤달", unknown: "모름" };

type LeapFields = Pick<SajuForm, "calendar" | "isLeapMonth" | "leapMonthUnknown">;

export const leapChoice = (form: Pick<SajuForm, "isLeapMonth" | "leapMonthUnknown">): LeapChoice =>
  form.leapMonthUnknown ? "unknown" : form.isLeapMonth ? "leap" : "regular";

/** 윤달 fields only on lunar dates; 모름 only as `leapMonthUnknown: true`, never with isLeapMonth. */
function normalizeLeap<T extends LeapFields>(form: T): T {
  const { leapMonthUnknown, ...rest } = form;
  const lunar = form.calendar === "lunar";
  const unknown = lunar && leapMonthUnknown === true;
  return { ...rest, isLeapMonth: lunar && !unknown && form.isLeapMonth, ...(unknown ? { leapMonthUnknown: true } : {}) } as T;
}

/** The form with 평달, 윤달 or 모름 picked (lunar dates). */
export const withLeapChoice = <T extends LeapFields>(form: T, choice: LeapChoice): T =>
  normalizeLeap({ ...form, isLeapMonth: choice === "leap", leapMonthUnknown: choice === "unknown" });

/** Days offered in the day select. Lunar months have 29 or 30 days; the engine rejects a 30th that does not exist. */
export function daysInMonth(calendar: Calendar, year: number, month: number): number {
  if (calendar === "lunar") return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Applies a date change, keeping the day inside the month and dropping 윤달 (and 모름) for solar dates. */
export function withDate(form: SajuForm, patch: Partial<Pick<SajuForm, "calendar" | "year" | "month" | "day">>): SajuForm {
  const next = { ...form, ...patch };
  const day = Math.min(next.day, daysInMonth(next.calendar, next.year, next.month));
  return normalizeLeap({ ...next, day });
}

/** Days in the day select: 1–31 (음력 1–30) until the year and month are picked, then that month's. */
export function draftDays(draft: SajuDraft): number {
  if (draft.year === null || draft.month === null) return draft.calendar === "lunar" ? 30 : 31;
  return daysInMonth(draft.calendar, draft.year, draft.month);
}

/** withDate for a draft: a picked day stays inside the month once it is known; solar dates drop 윤달 (and 모름). */
export function withDraftDate(draft: SajuDraft, patch: Partial<Pick<SajuDraft, "calendar" | "year" | "month" | "day">>): SajuDraft {
  const next = { ...draft, ...patch };
  const day = next.day === null ? null : Math.min(next.day, draftDays(next));
  return normalizeLeap({ ...next, day });
}

/** The complete form, or null while the date or the gender is still empty. */
export function completeForm(draft: SajuDraft): SajuForm | null {
  const { year, month, day, gender } = draft;
  if (year === null || month === null || day === null || gender === null) return null;
  return { ...draft, year, month, day, gender };
}

export function toSajuInput(form: SajuForm): SajuInput {
  const place = findPlace(form.placeId);
  return {
    calendar: form.calendar,
    year: form.year,
    month: form.month,
    day: form.day,
    ...(form.calendar === "lunar" ? { isLeapMonth: form.leapMonthUnknown ? ("unknown" as const) : form.isLeapMonth } : {}),
    time: form.timeKnown && form.hour !== null && form.minute !== null ? { hour: form.hour, minute: form.minute } : null,
    gender: form.gender,
    // An unknown id reaches the engine as NaN, which it rejects as invalid input.
    place: place ? { name: place.label, longitude: place.longitude } : { name: form.placeId, longitude: Number.NaN },
  };
}

// ---- errors ----

export type SajuField = "date" | "time" | "gender" | "place" | "form";

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
  UNSUPPORTED_CALENDAR: { field: "date", message: "해외 출생은 양력 생일로만 계산할 수 있어요." },
});

const UNKNOWN_ERROR: FieldError = { field: "form", message: "명식을 계산하지 못했어요. 입력한 내용을 다시 확인해 주세요." };

export function describeSajuError(error: unknown): FieldError {
  // The four 1948–51 hours that tzdata skips but KASI's 역서 table keeps: the engine's own sentence says which
  // source skipped them and how the other reads them, which the fixed message would contradict.
  if (error instanceof SajuError && error.code === "NONEXISTENT_CIVIL_TIME" && error.message.includes("국제 시간대 자료")) {
    return { field: "time", message: error.message };
  }
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
  let chart: SajuChart;
  try {
    chart = computeChart(toSajuInput(form));
  } catch (error) {
    return { error: describeSajuError(error) };
  }
  // The engine's solar date covers lunar input too (a lunar day can fall after today in solar terms).
  const [year = 0, month = 0, day = 0] = chart.solarDate.split("-").map(Number);
  if (dayNumber({ year, month, day }) > dayNumber(today)) {
    return { error: { field: "date", message: "오늘 이후의 날짜는 고를 수 없어요." } };
  }
  return { chart };
}

const BLANK_DATE: FieldError = { field: "date", message: "태어난 날을 골라 주세요." };
const BLANK_TIME: FieldError = { field: "time", message: "태어난 시각을 골라 주세요." };
const BLANK_GENDER: FieldError = { field: "gender", message: "성별을 골라 주세요." };

/** Empty fields, top to bottom (W-07): checked on 명식 보기 before the engine runs. */
export function blankFieldErrors(draft: SajuDraft): FieldError[] {
  const out: FieldError[] = [];
  if (draft.year === null || draft.month === null || draft.day === null) out.push(BLANK_DATE);
  if (draft.timeKnown && (draft.hour === null || draft.minute === null)) out.push(BLANK_TIME);
  if (draft.gender === null) out.push(BLANK_GENDER);
  return out;
}

/** 명식 보기: every empty field at once, else the engine's one error, else the complete form and its chart. */
export function checkSajuDraft(draft: SajuDraft, today: CivilDay): { form: SajuForm; chart: SajuChart } | { errors: FieldError[] } {
  const blanks = blankFieldErrors(draft);
  const form = completeForm(draft);
  if (blanks.length || !form) return { errors: blanks };
  const checked = checkSajuForm(form, today);
  return "error" in checked ? { errors: [checked.error] } : { form, chart: checked.chart };
}

// ---- display ----

export const formatTime = (hour: number, minute: number) => `${hour}시 ${minute}분`;

/** The date part of the form (the echo line, record titles). */
export type BirthDate = Pick<SajuForm, "calendar" | "year" | "month" | "day" | "isLeapMonth" | "leapMonthUnknown">;

export function formatBirthDate(form: BirthDate): string {
  const leap = form.calendar === "lunar" && form.isLeapMonth ? "윤" : "";
  return `${form.year}년 ${leap}${form.month}월 ${form.day}일`;
}

/** " · 윤달 모름" after the calendar of a lunar date whose 윤달 is unknown, else "". */
const leapUnknownPart = (form: Pick<SajuForm, "calendar" | "leapMonthUnknown">) => (form.calendar === "lunar" && form.leapMonthUnknown ? " · 윤달 모름" : "");

/** Live echo under the date fields, e.g. "→ 1990년 1월 1일 (양력)", "→ 1990년 1월 1일 (음력 · 윤달 모름)". */
export const confirmationLine = (form: BirthDate) => `→ ${formatBirthDate(form)} (${CALENDAR_LABEL[form.calendar]}${leapUnknownPart(form)})`;

/** The echo line once year, month and day are all picked (W-07); null before. */
export function draftConfirmation(draft: SajuDraft): string | null {
  const { calendar, year, month, day, isLeapMonth, leapMonthUnknown } = draft;
  if (year === null || month === null || day === null) return null;
  return confirmationLine({ calendar, year, month, day, isLeapMonth, leapMonthUnknown });
}

export function formatTimePart(form: SajuForm): string {
  return form.timeKnown && form.hour !== null && form.minute !== null ? formatTime(form.hour, form.minute) : "시간 모름";
}

/** "1990년 1월 1일 · 양력 · 시간 모름", "1990년 1월 1일 · 음력 · 윤달 모름 · 9시 5분" */
export const profileSummary = (form: SajuForm) => `${formatBirthDate(form)} · ${CALENDAR_LABEL[form.calendar]}${leapUnknownPart(form)} · ${formatTimePart(form)}`;

/** Everything the chart was computed from: "1990년 1월 1일 (양력) · 시간 모름 · 여성 · 서울", "… (음력) · 윤달 모름 · …" */
export function chartInputLine(form: SajuForm): string {
  const place = findPlace(form.placeId)?.label ?? form.placeId;
  return `${formatBirthDate(form)} (${CALENDAR_LABEL[form.calendar]})${leapUnknownPart(form)} · ${formatTimePart(form)} · ${GENDER_LABEL[form.gender]} · ${place}`;
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
  const leapMonthUnknown = v.calendar === "lunar" && v.leapMonthUnknown === true;
  return {
    calendar: v.calendar,
    year: v.year,
    month: v.month,
    day: v.day,
    isLeapMonth: v.calendar === "lunar" && v.isLeapMonth === true && !leapMonthUnknown,
    ...(leapMonthUnknown ? { leapMonthUnknown: true } : {}),
    timeKnown,
    hour: timeKnown ? (v.hour as number) : null,
    minute: timeKnown ? (v.minute as number) : null,
    gender: v.gender,
    placeId: v.placeId,
  };
}
