import { describe, expect, it } from "vitest";
import { getSolarTerm } from "manseryeok";
import { KASI_DST_DISAGREEMENTS, KOREA_CIVIL_PERIODS, koreaCivilOffsetAt, solarTermsOfYear } from "../src";

// The data the guide's 원본 자료 articles print (2026-11-10): the engine's own tables, read through the core API.

describe("KOREA_CIVIL_PERIODS", () => {
  it("is the P1 table the engine reads: 28 changes from 1908-04-01 to 1988-10-09", () => {
    expect(KOREA_CIVIL_PERIODS).toHaveLength(28);
    expect(KOREA_CIVIL_PERIODS[0]).toEqual(["1908-04-01T00:00", 510, 510]);
    expect(KOREA_CIVIL_PERIODS.at(-1)).toEqual(["1988-10-09T03:00", 540, 540]);
    // Each period's offset is what koreaCivilOffsetAt gives an hour after it starts.
    for (const [i, [wall, offset, standard]] of KOREA_CIVIL_PERIODS.entries()) {
      const previous = i === 0 ? offset : KOREA_CIVIL_PERIODS[i - 1]![1];
      const instant = Date.parse(`${wall}Z`) - previous * 60_000 + 3_600_000;
      expect(koreaCivilOffsetAt(instant), wall).toEqual({ offsetMinutes: offset, standardOffsetMinutes: standard });
    }
    expect(KASI_DST_DISAGREEMENTS).toHaveLength(10);
  });
});

describe("solarTermsOfYear", () => {
  it("lists the 24 terms of a year in order, as manseryeok gives them, from 소한", () => {
    const terms = solarTermsOfYear(2026);
    expect(terms).toHaveLength(24);
    expect(terms[0]?.name).toBe("소한");
    for (const [index, term] of terms.entries()) expect(term.instantUTC).toBe(getSolarTerm(2026, index).date.toISOString());
  });
});
