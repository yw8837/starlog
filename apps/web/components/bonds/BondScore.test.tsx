// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { bondBasis, bondScore } from "@starlog/core";
import { BondScore, ConstellationStats } from "./BondScore";

/**
 * 인연 점수 한눈에 (owner 2026-10-23: "점수 직관적으로 보이게"): the big number, a 55–99 gauge and the table of what made
 * it, straight from bondScore's own parts (nothing invented); 덜어진 항목 in the guide's calm words.
 */

afterEach(cleanup);

// The guide's worked example: 1999-10-03 서진 and 1993-06-11 하윤 → 62 + 12 − 5 = 69.
const SEOJIN = bondBasis({ calendar: "solar", year: 1999, month: 10, day: 3 });
const HAYUN = bondBasis({ calendar: "solar", year: 1993, month: 6, day: 11 });

describe("BondScore", () => {
  it("shows the score big, on a 55–99 gauge, and a row for each thing it looks at with its points and plain words", () => {
    const { score, parts } = bondScore(SEOJIN, HAYUN);
    expect(score).toBe(69);
    render(<BondScore score={score} parts={parts} />);
    expect(screen.getByText("69").closest("p")?.textContent).toContain("69점");
    const meter = screen.getByRole("meter", { name: "인연 점수" });
    expect(meter.getAttribute("aria-valuemin")).toBe("55");
    expect(meter.getAttribute("aria-valuemax")).toBe("99");
    expect(meter.getAttribute("aria-valuenow")).toBe("69");
    const table = screen.getByRole("table", { name: "점수를 만든 항목" });
    const rows = within(table).getAllByRole("row").map((row) => row.textContent);
    expect(rows).toEqual([
      "보는 것점수풀이",
      "기본 점수62모든 계산은 62점에서 시작해요",
      "일간끼리+12두 분의 일간이 서로 합을 이루는 사이예요",
      "띠끼리−5띠가 마주 보는 사이라, 부딪히면서 서로를 깨워요",
      "일지끼리0이번에는 더하거나 빼는 관계가 없어요",
      "서로 채워 주는 오행0이번에는 더하거나 빼는 관계가 없어요",
      "합계69점",
    ]);
    // Calm, as the guide reads them: nothing that scares.
    expect(table.textContent).not.toMatch(/나쁜|불길|위험|최악/);
  });

  it("says when the sum was kept inside 55–99", () => {
    render(<BondScore score={98} parts={[{ id: "stem-combine", points: 12, text: "a" }, { id: "year-six", points: 8, text: "b" }, { id: "day-six", points: 6, text: "c" }, { id: "fill-mine", points: 5, text: "d" }, { id: "fill-theirs", points: 5, text: "e" }, { id: "uncertain", points: 0, text: "절기가 바뀌는 날이라 태어난 시각에 따라 달라질 수 있어요" }]} />);
    const table = screen.getByRole("table", { name: "점수를 만든 항목" });
    expect(within(table).getAllByRole("row").at(-1)?.textContent).toBe("합계98점");
    expect(within(table).getByText("+10")).toBeTruthy(); // both 오행 fills in one row
    expect(screen.getByText("절기가 바뀌는 날이라 태어난 시각에 따라 달라질 수 있어요")).toBeTruthy();
  });

  it("keeps a raw sum over 99 at 99 and says so", () => {
    render(<BondScore score={99} parts={[{ id: "stem-combine", points: 12, text: "a" }, { id: "year-six", points: 8, text: "b" }, { id: "day-six", points: 6, text: "c" }, { id: "fill-mine", points: 5, text: "d" }, { id: "fill-theirs", points: 5, text: "e" }, { id: "stem-combine", points: 3, text: "x" }]} />);
    expect(screen.getByText("더한 값은 101점이지만, 인연 점수는 55점에서 99점 사이로 매겨요")).toBeTruthy();
  });
});

describe("ConstellationStats", () => {
  it("shows the constellation's average and best", () => {
    render(<ConstellationStats scores={[69, 80, 74]} />);
    expect(screen.getByText("평균").nextSibling?.textContent).toBe("74점");
    expect(screen.getByText("최고").nextSibling?.textContent).toBe("80점");
  });

  it("shows the average only, when asked (a public page shows no single friend's score)", () => {
    render(<ConstellationStats scores={[69, 80]} best={false} />);
    expect(screen.getByText("평균").nextSibling?.textContent).toBe("75점");
    expect(screen.queryByText("최고")).toBeNull();
  });

  it("shows nothing before the first star", () => {
    const { container } = render(<ConstellationStats scores={[]} />);
    expect(container.textContent).toBe("");
  });
});
