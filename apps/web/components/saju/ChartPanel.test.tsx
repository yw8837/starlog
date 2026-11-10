// @vitest-environment jsdom
import { gradeChartOf } from "@starlog/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { currentGradeYear, gradeForYear } from "@/lib/sajuGrade";
import { ChartPanel } from "./ChartPanel";
import { chartFor } from "./useSajuChart";

afterEach(cleanup);

const result = chartFor({ ...DEFAULT_SAJU_FORM, year: 1995, month: 6, day: 1, timeKnown: true, hour: 14, minute: 30 });

describe("ChartPanel's 이 명식의 올해 등급 (spec 2026-11-11 B 들어오는 곳 3)", () => {
  it("with gradeCard (the free 명식): a mini card of this chart's grade now, to /saju/grade", () => {
    if (!("chart" in result)) throw new Error("no chart");
    const g = gradeForYear(gradeChartOf(result.chart), currentGradeYear());
    render(<ChartPanel result={result} gradeCard />);
    const link = screen.getByRole("link", { name: new RegExp(`이 명식의 올해 등급.*${g.grade}`) });
    expect(link.getAttribute("href")).toBe("/saju/grade");
    expect(link.textContent).toContain(`${g.year} ${g.ko}년 · ${g.nickname}`);
  });

  it("without it (a reading's chapter, a partner's chart) there is none", () => {
    render(<ChartPanel result={result} />);
    expect(screen.queryByRole("link", { name: /이 명식의 올해 등급/ })).toBeNull();
  });
});
