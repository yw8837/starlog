import {
  GRADE_POPULATION, SIXTY_GANZHI, computeChart, gradeChartOf, gradeCuts, gradeOf, scoreGradePopulation, yearScores, type GradeChart, type GradeCuts,
  type SajuElement,
} from "@starlog/core";
import { describe, expect, it } from "vitest";
import { maskGanzhiReadings } from "./ai/ganzhi";
import { GLANCE_GRADE, GLANCE_REMEDY, GLANCE_SCHOOL, SAJU_BLOCKLIST, blocklistViolations, nonHaeyoSentences, sentences } from "./ai/validate";
import {
  GRADE_FIXED_LINE, GRADE_NICKNAME, GRADE_NOTICE, GRADE_SLUGS, GRADE_YEARS, balanceLine, boundaryNotice, compareLine, currentGradeYear, flowLine, gradeChips,
  gradeForYear, gradeLine, gradeObservations, gradePercentile, gradeSlug, gradeStaticSlugs, nextBrightLine, nextBrightYear, parseGradeSlug, yearLine,
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
const unknownHour = (year: number, month: number, day: number) =>
  gradeChartOf(computeChart({ calendar: "solar", year, month, day, time: null, gender: "female", place: seoul }));
/** 1983-01-10, hour unknown: B C B B B B C C B B from 2026, the next S·A 2040 (measured with the engine). */
const FAR = unknownHour(1983, 1, 10);
/** 1975-03-10, hour unknown: A in 2026, then B C C C B B C C C, the next S·A 2037. */
const BRIGHT_THEN_FAR = unknownHour(1975, 3, 10);

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

  /** As the readings' validators do, a 간지 read as a year ("2052 임신년의") is masked first: 壬申 is not 임신·출산. */
  const bannedHits = (sentence: string): string[] => {
    const text = maskGanzhiReadings(sentence);
    const out: string[] = [];
    for (const [pattern, label] of SAJU_BLOCKLIST) if (pattern.test(text)) out.push(label);
    for (const pattern of [GLANCE_GRADE, GLANCE_SCHOOL, GLANCE_REMEDY, WORTH, PROMISE]) if (pattern.test(text)) out.push(String(pattern).slice(0, 30));
    blocklistViolations(text, "", out);
    out.push(...nonHaeyoSentences(text).map((s) => `해요체 아님: ${s}`));
    return out.map((o) => `${text} → ${o}`);
  };

  it("every possible sentence (all splits of 6 and 8 glyphs × 60 세운) passes the banned-word checks", () => {
    expect(every.length).toBeGreaterThan(100);
    expect(every.flatMap(bannedHits)).toEqual([]);
  });

  it("the fixed line and every kind of next S·A line pass the banned-word checks too", () => {
    const lines = [
      GRADE_FIXED_LINE,
      nextBrightLine(B, 2026),
      nextBrightLine(FAR, 2026, 2035),
      nextBrightLine(BRIGHT_THEN_FAR, 2026, 2035),
      nextBrightLine(chart("戊己戊己", "辰未辰未"), 2026),
      nextBrightLine(chart("乙己己庚", "丑丑亥午"), 2031),
    ];
    expect(new Set(lines).size).toBe(lines.length);
    // they name 등급 itself by design (A1, A4); every other banned word is checked as for the observations
    expect(lines.map((line) => line.replaceAll("등급", "□")).flatMap(bannedHits)).toEqual([]);
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

describe("card copy and the share address (A1, A4, B, C, E)", () => {
  it("has a line per grade, 그해 for a year other than this one", () => {
    expect(gradeLine("S", true)).toBe("올해 들어오는 기운이 내 명식의 빈칸을 고르게 채워 주는 해예요.");
    expect(gradeLine("A", true)).toBe("빈칸 대부분이 채워지는 해예요. 조금씩 다듬으면 고르게 돌아요.");
    expect(gradeLine("B", true)).toBe("채워지는 칸과 겹치는 칸이 섞인 해예요. 하나씩 쌓아 가기 좋아요.");
    expect(gradeLine("C", true)).toBe("올해 기운이 이미 많은 쪽과 겹치는 해예요. 빈칸을 새로 모으는 때예요.");
    expect(gradeLine("S", false)).toBe("그해 들어오는 기운이 내 명식의 빈칸을 고르게 채워 주는 해예요.");
    expect(gradeLine("C", false)).toBe("그해 기운이 이미 많은 쪽과 겹치는 해예요. 빈칸을 새로 모으는 때예요.");
    // not 해마다 바뀌어요: about a quarter of charts keep one grade five years or more (review 3)
    expect(GRADE_FIXED_LINE).toBe(
      "등급은 사람이나 사주의 좋고 나쁨이 아니에요. 올해 들어오는 기운이 내 명식의 다섯 기운을 얼마나 고르게 채우고 잇는지를 스타로그 규칙으로 계산한 거예요. 해마다 다시 계산해요.",
    );
    expect(GRADE_NOTICE).toBe("재미로 보는 계산이에요. 사람이나 사주의 좋고 나쁨, 앞으로 일어날 일을 정하지 않아요. 규칙은 '등급은 어떻게 나와요?'에 다 적어 두었어요.");
  });

  it("puts only a year and a grade in the share address: 2026–2085 × S·A·B·C, nothing else", () => {
    expect(gradeSlug(2026, "S")).toBe("2026-s");
    expect(GRADE_YEARS).toEqual({ first: 2026, last: 2085 });
    expect(parseGradeSlug("2028-a")).toEqual({ year: 2028, gz: "戊申", ko: "무신", grade: "A", nickname: "차오르는 달 사주주" });
    expect(parseGradeSlug("2036-b")).toEqual({ year: 2036, gz: "丙辰", ko: "병진", grade: "B", nickname: "초승달 사주주" });
    expect(parseGradeSlug("2085-c")).toMatchObject({ year: 2085, grade: "C" });
    for (const bad of [
      "2025-s", "2086-a", "9999-s", "0000-s", "2026-d", "2026-S", "2026s", "02036-a", "2036-ab", " 2036-a", "2036-a ", "2036-a\n", "1990-05-15", "2026-s-1990", "", "constructor",
    ]) expect(parseGradeSlug(bad), bad).toBeNull();
  });

  it("builds ahead only the ten chips' years from the year in force; from 입춘 2027 the last chip (2036) still has its address", () => {
    const before = Date.parse("2027-01-20T12:00:00+09:00");
    const after = Date.parse("2027-02-05T12:00:00+09:00");
    expect(gradeStaticSlugs(before)).toHaveLength(40);
    expect([gradeStaticSlugs(before)[0], gradeStaticSlugs(before).at(-1)]).toEqual(["2026-s", "2035-c"]);
    expect([gradeStaticSlugs(after)[0], gradeStaticSlugs(after).at(-1)]).toEqual(["2027-s", "2036-c"]);
    const last = gradeChips(C, currentGradeYear(after)).at(-1)!;
    expect(last.year).toBe(2036);
    expect(parseGradeSlug(gradeSlug(last.year, last.grade))).toMatchObject({ year: 2036, grade: last.grade });
    // the built set never leaves the range
    expect(gradeStaticSlugs(Date.parse("2080-03-01T12:00:00+09:00")).at(-1)).toBe("2085-c");
    expect(GRADE_SLUGS).toEqual(gradeStaticSlugs());
  });

  it("names the next S·A year, or says truthfully when there is none in 60 years", () => {
    expect(nextBrightLine(B, 2026)).toBe("다음 S·A 해: 2028 무신년");
    // a 壬申 year reads as the year it is, never masked
    expect(nextBrightLine(chart("乙己己庚", "丑丑亥午"), 2031)).toBe("2032~2040년 칩에는 S·A가 없어요. 규칙으로는 다음이 2052 임신년이에요. 등급은 좋고 나쁨이 아니에요.");
    expect(gradeForYear(chart("乙己己庚", "丑丑亥午"), 2031).grade).toMatch(/^[SA]$/);
    // one of the 16 charts with every glyph 토 (measured: none of them gets S or A in 60 years; B and C only)
    const earth = chart("戊己戊己", "辰未辰未");
    expect(nextBrightYear(earth, 2026)).toBeNull();
    expect(nextBrightLine(earth, 2026)).toBe(
      "60가지 해를 다 돌아도 이 명식에는 S·A가 나오는 해가 없어요. 여덟 글자가 모두 흙(토)이라 고르기 몫이 0으로 잡히는 규칙 때문이에요. 60가지 해 동안 등급은 B와 C만 나와요.",
    );
  });

  it("says first, kindly, when the next S·A year is past the ten chips (review 3: about 4.6% of charts)", () => {
    expect(gradeChips(FAR, 2026).map((c) => c.grade).join("")).toBe("BCBBBBCCBB");
    expect(nextBrightLine(FAR, 2026, 2035)).toBe("10년 칩 안에는 S·A가 없어요. 규칙으로는 다음이 2040 경신년이에요. 등급은 좋고 나쁨이 아니에요.");
    expect(nextBrightLine(FAR, 2030, 2035)).toBe(nextBrightLine(FAR, 2026, 2035));
    // this year is A: only the chips after it have none
    expect(gradeChips(BRIGHT_THEN_FAR, 2026).map((c) => c.grade).join("")).toBe("ABCCCBBCCC");
    expect(nextBrightLine(BRIGHT_THEN_FAR, 2026, 2035)).toBe("2027~2035년 칩에는 S·A가 없어요. 규칙으로는 다음이 2037 정사년이에요. 등급은 좋고 나쁨이 아니에요.");
    // on the last chip, the next year is named as before; within the chips too
    expect(nextBrightLine(FAR, 2035, 2035)).toBe("다음 S·A 해: 2040 경신년");
    expect(nextBrightLine(B, 2026, 2035)).toBe("다음 S·A 해: 2028 무신년");
  });

  it("compares a friend's grade with mine for the same year, and when mine reaches theirs", () => {
    // B (hour unknown): 2026 C, 2027 B, 2028 A, and no S in all 60 years (measured)
    expect(compareLine("A", B, 2026)).toBe("친구 A · 나 C — 2028년엔 나도 A예요");
    expect(compareLine("S", B, 2026)).toBe("친구 S · 나 C"); // never S: no promise of one
    expect(compareLine("C", B, 2026)).toBe("친구 C · 나 C — 같은 등급이에요");
    expect(compareLine("B", B, 2028)).toBe("친구 B · 나 A");
  });
});
