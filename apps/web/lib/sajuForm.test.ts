import { KOREA_LONGITUDE_RANGE, SajuError, computeChart, type SajuErrorCode } from "@starlog/core";
import { describe, expect, it } from "vitest";
import {
  BIRTH_PLACES,
  DEFAULT_SAJU_FORM,
  SAJU_ERROR_MESSAGES,
  chartInputLine,
  checkSajuForm,
  confirmationLine,
  daysInMonth,
  describeSajuError,
  profileSummary,
  sanitizeSajuForm,
  showLeapMonthOption,
  toSajuInput,
  withDate,
  type SajuForm,
} from "./sajuForm";

const TODAY = { year: 2026, month: 9, day: 30 };

describe("BIRTH_PLACES", () => {
  it("lists the 17 시도 once each, 서울 first", () => {
    expect(BIRTH_PLACES).toHaveLength(17);
    expect(BIRTH_PLACES[0]).toEqual({ id: "seoul", label: "서울", longitude: 126.978 });
    expect(new Set(BIRTH_PLACES.map((p) => p.id)).size).toBe(17);
    expect(new Set(BIRTH_PLACES.map((p) => p.label)).size).toBe(17);
  });

  it("uses the agreed reference longitudes", () => {
    const byLabel = Object.fromEntries(BIRTH_PLACES.map((p) => [p.label, p.longitude]));
    expect(byLabel).toEqual({
      서울: 126.978,
      부산: 129.075,
      대구: 128.601,
      인천: 126.705,
      광주: 126.851,
      대전: 127.385,
      울산: 129.311,
      세종: 127.289,
      "경기(수원)": 127.029,
      "강원(춘천)": 127.73,
      "충북(청주)": 127.489,
      "충남(홍성)": 126.661,
      "전북(전주)": 127.148,
      "전남(무안)": 126.462,
      "경북(안동)": 128.729,
      "경남(창원)": 128.681,
      제주: 126.531,
    });
  });

  it("keeps every place inside the range the engine accepts, so each one computes", () => {
    for (const place of BIRTH_PLACES) {
      expect(place.longitude).toBeGreaterThanOrEqual(KOREA_LONGITUDE_RANGE.min);
      expect(place.longitude).toBeLessThanOrEqual(KOREA_LONGITUDE_RANGE.max);
      expect(() => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, placeId: place.id }))).not.toThrow();
    }
  });
});

