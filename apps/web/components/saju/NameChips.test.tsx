// @vitest-environment jsdom
import { computeChart } from "@starlog/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SAJU_NAMES_NONE, SAJU_NAMES_TITLE } from "@/lib/sajuEnrichment";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { ChartPanel } from "./ChartPanel";

afterEach(cleanup);

// docs/superpowers/specs/2026-10-08-saju-enrichment-design.md §5: free and code-built, under the four pillars and the 오행 bars
const chartOf = (patch: Partial<SajuForm>) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch }));
const DOBI = chartOf({ year: 1988, month: 8, day: 15, timeKnown: true, hour: 10, minute: 22 }); // 甲辰 壬寅 庚申 戊辰
const NO_NAME = chartOf({ year: 1987, month: 9, day: 9, timeKnown: true, hour: 9, minute: 30 }); // 壬辰 辛酉 己酉 丁卯
const ALL_SIX = chartOf({ year: 1995, month: 7, day: 5, timeKnown: true, hour: 2, minute: 30 }); // 辛丑 丁酉 壬午 乙亥

const names = () => screen.getByRole("region", { name: SAJU_NAMES_TITLE });
const elements = () => screen.getByRole("region", { name: "오행" });
const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("이 명식에 붙는 이름 and the 개운 line on the chart", () => {
  it("도비: four chips right below 네 기둥, each opening its meaning and where it was found", () => {
    render(<ChartPanel result={{ chart: DOBI }} />);
    const chips = within(names()).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual(["문창귀인", "학당귀인", "역마", "화개"]);
    expect(chips.map((chip) => chip.getAttribute("aria-expanded"))).toEqual(["false", "false", "false", "false"]);
    expect(follows(screen.getByRole("region", { name: "네 기둥" }), names())).toBe(true);
    expect(follows(names(), elements())).toBe(true);

    const yeokma = chips[2]!;
    const panel = document.getElementById(yeokma.getAttribute("aria-controls")!)!;
    expect(panel.hidden).toBe(true);
    fireEvent.click(yeokma);
    expect(yeokma.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("움직임과 변화에 열린 배치에 붙는 이름이에요.");
    expect(panel.textContent).toContain("태어난 해 辰 기준 → 태어난 날 寅 · 태어난 날 寅 기준 → 태어난 달 申");
    // one open at a time; the same chip closes it
    fireEvent.click(chips[0]!);
    expect([chips[0]!.getAttribute("aria-expanded"), yeokma.getAttribute("aria-expanded"), panel.hidden]).toEqual(["true", "false", true]);
    fireEvent.click(chips[0]!);
    expect(chips[0]!.getAttribute("aria-expanded")).toBe("false");
  });

  it("도비: the 개운 line under the 오행 bars", () => {
    render(<ChartPanel result={{ chart: DOBI }} />);
    expect(within(elements()).getByText("곁에 두면 좋은 것: 빨강 포인트 · 낮 햇볕 10분")).toBeTruthy();
  });

  it("a chart with no name: one plain line and no chip; its 개운 line names every tied element's colour", () => {
    render(<ChartPanel result={{ chart: NO_NAME }} />);
    expect(within(names()).queryAllByRole("button")).toEqual([]);
    expect(within(names()).getByText(SAJU_NAMES_NONE)).toBeTruthy();
    expect(within(elements()).getByText("곁에 두면 좋은 것: 초록·빨강 포인트 · 화분 가꾸기")).toBeTruthy();
  });

  it("closes an open chip when another chart comes in (review A7: keyed by the chart)", () => {
    const { rerender } = render(<ChartPanel result={{ chart: DOBI }} />);
    fireEvent.click(within(names()).getAllByRole("button")[0]!);
    expect(within(names()).getAllByRole("button")[0]!.getAttribute("aria-expanded")).toBe("true");
    rerender(<ChartPanel result={{ chart: chartOf({}) }} />); // the sample chart: 학당귀인 first
    expect(within(names()).getAllByRole("button").map((chip) => [chip.textContent, chip.getAttribute("aria-expanded")])).toEqual([["학당귀인", "false"]]);
  });

  it("five chips at most: of all six names, 화개 is left off", () => {
    render(<ChartPanel result={{ chart: ALL_SIX }} />);
    expect(within(names()).getAllByRole("button").map((chip) => chip.textContent)).toEqual(["천을귀인", "문창귀인", "학당귀인", "도화", "역마"]);
  });
});
