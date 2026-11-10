// @vitest-environment jsdom
import { SIXTY_GANZHI, yearScores, type GradeChart } from "@starlog/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MODEL_NAMES } from "@/lib/ai/style";
import { CRISIS_CONTACTS } from "@/lib/crisis";
import { GRADE_MEASURED } from "@/lib/sajuGradeMeasured";
import { sitemapEntriesFor } from "@/lib/seo";
import SajuGradeHowPage, { metadata } from "./page";

/** /saju/grade/how (spec 2026-11-11 A, E, F C5): the public rule page. */

afterEach(cleanup);

const text = () => document.body.textContent ?? "";

describe("/saju/grade/how", () => {
  it("is a search page of its own at /saju/grade/how, listed with /saju/grade on the app host (never a shared card)", () => {
    expect(metadata.alternates?.canonical).toBe("/saju/grade/how");
    expect(metadata.robots).toBeUndefined();
    const app = sitemapEntriesFor("app").map((entry) => entry.path);
    expect(app.filter((path) => path.startsWith("/saju/grade"))).toEqual(["/saju/grade", "/saju/grade/how"]);
    expect(sitemapEntriesFor("guide").map((entry) => entry.path).filter((path) => path.startsWith("/saju/grade"))).toEqual([]);
  });

  it("gives the formula in plain words, the rule's id, and that the same input gives the same result", () => {
    render(<SajuGradeHowPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("사주 등급은 이렇게 계산해요");
    for (const part of ["고르기", "흐름", "올해 순위", "18", "12", "70", "상생", "입춘", "지장간", "starlog-grade-v1", "같은 입력이면 언제나 같은 결과"]) expect(text()).toContain(part);
    expect(text()).toContain("위에서 8%까지 S, 30%까지 A, 70%까지 B, 나머지는 C");
    for (const nickname of ["보름달 사주주", "차오르는 달 사주주", "초승달 사주주", "달빛 모으는 사주주"]) expect(text()).toContain(nickname);
  });

  it("publishes the whole formula with its constants and rounding, so a grade can be recomputed by hand (review 7)", () => {
    render(<SajuGradeHowPage />);
    const section = screen.getByRole("region", { name: "식 그대로" });
    for (const part of [
      "D = Σ|5 × c − n|", "g = 1 − (D − D최소) ÷ (8n − D최소)", "상생 1, 같은 기운 0.5, 상극 0", "목·화, 화·토, 토·금, 금·수, 수·목",
      "m = 30 × e + 20 × (고리′ − 고리) ÷ 2", "e = (g′ − g + 0.2) ÷ 0.5", "0보다 작으면 0, 1보다 크면 1", "r = (m이 더 작은 해의 수 + (m이 같은 해의 수 − 1) ÷ 2) ÷ 59",
      "18 × g + 12 × f + 70 × r", "반올림", "8% 미만이면 S, 30% 미만이면 A, 70% 미만이면 B",
    ]) expect(section.textContent, part).toContain(part);
  });

  it("the published formula, coded from the page's words alone, gives the engine's score for every 세운", () => {
    // 목화토금수 of the glyphs, as the page's 무엇을 보나요 lists them
    const EL: Record<string, number> = { 甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 2, 庚: 3, 辛: 3, 壬: 4, 癸: 4, 寅: 0, 卯: 0, 巳: 1, 午: 1, 辰: 2, 戌: 2, 丑: 2, 未: 2, 申: 3, 酉: 3, 亥: 4, 子: 4 };
    const counts = (glyphs: string[]) => [0, 1, 2, 3, 4].map((e) => glyphs.filter((x) => EL[x] === e).length);
    const D = (c: number[], n: number) => c.reduce((sum, x) => sum + Math.abs(5 * x - n), 0);
    const g = (c: number[]) => {
      const n = c.reduce((a, b) => a + b, 0);
      const even = [0, 1, 2, 3, 4].map((i) => Math.floor(n / 5) + (i < n % 5 ? 1 : 0));
      return 1 - (D(c, n) - D(even, n)) / (8 * n - D(even, n));
    };
    const rings = (c: number[]) => [0, 1, 2, 3, 4].filter((i) => c[i]! > 0 && c[(i + 1) % 5]! > 0).length;
    const link = (a: number, b: number): number => (a === b ? 0.5 : (a + 1) % 5 === b || (b + 1) % 5 === a ? 1 : 0);
    const byHand = (chart: GradeChart) => {
      const { stems, branches } = chart;
      const c = counts([...stems, ...branches]);
      const pairs = [
        ...stems.slice(1).map((s, i) => link(EL[stems[i]!]!, EL[s]!)),
        ...branches.slice(1).map((b, i) => link(EL[branches[i]!]!, EL[b]!)),
        ...stems.map((s, i) => link(EL[s]!, EL[branches[i]!]!)),
      ];
      const f = pairs.reduce((a, b) => a + b, 0) / pairs.length;
      const m = SIXTY_GANZHI.map((gz) => {
        const next = counts([...stems, ...branches, gz[0]!, gz[1]!]);
        const e = Math.min(1, Math.max(0, (g(next) - g(c) + 0.2) / 0.5));
        return 30 * e + (20 * (rings(next) - rings(c))) / 2;
      });
      return m.map((mine) => {
        const r = (m.filter((x) => x < mine).length + (m.filter((x) => x === mine).length - 1) / 2) / 59;
        return Math.round(18 * g(c) + 12 * f + 70 * r);
      });
    };
    for (const chart of [
      { stems: [..."甲丁己辛"], branches: [..."子卯巳未"] },
      { stems: [..."丙甲丙"], branches: [..."午午寅"] },
      { stems: [..."庚己戊丁"], branches: [..."申丑子巳"] },
      { stems: [..."辛癸庚"], branches: [..."未巳寅"] },
      { stems: [..."戊己戊己"], branches: [..."辰未辰未"] },
    ]) expect(byHand(chart)).toEqual(yearScores(chart));
  });

  it("says what is left out on purpose and why: 신강·신약, 용신, 격국, 조후, 합화, 합·충, 대운", () => {
    render(<SajuGradeHowPage />);
    const section = screen.getByRole("region", { name: "일부러 쓰지 않는 것" });
    for (const term of ["신강", "용신", "격국", "조후", "합화", "충", "대운"]) expect(section.textContent).toContain(term);
    expect(section.textContent).toContain("유파");
  });

  it("explains the population (561,600 and 43,200) and that it is not a census", () => {
    render(<SajuGradeHowPage />);
    for (const part of ["561,600", "연 60 × 월 12 × 일 60 × 시 13", "43,200", "518,400", "인구 통계가 아니에요"]) expect(text()).toContain(part);
  });

  it("shows the measured distribution, the per-day-master tables for 2026–2028 from the run, and the 16 charts with no S·A", () => {
    render(<SajuGradeHowPage />);
    const known = GRADE_MEASURED.known;
    for (const [year, ko] of [[2026, "병오"], [2027, "정미"], [2028, "무신"]] as const) {
      const table = screen.getByRole("table", { name: new RegExp(`${year} ${ko}년 일간별 등급 비율 \\(시를 알 때`) });
      const rows = within(table).getAllByRole("row");
      expect(rows.map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent).join(" "))).toEqual([
        "일간 S A B C",
        ...(["목", "화", "토", "금", "수"] as const).map((e) => `${e} ${known.years[year][e].map((x) => `${x.toFixed(1)}%`).join(" ")}`),
      ]);
    }
    expect(text()).toContain("16개");
    expect(text()).toContain("어느 10년을 잡아도 열 해 내내 C인 명식은 0개");
    expect(text()).toContain(known.meanS.map((x) => `${x.toFixed(1)}%`).join(" · "));
  });

  it("lists its sources with honest marks: 원문 확인, 출처 미확인, 자체 기준", () => {
    render(<SajuGradeHowPage />);
    const section = screen.getByRole("region", { name: "근거 자료" });
    for (const book of ["五行大義", "三命通會", "滴天髓", "淵海子平"]) expect(section.textContent).toContain(book);
    expect(within(section).getAllByText("출처 미확인").length).toBeGreaterThanOrEqual(3);
    expect(within(section).getAllByText("자체 기준").length).toBeGreaterThanOrEqual(3);
    expect(within(section).getAllByText("원문 확인").length).toBeGreaterThanOrEqual(3);
    for (const link of within(section).getAllByRole("link")) expect(link.getAttribute("href")).toMatch(/^https:\/\/zh\.wikisource\.org\//);
  });

  it("ends with the helplines and the notice, and links back to the card", () => {
    render(<SajuGradeHowPage />);
    for (const contact of CRISIS_CONTACTS.slice(0, 1)) expect(document.querySelector(`a[href="tel:${contact.number}"]`)).toBeTruthy();
    expect(text()).toContain("재미로 보는 계산이에요");
    expect(screen.getByRole("link", { name: /내 등급 보기/ }).getAttribute("href")).toBe("/saju/grade");
  });

  it("never claims accuracy or science, never says 베타 or names a model", () => {
    render(<SajuGradeHowPage />);
    expect(text()).not.toMatch(/정확|과학적|베타|첫 풀이/);
    expect(text()).not.toMatch(MODEL_NAMES);
  });
});
