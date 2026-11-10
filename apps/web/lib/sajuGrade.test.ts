import {
  GRADE_POPULATION, SIXTY_GANZHI, computeChart, gradeCuts, gradeOf, scoreGradePopulation, yearScores, type GradeChart, type GradeCuts,
  type SajuElement,
} from "@starlog/core";
import { describe, expect, it } from "vitest";
import { maskGanzhiReadings } from "./ai/ganzhi";
import { GLANCE_GRADE, GLANCE_REMEDY, GLANCE_SCHOOL, SAJU_BLOCKLIST, blocklistViolations, nonHaeyoSentences, sentences } from "./ai/validate";
import {
  GRADE_NICKNAME, balanceLine, boundaryNotice, currentGradeYear, flowLine, gradeChips, gradeForYear, gradeObservations, gradePercentile,
  nextBrightYear, yearLine,
} from "./sajuGrade";
import cutsJson from "./sajuGradeCuts.generated.json";
import ranksJson from "./sajuGradeRanks.generated.json";

const chart = (stems: string, branches: string): GradeChart => ({ stems: [...stems], branches: [...branches] });
// the three charts of packages/core/tests/grade.test.ts, scored by hand there
const A = chart("甲丁己辛", "子卯巳未");
const B = chart("丙甲丙", "午午寅");
const C = chart("庚己戊丁", "申丑子巳");
const ELEMENTS: readonly SajuElement[] = ["목", "화", "토", "금", "수"];
const seoul = { name: "서울", longitude: 126.978 };

describe("grade and nickname (A4, 확정 사항 1)", () => {
  it("names the four grades", () => {
    expect(GRADE_NICKNAME).toEqual({ S: "보름달 사주주", A: "차오르는 달 사주주", B: "초승달 사주주", C: "달빛 모으는 사주주" });
  });

  it("grades a year with that 세운's cuts, by hour known or not", () => {
    // 丙午 cuts: known [83, 57, 34], unknown [82, 50, 29]; A scores 44, C 34 (known), B 20 (unknown) in 2026
    expect(cutsJson.known[42]).toEqual([83, 57, 34]);
    expect(cutsJson.unknown[42]).toEqual([82, 50, 29]);
    expect(gradeForYear(A, 2026)).toEqual({ year: 2026, gz: "丙午", ko: "병오", grade: "B", nickname: "초승달 사주주" });
    expect(gradeForYear(C, 2026).grade).toBe("B");
    expect(gradeForYear(B, 2026).grade).toBe("C");
    expect(gradeForYear(A, 2020)).toMatchObject({ gz: "庚子", grade: "S" }); // 98
  });

  it("takes the current year at 입춘, KST", () => {
    expect(currentGradeYear(Date.parse("2026-11-11T12:00:00+09:00"))).toBe(2026);
    expect(currentGradeYear(Date.parse("2027-01-20T12:00:00+09:00"))).toBe(2026);
    expect(currentGradeYear(Date.parse("2027-02-05T12:00:00+09:00"))).toBe(2027);
  });

  it("gives ten chips from a year, each graded alone", () => {
    const chips = gradeChips(C, 2026);
    expect(chips.map((c) => c.year)).toEqual([2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035]);
    expect(chips.map((c) => c.ko).slice(0, 3)).toEqual(["병오", "정미", "무신"]);
    for (const c of chips) {
      const y = SIXTY_GANZHI.indexOf(c.gz);
      expect(c.grade).toBe(gradeOf(yearScores(C)[y]!, cutsJson.known[y] as unknown as GradeCuts));
    }
  });

  it("finds the next S or A year after a year, or none", () => {
    for (const g of [A, B, C]) {
      const next = nextBrightYear(g, 2026)!;
      expect(["S", "A"]).toContain(next.grade);
      for (let year = 2027; year < next.year; year++) expect(["B", "C"]).toContain(gradeForYear(g, year).grade);
    }
    expect(nextBrightYear(B, 2026)).toMatchObject({ year: 2028, gz: "戊申" });
  });
});

