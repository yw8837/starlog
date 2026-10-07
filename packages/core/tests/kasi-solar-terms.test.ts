import { describe, expect, it } from "vitest";
import { SOLAR_TERM_NAMES, getSolarTerm } from "manseryeok";
import kasi from "./fixtures/kasi-solar-terms-2021-2028.json";

// KASI golden (docs/research/manseryeok-references-2026-10.md §6.1): the 24절기 minutes KASI publishes for
// 2021–2028, read from its 달력자료 pages on 2026-10-07 (source and method in the fixture). A manseryeok
// update that moves any 절입 by more than a minute, or changes which ones differ, fails here.

const KST_MS = 9 * 3_600_000;
const MINUTE_MS = 60_000;
/** "YYYY-MM-DD HH:mm" in KST → the instant. */
const instantOf = (kst: string) => Date.parse(`${kst.replace(" ", "T")}:00Z`) - KST_MS;
/** The instant as "YYYY-MM-DD HH:mm" in KST. */
const kstOf = (ms: number) => new Date(ms + KST_MS).toISOString().slice(0, 16).replace("T", " ");

const rows = Object.entries(kasi.terms).flatMap(([year, list]) =>
  (list as [string, string][]).map(([name, kst], index) => ({ year: Number(year), index, name, kst, engineMs: getSolarTerm(Number(year), index).date.getTime() })));

describe("KASI 24절기 2021–2028 (fixtures/kasi-solar-terms-2021-2028.json)", () => {
  it("holds the 192 published values, each named as manseryeok names that index, with its source", () => {
    expect(rows).toHaveLength(192);
    expect(Object.keys(kasi.terms)).toEqual(["2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028"]);
    expect(rows.filter(r => r.name !== SOLAR_TERM_NAMES[r.index])).toEqual([]);
    expect(kasi.sourceUrl).toBe("https://astro.kasi.re.kr/kor/life/post/calendarData?search_year={year}");
    expect(kasi.retrieved).toBe("2026-10-07");
  });

  it("puts every manseryeok 절입 within ±1 minute of KASI", () => {
    const outside = rows.filter(r => Math.abs(r.engineMs - instantOf(r.kst)) > MINUTE_MS).map(r => `${r.year} ${r.name}: KASI ${r.kst}, manseryeok ${kstOf(r.engineMs)}`);
    expect(outside).toEqual([]);
  });

  it("differs only in the five +1 minute cases the fixture notes list (187 of 192 equal to the minute)", () => {
    const differing = rows
      .filter(r => r.engineMs !== instantOf(r.kst))
      .map(r => ({ year: r.year, name: r.name, kasi: r.kst, manseryeok: kstOf(r.engineMs) }));
    expect(differing).toEqual(kasi.notes.knownPlusOneMinute);
    expect(differing.every(d => instantOf(d.manseryeok) - instantOf(d.kasi) === MINUTE_MS)).toBe(true);
    expect(rows.length - differing.length).toBe(187);
  });
});
