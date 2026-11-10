// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { RELATION_NOT_EVENT, relationChips } from "@/lib/sajuRelationChips";
import { ChartPanel } from "./ChartPanel";
import { RelationChips } from "./RelationChips";
import { chartFor } from "./useSajuChart";

afterEach(cleanup);

const result = chartFor({ ...DEFAULT_SAJU_FORM, year: 1984, month: 1, day: 15, timeKnown: true, hour: 12, minute: 0 });
const chart = () => {
  if (!("chart" in result)) throw new Error("no chart");
  return result.chart;
};

describe("RelationChips (C13)", () => {
  it("shows each 합·충 as a chip; a tap opens where its glyphs stand and that it is not an event", () => {
    const chips = relationChips(chart());
    expect(chips.length).toBeGreaterThan(0);
    render(<RelationChips chart={chart()} />);
    const box = screen.getByRole("region", { name: "글자끼리 맺은 관계" });
    const buttons = within(box).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(chips.map((c) => `${c.name}(${c.term}) ${c.pillars}`));
    fireEvent.click(buttons[0]!);
    expect(buttons[0]!.getAttribute("aria-expanded")).toBe("true");
    const detail = document.getElementById(buttons[0]!.getAttribute("aria-controls")!)!;
    expect(detail.hidden).toBe(false);
    expect(detail.textContent).toContain(chips[0]!.places);
    expect(detail.textContent).toContain(RELATION_NOT_EVENT);
    expect(box.textContent).not.toMatch(/형\(|파\(|해\(|刑|破|害/);
  });

  it("says so in one line when there is none", () => {
    // 甲寅 丙辰 戊午 (no 합·충): the line, no chip
    render(<RelationChips chart={{ pillars: { year: { stem: "甲", branch: "寅" }, month: { stem: "丙", branch: "辰" }, day: { stem: "戊", branch: "午" }, hour: null } } as never} />);
    expect(screen.getByText("육합·삼합·방합·천간합·충으로 맺은 글자 짝은 없어요.")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("sits in the ChartPanel of every computed chart", () => {
    render(<ChartPanel result={result} />);
    expect(screen.getByRole("region", { name: "글자끼리 맺은 관계" })).toBeTruthy();
  });
});
