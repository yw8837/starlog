import { KOREA_LONGITUDE_RANGE, SajuError, computeChart, type SajuErrorCode } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { BIRTH_PLACE_ROWS } from "./birthPlaces";
import {
  BIRTH_PLACES,
  BIRTH_PLACE_GROUPS,
  DEFAULT_SAJU_FORM,
  EMPTY_SAJU_DRAFT,
  SAJU_ERROR_MESSAGES,
  chartInputLine,
  checkSajuDraft,
  checkSajuForm,
  confirmationLine,
  daysInMonth,
  describeSajuError,
  draftConfirmation,
  draftDays,
  draftOf,
  findPlace,
  leapChoice,
  profileSummary,
  sanitizeSajuForm,
  showLeapMonthOption,
  toSajuInput,
  withDate,
  withDraftDate,
  withLeapChoice,
  type SajuForm,
} from "./sajuForm";

const TODAY = { year: 2026, month: 9, day: 30 };

describe("BIRTH_PLACES", () => {
  it("lists every 시·군, each 특별시·광역시 and 세종 once (161), grouped by 시·도, 서울 first", () => {
    expect(BIRTH_PLACES).toHaveLength(161);
    expect(BIRTH_PLACES[0]).toEqual({ id: "seoul", label: "서울", longitude: 126.978, group: "특별시·광역시" });
    expect(new Set(BIRTH_PLACES.map((p) => p.id)).size).toBe(161);
    expect(new Set(BIRTH_PLACES.map((p) => p.label)).size).toBe(161);
    // 75 시 and 76 군 of the 도, 제주시·서귀포시, and the eight cities
    expect(BIRTH_PLACE_GROUPS.map((g) => [g.label, g.places.length])).toEqual([
      ["특별시·광역시", 8], ["경기", 31], ["강원", 18], ["충북", 11], ["충남", 15], ["전북", 14], ["전남", 22], ["경북", 22], ["경남", 18], ["제주", 2],
    ]);
    expect(BIRTH_PLACE_GROUPS.flatMap((g) => g.places)).toEqual(BIRTH_PLACES);
  });

  it("labels each 시·군 with its 도 (경북 포항), the cities by name", () => {
    expect(BIRTH_PLACE_GROUPS[0]!.places.map((p) => p.label)).toEqual(["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"]);
    for (const place of BIRTH_PLACES.filter((p) => p.group !== "특별시·광역시")) expect(place.label.startsWith(`${place.group} `), place.label).toBe(true);
    for (const label of ["경북 포항", "경기 수원", "강원 고성", "경남 고성", "경기 광주", "제주 제주시", "제주 서귀포"]) expect(BIRTH_PLACES.map((p) => p.label)).toContain(label);
  });

  it("takes each longitude from the sourced rows (the 청사's OpenStreetMap object, 0.001° steps)", () => {
    expect(BIRTH_PLACES.map((p) => p.longitude)).toEqual(BIRTH_PLACE_ROWS.map((row) => row.longitude));
    for (const row of BIRTH_PLACE_ROWS) {
      expect(row.osm, row.label).toMatch(/^(node|way|relation)\/\d+$/);
      expect(Math.round(row.longitude * 1000) / 1000, row.label).toBe(row.longitude);
    }
    expect(new Set(BIRTH_PLACE_ROWS.map((row) => row.osm)).size).toBe(161);
  });

  it("still reads the 17 시·도 ids from before, as the city each stood for, and never as another place", () => {
    // [old id, the city it stood for, its longitude in the old list]
    const OLD: [string, string, number][] = [
      ["seoul", "서울", 126.978], ["busan", "부산", 129.075], ["daegu", "대구", 128.601], ["incheon", "인천", 126.705], ["gwangju", "광주", 126.851],
      ["daejeon", "대전", 127.385], ["ulsan", "울산", 129.311], ["sejong", "세종", 127.289], ["gyeonggi", "경기 수원", 127.029], ["gangwon", "강원 춘천", 127.73],
      ["chungbuk", "충북 청주", 127.489], ["chungnam", "충남 홍성", 126.661], ["jeonbuk", "전북 전주", 127.148], ["jeonnam", "전남 무안", 126.462],
      ["gyeongbuk", "경북 안동", 128.729], ["gyeongnam", "경남 창원", 128.681], ["jeju", "제주 제주시", 126.531],
    ];
    for (const [id, label, longitude] of OLD) {
      expect(findPlace(id)?.label, id).toBe(label);
      // the old 전남 value was the 도청 in 무안; the 군청 is 0.02° east
      expect(Math.abs(findPlace(id)!.longitude - longitude), id).toBeLessThan(0.03);
    }
    expect(findPlace("constructor")).toBeUndefined();
    expect(findPlace("tokyo")).toBeUndefined();
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

  it("uses the picked place's name and longitude, a 시·도 id from before as its city", () => {
    expect(toSajuInput({ ...DEFAULT_SAJU_FORM, placeId: "gyeongbuk-pohang" }).place).toEqual({ name: "경북 포항", longitude: findPlace("gyeongbuk-pohang")!.longitude });
    expect(toSajuInput({ ...DEFAULT_SAJU_FORM, placeId: "gyeonggi" }).place).toEqual({ name: "경기 수원", longitude: 127.029 });
  });

  it("passes 윤달 '모름' as \"unknown\" for lunar dates only", () => {
    const lunar = { ...DEFAULT_SAJU_FORM, calendar: "lunar" as const, leapMonthUnknown: true };
    expect(toSajuInput(lunar).isLeapMonth).toBe("unknown");
    expect("isLeapMonth" in toSajuInput({ ...lunar, calendar: "solar" })).toBe(false);
  });
});

describe("윤달: 평달 / 윤달 / 모름", () => {
  const lunar: SajuForm = { ...DEFAULT_SAJU_FORM, calendar: "lunar" };

  it("keeps 모름 only as leapMonthUnknown: true, never next to isLeapMonth", () => {
    expect(withLeapChoice(lunar, "unknown")).toEqual({ ...lunar, isLeapMonth: false, leapMonthUnknown: true });
    expect(withLeapChoice(withLeapChoice(lunar, "unknown"), "leap")).toEqual({ ...lunar, isLeapMonth: true });
    expect(withLeapChoice(withLeapChoice(lunar, "unknown"), "regular")).toEqual(lunar);
    expect(["regular", "leap", "unknown"].map((choice) => leapChoice(withLeapChoice(lunar, choice as "regular")))).toEqual(["regular", "leap", "unknown"]);
  });

  it("drops 모름 with 윤달 when the date turns solar", () => {
    const unknown = withLeapChoice(lunar, "unknown");
    expect(withDate(unknown, { calendar: "solar" })).toEqual({ ...DEFAULT_SAJU_FORM });
    expect(withDate(unknown, { month: 2 })).toEqual({ ...unknown, month: 2 });
    expect(withDraftDate({ ...EMPTY_SAJU_DRAFT, calendar: "lunar", leapMonthUnknown: true }, { calendar: "solar" })).toEqual(EMPTY_SAJU_DRAFT);
  });

  it("says 윤달 모름 in the echo, the 내 정보 summary and the chart's input line", () => {
    const unknown = withLeapChoice(lunar, "unknown");
    expect(confirmationLine(unknown)).toBe("→ 1990년 1월 1일 (음력 · 윤달 모름)");
    expect(profileSummary(unknown)).toBe("1990년 1월 1일 · 음력 · 윤달 모름 · 시간 모름");
    expect(chartInputLine(unknown)).toBe("1990년 1월 1일 (음력) · 윤달 모름 · 시간 모름 · 여성 · 서울");
    expect(draftConfirmation({ ...EMPTY_SAJU_DRAFT, calendar: "lunar", leapMonthUnknown: true, year: 1992, month: 8, day: 3 })).toBe("→ 1992년 8월 3일 (음력 · 윤달 모름)");
  });

  it("reads 모름 back from storage for lunar dates only; older profiles read as before", () => {
    const unknown = withLeapChoice(lunar, "unknown");
    expect(sanitizeSajuForm(JSON.parse(JSON.stringify(unknown)))).toEqual(unknown);
    expect(sanitizeSajuForm({ ...unknown, isLeapMonth: true })).toEqual(unknown);
    expect(sanitizeSajuForm({ ...unknown, calendar: "solar" })).toEqual(DEFAULT_SAJU_FORM);
    expect(sanitizeSajuForm({ ...lunar, isLeapMonth: true })).toEqual({ ...lunar, isLeapMonth: true });
  });

  it("computes 모름 as 평달 and names the 윤달 chart when that year has the leap month (2023 윤2월)", () => {
    const result = checkSajuForm({ ...withLeapChoice(lunar, "unknown"), year: 2023, month: 2, day: 15, timeKnown: true, hour: 12, minute: 0 }, TODAY);
    if (!("chart" in result)) throw new Error("expected a chart");
    expect(result.chart.solarDate).toBe("2023-03-06");
    expect(result.chart.warnings[0]?.code).toBe("LEAP_MONTH_UNKNOWN");
    expect(result.chart.warnings[0]?.message).toContain("윤달이라면 양력 4월 5일생이고");
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
    // the 1948–51 hours where tzdata and KASI's table disagree show the engine's sentence, not the fixed one
    const disputed = "1948년 6월 1일 00:30은 국제 시간대 자료(tzdata) 기준으로 시계를 앞당기며 건너뛴 시각이라 여기서는 계산하지 않아요.";
    expect(describeSajuError(new SajuError("NONEXISTENT_CIVIL_TIME", disputed))).toEqual({ field: "time", message: disputed });
    expect(describeSajuError(new SajuError("NONEXISTENT_CIVIL_TIME", "1987-05-10 02:30 skipped"))).toBe(SAJU_ERROR_MESSAGES.NONEXISTENT_CIVIL_TIME);
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
      "1990년 1월 1일 (양력) · 23시 40분 · 남성 · 제주 제주시",
    );
    expect(chartInputLine({ ...DEFAULT_SAJU_FORM, placeId: "gyeongbuk-pohang" })).toBe("1990년 1월 1일 (양력) · 시간 모름 · 여성 · 경북 포항");
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

describe("W-07: the form's draft (date and gender empty until picked)", () => {
  it("starts empty except the calendar, the unknown time and 서울", () => {
    expect(EMPTY_SAJU_DRAFT).toEqual({
      calendar: "solar", year: null, month: null, day: null, isLeapMonth: false,
      timeKnown: false, hour: null, minute: null, gender: null, placeId: "seoul",
    });
    expect(draftOf(DEFAULT_SAJU_FORM)).toEqual(DEFAULT_SAJU_FORM);
  });

  it("offers 1–31 days (음력 1–30) until the year and month are picked, then the month's days", () => {
    expect(draftDays(EMPTY_SAJU_DRAFT)).toBe(31);
    expect(draftDays({ ...EMPTY_SAJU_DRAFT, calendar: "lunar" })).toBe(30);
    expect(draftDays({ ...EMPTY_SAJU_DRAFT, year: 1990, month: 2 })).toBe(28);
  });

  it("keeps a picked day inside the month once the year and month are known", () => {
    const draft = withDraftDate({ ...EMPTY_SAJU_DRAFT, day: 31 }, { year: 1990 });
    expect(draft.day).toBe(31);
    expect(withDraftDate(draft, { month: 2 }).day).toBe(28);
    expect(withDraftDate({ ...EMPTY_SAJU_DRAFT, calendar: "lunar", isLeapMonth: true }, { calendar: "solar" }).isLeapMonth).toBe(false);
  });

  it("echoes the date only once year, month and day are all picked", () => {
    expect(draftConfirmation({ ...EMPTY_SAJU_DRAFT, year: 1992, month: 8 })).toBeNull();
    expect(draftConfirmation({ ...EMPTY_SAJU_DRAFT, year: 1992, month: 8, day: 3 })).toBe("→ 1992년 8월 3일 (양력)");
  });

  it("names every empty field, top to bottom, before the engine runs", () => {
    expect(checkSajuDraft(EMPTY_SAJU_DRAFT, TODAY)).toEqual({
      errors: [
        { field: "date", message: "태어난 날을 골라 주세요." },
        { field: "gender", message: "성별을 골라 주세요." },
      ],
    });
    expect(checkSajuDraft({ ...EMPTY_SAJU_DRAFT, year: 1990, month: 1, day: 1, timeKnown: true, hour: 9 }, TODAY)).toEqual({
      errors: [
        { field: "time", message: "태어난 시각을 골라 주세요." },
        { field: "gender", message: "성별을 골라 주세요." },
      ],
    });
  });

  it("hands back the complete form and its chart, or the engine's one error", () => {
    const ok = checkSajuDraft({ ...EMPTY_SAJU_DRAFT, year: 1990, month: 1, day: 1, gender: "female" }, TODAY);
    if (!("form" in ok)) throw new Error("expected a chart");
    expect(ok.form).toEqual(DEFAULT_SAJU_FORM);
    expect(ok.chart.pillars.day.stem + ok.chart.pillars.day.branch).toBe("丙寅");
    expect(checkSajuDraft({ ...EMPTY_SAJU_DRAFT, calendar: "lunar", isLeapMonth: true, year: 1990, month: 1, day: 30, gender: "female" }, TODAY)).toEqual({
      errors: [SAJU_ERROR_MESSAGES.INVALID_LUNAR_DATE],
    });
  });
});
