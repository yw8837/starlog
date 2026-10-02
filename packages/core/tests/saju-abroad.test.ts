import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ABROAD_PLACES, SajuError, computeChart, zoneOffsetMsAt, zoneWallClockInstants, type SajuInput } from "../src/index";

const H = 3_600_000;
const wall = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m - 1, d, h, min);

describe("zone offsets from the runtime's tzdata", () => {
  it.each([
    ["Asia/Tokyo", wall(1950, 7, 1, 3), 10],
    ["Asia/Tokyo", wall(1952, 7, 1, 3), 9],
    ["Asia/Taipei", wall(1974, 7, 1, 3), 9],
    ["Asia/Taipei", wall(1980, 7, 1, 3), 8],
    ["Asia/Hong_Kong", wall(1970, 7, 1, 3), 9],
    ["Asia/Hong_Kong", wall(1980, 1, 1, 3), 8],
  ])("%s at %i is UTC+%i", (zone, instant, hours) => {
    expect(zoneOffsetMsAt(instant, zone)).toBe(hours * H);
  });

  it("finds no instant in a spring-forward gap and two in a fall-back overlap", () => {
    expect(zoneWallClockInstants(wall(2021, 3, 14, 2, 30), "America/New_York")).toEqual([]);
    expect(zoneWallClockInstants(wall(2021, 11, 7, 1, 30), "America/New_York")).toHaveLength(2);
    expect(zoneWallClockInstants(wall(1950, 7, 1, 12), "Asia/Tokyo").map((r) => r.instantMs)).toEqual([wall(1950, 7, 1, 2)]);
  });
});

const tokyo = ABROAD_PLACES.find((p) => p.id === "jp-tokyo")!;
const input = (place: SajuInput["place"], hour: number, minute: number, extra: Partial<SajuInput> = {}): SajuInput => ({
  calendar: "solar", year: 1990, month: 6, day: 15, time: { hour, minute }, gender: "female", place, ...extra,
});

describe("charts for births abroad", () => {
  // Births abroad are behind the build flag (off by default; saju.test.ts checks the refusal).
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SAJU_ABROAD", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads a Tokyo birth on Tokyo's clock and longitude", () => {
    const chart = computeChart(input({ name: tokyo.names.en, longitude: tokyo.longitude, timeZone: tokyo.timeZone }, 12, 0));
    expect(chart.instantUTC).toBe("1990-06-15T03:00:00.000Z");
    expect(chart.correctedLocalTime).toBe("12:18");
  });

  it("gives a Tokyo noon birth the pillars of a Seoul birth at the same local mean time", () => {
    const t = computeChart(input({ name: "Tokyo", longitude: tokyo.longitude, timeZone: "Asia/Tokyo" }, 12, 0));
    const s = computeChart(input({ name: "서울", longitude: 126.978 }, 12, 51));
    expect(t.correctedLocalTime).toBe(s.correctedLocalTime);
    expect(t.pillars).toEqual(s.pillars);
  });

  it("applies Japan's 1950 summer time", () => {
    const chart = computeChart(input({ name: "Tokyo", longitude: tokyo.longitude, timeZone: "Asia/Tokyo" }, 12, 0, { year: 1950, month: 7, day: 1 }));
    expect(chart.instantUTC).toBe("1950-07-01T02:00:00.000Z");
  });

  it("refuses lunar dates, other zones and longitudes outside the zone", () => {
    const code = (fn: () => unknown) => {
      try { fn(); } catch (e) { return (e as SajuError).code; }
      return null;
    };
    expect(code(() => computeChart(input({ name: "Tokyo", longitude: tokyo.longitude, timeZone: "Asia/Tokyo" }, 12, 0, { calendar: "lunar" })))).toBe("UNSUPPORTED_CALENDAR");
    expect(code(() => computeChart(input({ name: "NYC", longitude: -74, timeZone: "America/New_York" }, 12, 0)))).toBe("UNSUPPORTED_PLACE");
    expect(code(() => computeChart(input({ name: "x", longitude: 100, timeZone: "Asia/Tokyo" }, 12, 0)))).toBe("UNSUPPORTED_PLACE");
  });

  it("lists 13 places with names in all four languages", () => {
    expect(ABROAD_PLACES).toHaveLength(13);
    for (const place of ABROAD_PLACES) for (const name of Object.values(place.names)) expect(name.length, place.id).toBeGreaterThan(0);
  });
});