describe("three rule-made observations (B.5)", () => {
  it("reads chart B in 2026 and chart C in 2028 and 2034", () => {
    expect(gradeObservations(B, 2026)).toEqual([
      "다섯 기운 가운데 둘이 보여요. 흙(토)·쇠(금)·물(수)이 비어 있어요.",
      "이웃한 글자 7쌍 가운데 5쌍이 서로 살려 주는 사이(상생)예요.",
      "2026 병오년의 불(화) 기운 두 글자가 이미 가장 많은 쪽과 겹쳐요.",
    ]);
    expect(gradeObservations(C, 2028)).toEqual([
      "다섯 기운 가운데 넷이 보여요. 나무(목)가 비어 있어요.",
      "이웃한 글자 10쌍 가운데 3쌍이 서로 살려 주는 사이(상생)예요.", // 庚己, 戊丁, 申丑
      "2028 무신년의 흙(토) 기운은 이미 가장 많은 쪽과 겹치고, 쇠(금) 기운은 이미 있는 칸에 더해져요.",
    ]);
    expect(gradeObservations(C, 2034)[2]).toBe("2034 갑인년의 나무(목) 기운 두 글자가 비어 있던 칸을 채워요.");
    expect(gradeObservations(A, 2026)).toEqual([
      "다섯 기운이 모두 보여요. 나무(목)·불(화)·흙(토)이 두 글자씩 가장 많아요.",
      "이웃한 글자 10쌍이 모두 서로 살려 주는 사이(상생)예요.",
      "2026 병오년의 불(화) 기운 두 글자가 이미 가장 많은 쪽과 겹쳐요.",
    ]);
  });

  /** Every split of n glyphs over the five elements. */
  const splits = (n: number): Record<SajuElement, number>[] => {
    const out: Record<SajuElement, number>[] = [];
    const go = (i: number, left: number, acc: number[]) => {
      if (i === 4) return void out.push(Object.fromEntries(ELEMENTS.map((e, k) => [e, k < 4 ? acc[k]! : left])) as Record<SajuElement, number>);
      for (let c = 0; c <= left; c++) go(i + 1, left - c, [...acc, c]);
    };
    go(0, n, []);
    return out;
  };
  const every = (() => {
    const all = new Set<string>();
    for (const n of [6, 8]) {
      for (const counts of splits(n)) {
        all.add(balanceLine(counts));
        for (let year = 2026; year < 2086; year++) all.add(yearLine(counts, year)); // all 60 세운
      }
    }
    for (const total of [7, 10]) for (let k = 0; k <= total; k++) all.add(flowLine(k, total));
    return [...all];
  })();
  /** Worth of a person or a chart: never said (A1). */
  const WORTH = /(좋은|나쁜|훌륭한|뛰어난|부족한|모자란|못난|약한|강한|타고난)\s?(사람|사주|명식|팔자|운|복)|사주가\s?(좋|나쁘)|가치|그릇|복이\s?(많|없)/;
  /** A result promised. */
  const PROMISE = /(될|할|올|생길|이뤄질|풀릴|잘될)\s?(거|것)(예요|이에요|입니다)|이뤄져요|잘 풀려요|보장|약속/;

  it("every possible sentence (all splits of 6 and 8 glyphs × 60 세운) passes the banned-word checks", () => {
    expect(every.length).toBeGreaterThan(100);
    // as the readings' validators do, a 간지 read as a year ("2052 임신년의") is masked first: 壬申 is not 임신·출산
    const hits = every.flatMap((sentence) => {
      const text = maskGanzhiReadings(sentence);
      const out: string[] = [];
      for (const [pattern, label] of SAJU_BLOCKLIST) if (pattern.test(text)) out.push(label);
      for (const pattern of [GLANCE_GRADE, GLANCE_SCHOOL, GLANCE_REMEDY, WORTH, PROMISE]) if (pattern.test(text)) out.push(String(pattern).slice(0, 30));
      blocklistViolations(text, "", out);
      out.push(...nonHaeyoSentences(text).map((s) => `해요체 아님: ${s}`));
      return out.map((o) => `${text} → ${o}`);
    });
    expect(hits).toEqual([]);
  });

  it("never names a grade, a score, a share or a person's worth", () => {
    for (const text of every) {
      expect(text).not.toMatch(/[SABC](?![a-z])|등급|점수|순위|%|사주주/);
      expect(sentences(text).length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("상위 % (A6)", () => {
  it("reads the rank table on demand, with the population wording", async () => {
    const y = SIXTY_GANZHI.indexOf("丙午");
    const score = yearScores(C)[y]!; // 34
    const top = Math.ceil((100 * ranksJson.known[y]![score]!) / GRADE_POPULATION.hourKnown);
    const p = await gradePercentile(C, 2026);
    expect(p.topPercent).toBe(top);
    expect(p.text).toBe(
      `가능한 사주 조합 561,600개 가운데 위에서 ${top}% · 연 60 × 월 12 × 일 60 × 시 13(밤 11시대를 다음 날 천간으로 세는 스타로그 기준)을 하나씩 같은 무게로 센 순위예요. 인구 통계가 아니에요.`,
    );
    const u = await gradePercentile(B, 2026);
    expect(u.text).toMatch(/^시를 모르는 사주 조합 43,200개 가운데 위에서 \d+% · 연 60 × 월 12 × 일 60을 하나씩 같은 무게로 센 순위예요\. 인구 통계가 아니에요\.$/);
    expect((await gradePercentile(A, 2020)).topPercent).toBeLessThanOrEqual(8); // an S year is in the top 8% or its tie
  });
});

describe("the tables match the rule (F C3)", () => {
  it("recomputes every 세운's cuts and rank rows, 丙午 and 丁未 included, for both populations", () => {
    for (const [key, hourKnown] of [["known", true], ["unknown", false]] as const) {
      const { counts } = scoreGradePopulation(hourKnown);
      for (const gz of ["丙午", "丁未"]) {
        const y = SIXTY_GANZHI.indexOf(gz);
        expect(cutsJson[key][y], `${key} ${gz}`).toEqual(gradeCuts(counts[y]!));
      }
      expect(cutsJson[key]).toEqual(counts.map((row) => gradeCuts(row)));
      expect(ranksJson[key]).toEqual(counts.map((row) => row.map((_, s) => row.slice(s).reduce((a, b) => a + b, 0))));
    }
  }, 30_000);
});

describe("birth time at a boundary (A5)", () => {
  // 1995-06-01: 13:30 KST is 12:58 on the corrected clock, two minutes before 未 → 申: 2026 is C here, B with 己未.
  // 00:36 KST is 00:04, just after the 일주 turns (DAY_BOUNDARY): C here, B with the day before (壬戌).
  const at = (hour: number, minute: number) =>
    computeChart({ calendar: "solar", year: 1995, month: 6, day: 1, time: { hour, minute }, gender: "female", place: seoul });

  it("says when the neighbouring hour gives another grade", () => {
    const notice = boundaryNotice(at(13, 30), 2026)!;
    expect(notice).toMatchObject({ grade: "B", pillars: { hour: "己未" } });
    expect(notice.message).toBe("태어난 시각이 시주가 바뀌는 때와 몇 분 차이예요. 몇 분 차이로 시주가 기미(己未)가 되면 2026 병오년 등급은 B(초승달 사주주)예요.");
    expect(gradeForYear({ stems: [...notice.chart.stems], branches: [...notice.chart.branches] }, 2026).grade).toBe("B");
    const day = boundaryNotice(at(0, 36), 2026)!;
    expect(day).toMatchObject({ grade: "B", pillars: { day: "壬戌" } });
    expect(day.message).toContain("일주가 바뀌는 때");
  });

  it("stays quiet when the neighbour gives the same grade, or the time is far from a boundary", () => {
    expect(boundaryNotice(at(15, 34), 2026)).toBeNull(); // HOUR_BOUNDARY, 己未 either way: B → B
    expect(boundaryNotice(at(14, 30), 2026)).toBeNull();
    expect(boundaryNotice(computeChart({ calendar: "solar", year: 1995, month: 6, day: 1, time: null, gender: "female", place: seoul }), 2026)).toBeNull();
  });
});
