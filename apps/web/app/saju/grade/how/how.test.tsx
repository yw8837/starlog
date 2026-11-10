// @vitest-environment jsdom
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
