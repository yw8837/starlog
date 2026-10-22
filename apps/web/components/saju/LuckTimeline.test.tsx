// @vitest-environment jsdom
import { computeChart } from "@starlog/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { LuckTimeline } from "./LuckTimeline";

afterEach(cleanup);

const chartOf = (patch: Partial<SajuForm>) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch }));
const KNOWN = chartOf({ year: 1996, month: 2, day: 7, timeKnown: true, hour: 7, minute: 20 });
const NOW = Date.parse("2026-10-23T03:00:00Z");

const region = () => screen.getByRole("region", { name: "대운과 세운" });

describe("대운과 세운", () => {
  it("대운 first: every cycle in order, the current one marked 지금 with its start and 만 나이, the ten gods under the glyphs", () => {
    render(<LuckTimeline chart={KNOWN} now={NOW} />);
    const list = within(region()).getByRole("list", { name: "대운, 10년마다" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(10);
    const current = items.filter((li) => li.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain("丁亥");
    expect(current[0]!.textContent).toContain("정해");
    expect(current[0]!.textContent).toContain("2016.11~");
    expect(current[0]!.textContent).toContain("만 20세");
    expect(current[0]!.textContent).toContain("상관");
    expect(current[0]!.textContent).toContain("편인");
    expect(current[0]!.textContent).toContain("지금");
    expect(items.map((li) => li.textContent!.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/)![0])).toEqual(KNOWN.luck.pillars.map((p) => p.ganzhi));
  });

  it("세운: three years from the one in force, the first marked 지금", () => {
    render(<LuckTimeline chart={KNOWN} now={NOW} />);
    const toggle = within(region()).getByRole("group", { name: "대운과 세운 보기" });
    fireEvent.click(within(toggle).getByRole("button", { name: "세운 · 1년" }));
    expect(within(toggle).getByRole("button", { name: "세운 · 1년" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(region()).queryByRole("list", { name: "대운, 10년마다" })).toBeNull();
    const items = within(within(region()).getByRole("list", { name: "세운, 한 해마다" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent!.match(/\d{4}년/)![0])).toEqual(["2026년", "2027년", "2028년"]);
    expect(items[0]!.getAttribute("aria-current")).toBe("true");
    expect(items[0]!.textContent).toContain("丙午");
    expect(items[0]!.textContent).toContain("지금");
  });

  it("time unknown: the starts are approximate and say so", () => {
    render(<LuckTimeline chart={chartOf({})} now={NOW} />);
    const items = within(within(region()).getByRole("list", { name: "대운, 10년마다" })).getAllByRole("listitem");
    expect(items[0]!.textContent).toMatch(/약 \d{4}\.\d{1,2}~/);
    expect(region().textContent).toContain("태어난 시를 몰라 대운이 바뀌는 때는 앞뒤로 몇 달 달라질 수 있어요.");
  });

  it("no 대운 from the engine: only the 세운, with the reason", () => {
    render(<LuckTimeline chart={chartOf({ year: 1990, month: 2, day: 4 })} now={NOW} />);
    expect(within(region()).queryByRole("group", { name: "대운과 세운 보기" })).toBeNull();
    expect(within(region()).getByRole("list", { name: "세운, 한 해마다" })).toBeTruthy();
    expect(region().textContent).toContain("태어난 해나 달의 기둥이 확실하지 않아 대운은 세우지 않았어요.");
  });

  it("waits for the clock: nothing dated before `now` is known", () => {
    const { container } = render(<LuckTimeline chart={KNOWN} now={null} />);
    expect(container.textContent).toBe("");
  });
});