describe("DEFAULT_SAJU_FORM", () => {
  it("is the sample: 1990-01-01 solar, time unknown, female, 서울", () => {
    expect(DEFAULT_SAJU_FORM).toEqual({
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
  });
});

describe("showLeapMonthOption", () => {
  it("offers 윤달 only for lunar dates", () => {
    expect(showLeapMonthOption({ ...DEFAULT_SAJU_FORM, calendar: "solar" })).toBe(false);
    expect(showLeapMonthOption({ ...DEFAULT_SAJU_FORM, calendar: "lunar" })).toBe(true);
  });
});

describe("daysInMonth / withDate", () => {
  it("follows the solar calendar, leap years included", () => {
    expect(daysInMonth("solar", 1990, 1)).toBe(31);
    expect(daysInMonth("solar", 1990, 4)).toBe(30);
    expect(daysInMonth("solar", 1990, 2)).toBe(28);
    expect(daysInMonth("solar", 2000, 2)).toBe(29);
  });

  it("offers 30 days for lunar months (the engine rejects a 30th that does not exist)", () => {
    expect(daysInMonth("lunar", 1990, 1)).toBe(30);
  });

  it("pulls the day back into the new month instead of rolling over", () => {
    const form = withDate({ ...DEFAULT_SAJU_FORM, day: 31 }, { month: 2 });
    expect(form).toMatchObject({ month: 2, day: 28 });
    expect(withDate({ ...DEFAULT_SAJU_FORM, calendar: "lunar", day: 30 }, { calendar: "solar", month: 2 }).day).toBe(28);
  });

  it("drops 윤달 when switching back to solar", () => {
    const form = withDate({ ...DEFAULT_SAJU_FORM, calendar: "lunar", isLeapMonth: true }, { calendar: "solar" });
    expect(form.isLeapMonth).toBe(false);
  });
});

describe("toSajuInput", () => {
  it("maps the sample form to an engine input with no time (never noon)", () => {
    expect(toSajuInput(DEFAULT_SAJU_FORM)).toEqual({
      calendar: "solar",
      year: 1990,
      month: 1,
      day: 1,
      time: null,
      gender: "female",
      place: { name: "서울", longitude: 126.978 },
    });
  });

  it("passes 윤달 for lunar dates only, and the time only when it is known", () => {
    const lunar = toSajuInput({ ...DEFAULT_SAJU_FORM, calendar: "lunar", isLeapMonth: true, timeKnown: true, hour: 9, minute: 30 });
    expect(lunar.isLeapMonth).toBe(true);
    expect(lunar.time).toEqual({ hour: 9, minute: 30 });
    const solar = toSajuInput({ ...DEFAULT_SAJU_FORM, isLeapMonth: true, timeKnown: false, hour: 9, minute: 30 });
    expect("isLeapMonth" in solar).toBe(false);
    expect(solar.time).toBeNull();
  });

  it("uses the picked place's name and longitude", () => {
    expect(toSajuInput({ ...DEFAULT_SAJU_FORM, placeId: "gyeonggi" }).place).toEqual({ name: "경기(수원)", longitude: 127.029 });
  });
});

describe("SAJU_ERROR_MESSAGES / describeSajuError", () => {
  const CODES: SajuErrorCode[] = ["NONEXISTENT_CIVIL_TIME", "INVALID_LUNAR_DATE", "INVALID_INPUT", "OUT_OF_RANGE", "UNSUPPORTED_PLACE", "INVALID_POLICY", "UNSUPPORTED_CALENDAR"];

  it("has a friendly 해요체 message for every engine error code", () => {
    expect(Object.keys(SAJU_ERROR_MESSAGES).sort()).toEqual([...CODES].sort());
    for (const code of CODES) expect(SAJU_ERROR_MESSAGES[code].message).toMatch(/요\.$/);
  });

  it("puts each error next to the field it is about", () => {
    expect(SAJU_ERROR_MESSAGES.NONEXISTENT_CIVIL_TIME.field).toBe("time");
    expect(SAJU_ERROR_MESSAGES.INVALID_LUNAR_DATE.field).toBe("date");
    expect(SAJU_ERROR_MESSAGES.INVALID_INPUT.field).toBe("date");
    expect(SAJU_ERROR_MESSAGES.OUT_OF_RANGE.field).toBe("date");
    expect(SAJU_ERROR_MESSAGES.UNSUPPORTED_PLACE.field).toBe("place");
    expect(SAJU_ERROR_MESSAGES.INVALID_POLICY.field).toBe("form");
  });

  it("maps a SajuError by code, and anything else to a form-level message", () => {
    expect(describeSajuError(new SajuError("INVALID_LUNAR_DATE", "x"))).toBe(SAJU_ERROR_MESSAGES.INVALID_LUNAR_DATE);
    expect(describeSajuError(new Error("boom")).field).toBe("form");
  });
});

describe("checkSajuForm", () => {
  it("computes the sample chart: 丙寅 day pillar, 병화 day master, no hour pillar", () => {
    const result = checkSajuForm(DEFAULT_SAJU_FORM, TODAY);
    if (!("chart" in result)) throw new Error("expected a chart");
    expect(result.chart.pillars.day.stem + result.chart.pillars.day.branch).toBe("丙寅");
    expect(result.chart.dayMaster.ko).toBe("병화");
    expect(result.chart.pillars.hour).toBeNull();
  });

  it("asks for the hour and minute when the time is marked as known", () => {
    expect(checkSajuForm({ ...DEFAULT_SAJU_FORM, timeKnown: true, hour: 9, minute: null }, TODAY)).toEqual({
      error: { field: "time", message: "태어난 시각을 골라 주세요." },
    });
  });

  it("rejects dates after today", () => {
    const result = checkSajuForm({ ...DEFAULT_SAJU_FORM, year: 2026, month: 10, day: 1 }, TODAY);
    expect(result).toEqual({ error: { field: "date", message: "오늘 이후의 날짜는 고를 수 없어요." } });
  });

  it("rejects lunar dates whose solar day is after today, and accepts ones already past", () => {
    // 음력 2026-08-21 is 양력 2026-10-01 (TODAY is 2026-09-30); 음력 2026-08-01 is 양력 2026-09-11.
    const future = checkSajuForm({ ...DEFAULT_SAJU_FORM, calendar: "lunar", year: 2026, month: 8, day: 21 }, TODAY);
    expect(future).toEqual({ error: { field: "date", message: "오늘 이후의 날짜는 고를 수 없어요." } });
    const past = checkSajuForm({ ...DEFAULT_SAJU_FORM, calendar: "lunar", year: 2026, month: 8, day: 1 }, TODAY);
    if (!("chart" in past)) throw new Error("expected a chart");
    expect(past.chart.solarDate).toBe("2026-09-11");
  });

  it("turns engine errors into field errors: a lunar day that does not exist, a skipped DST minute", () => {
    const lunar = checkSajuForm({ ...DEFAULT_SAJU_FORM, calendar: "lunar", isLeapMonth: true, day: 30 }, TODAY);
    expect(lunar).toEqual({ error: SAJU_ERROR_MESSAGES.INVALID_LUNAR_DATE });
    const gap = checkSajuForm({ ...DEFAULT_SAJU_FORM, year: 1987, month: 5, day: 10, timeKnown: true, hour: 2, minute: 30 }, TODAY);
    expect(gap).toEqual({ error: SAJU_ERROR_MESSAGES.NONEXISTENT_CIVIL_TIME });
  });
});

describe("confirmationLine / profileSummary", () => {
  it("echoes the date as entered", () => {
    expect(confirmationLine(DEFAULT_SAJU_FORM)).toBe("→ 1990년 1월 1일 (양력)");
    expect(confirmationLine({ ...DEFAULT_SAJU_FORM, calendar: "lunar" })).toBe("→ 1990년 1월 1일 (음력)");
    expect(confirmationLine({ ...DEFAULT_SAJU_FORM, calendar: "lunar", isLeapMonth: true })).toBe("→ 1990년 윤1월 1일 (음력)");
  });

  it("lists every input the chart used", () => {
    expect(chartInputLine(DEFAULT_SAJU_FORM)).toBe("1990년 1월 1일 (양력) · 시간 모름 · 여성 · 서울");
    expect(chartInputLine({ ...DEFAULT_SAJU_FORM, gender: "male", placeId: "jeju", timeKnown: true, hour: 23, minute: 40 })).toBe(
      "1990년 1월 1일 (양력) · 23시 40분 · 남성 · 제주",
    );
  });

  it("summarises the saved profile for 내 정보", () => {
    expect(profileSummary(DEFAULT_SAJU_FORM)).toBe("1990년 1월 1일 · 양력 · 시간 모름");
    expect(profileSummary({ ...DEFAULT_SAJU_FORM, timeKnown: true, hour: 9, minute: 5 })).toBe("1990년 1월 1일 · 양력 · 9시 5분");
  });
});

describe("sanitizeSajuForm", () => {
  it("accepts a complete form and rejects anything malformed", () => {
    const form: SajuForm = { ...DEFAULT_SAJU_FORM, timeKnown: true, hour: 23, minute: 59, placeId: "jeju" };
    expect(sanitizeSajuForm(JSON.parse(JSON.stringify(form)))).toEqual(form);
    expect(sanitizeSajuForm(null)).toBeNull();
    expect(sanitizeSajuForm({ ...form, placeId: "tokyo" })).toBeNull();
    expect(sanitizeSajuForm({ ...form, month: 13 })).toBeNull();
    expect(sanitizeSajuForm({ ...form, hour: 24 })).toBeNull();
    expect(sanitizeSajuForm({ ...form, gender: "x" })).toBeNull();
  });

  it("clears the time fields when the time is unknown", () => {
    expect(sanitizeSajuForm({ ...DEFAULT_SAJU_FORM, hour: 9, minute: 30 })).toEqual(DEFAULT_SAJU_FORM);
  });
});
