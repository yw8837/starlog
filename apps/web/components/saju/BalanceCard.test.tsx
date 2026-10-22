// @vitest-environment jsdom
import { computeChart } from "@starlog/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { BalanceCard } from "./BalanceCard";

afterEach(cleanup);

const chartOf = (patch: Partial<SajuForm>) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch }));
const DOBI = chartOf({ year: 1988, month: 8, day: 15, timeKnown: true, hour: 10, minute: 22 }); // 시주부터 甲辰 壬寅 庚申 戊辰: 壬 day master
const SAMPLE = chartOf({}); // 1990-01-01, time unknown: 丙 day master

const card = () => screen.getByRole("region", { name: "오행과 나의 힘" });
const rows = (table: HTMLElement) => within(table).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((c) => c.textContent));

describe("오행과 나의 힘", () => {
  it("names the day master the groups are read from, and never a 격국 or 신강·신약 label (the engine computes neither)", () => {
    render(<BalanceCard chart={DOBI} />);
    expect(within(card()).getByText("일간 壬 · 물")).toBeTruthy();
    expect(card().textContent).not.toMatch(/신강|신약|격국|용신|(?:정관|편관|정재|편재|정인|편인|식신|상관|건록|양인|종)격/);
  });

  it("the radar: an image whose name carries every element, its group and its count, and a table with the same numbers", () => {
    render(<BalanceCard chart={DOBI} />);
    const radar = within(card()).getByRole("img", { name: /오행 글자 수/ });
    expect(radar.tagName.toLowerCase()).toBe("svg");
    expect(radar.getAttribute("aria-label")).toBe("오행 글자 수, 보이는 8글자: 나무(식상) 2, 불(재성) 0, 흙(관성) 3, 쇠(인성) 2, 물(비겁) 1");
    const table = within(card()).getByRole("table", { name: "오행 글자 수" });
    expect(table.closest(".sr-only")).not.toBeNull();
    expect(rows(table)).toEqual([
      ["나무(목)", "식상", "2"],
      ["불(화)", "재성", "0"],
      ["흙(토)", "관성", "3"],
      ["쇠(금)", "인성", "2"],
      ["물(수)", "비겁", "1"],
    ]);
    // the labels on the chart: the element in plain words with its count, the group under it
    for (const label of ["나무 2", "식상", "불 0", "재성", "흙 3", "관성", "쇠 2", "인성", "물 1", "비겁"]) expect(radar.textContent).toContain(label);
  });

  it("the donut: an image naming each group's share, a table with counts and shares, and the basis in the middle", () => {
    render(<BalanceCard chart={DOBI} />);
    const donut = within(card()).getByRole("img", { name: /십성 비율/ });
    expect(donut.getAttribute("aria-label")).toBe("십성 비율, 일간을 뺀 7글자: 비겁(물) 0%, 식상(나무) 29%, 재성(불) 0%, 관성(흙) 43%, 인성(쇠) 28%");
    expect(donut.textContent).toContain("7글자");
    const table = within(card()).getByRole("table", { name: "십성 비율" });
    expect(table.closest(".sr-only")).not.toBeNull();
    expect(rows(table)).toEqual([
      ["비겁", "물(수)", "0", "0%"],
      ["식상", "나무(목)", "2", "29%"],
      ["재성", "불(화)", "0", "0%"],
      ["관성", "흙(토)", "3", "43%"],
      ["인성", "쇠(금)", "2", "28%"],
    ]);
    // one arc per group that has a glyph
    expect(donut.querySelectorAll("[data-arc]")).toHaveLength(3);
  });

  it("time unknown: 6 visible glyphs on the radar, 5 places in the donut", () => {
    render(<BalanceCard chart={SAMPLE} />);
    expect(within(card()).getByRole("img", { name: /오행 글자 수/ }).getAttribute("aria-label")).toMatch(/^오행 글자 수, 보이는 6글자: /);
    expect(within(card()).getByRole("img", { name: /십성 비율/ }).getAttribute("aria-label")).toMatch(/^십성 비율, 일간을 뺀 5글자: /);
    expect(within(card()).getByText("일간 丙 · 불")).toBeTruthy();
  });

  it("비율 자세히 보기: closed at first; opened, the basis, each group in plain words with its places, and no verdict", () => {
    render(<BalanceCard chart={DOBI} />);
    const details = card().querySelector("details")!;
    expect(details.open).toBe(false);
    expect(within(details).getByText("비율 자세히 보기")).toBeTruthy();
    fireEvent.click(within(details).getByText("비율 자세히 보기"));
    const text = details.textContent!;
    expect(text).toContain("오행 글자 수는 보이는 8글자를 나(일간)까지 넣어 셌고, 십성 비율은 나를 뺀 7글자를 한 글자씩 같은 무게로 셌어요.");
    expect(text).toContain("글자 속에 숨은 기운(지장간)은 숫자에 넣지 않았어요.");
    expect(text).toContain("돈과 살림처럼 내가 다루는 것(재성)");
    expect(text).toContain("연간 戊 편관 · 연지 辰 편관 · 시지 辰 편관");
    expect(text).toContain("겉 글자에는 없고, 글자 속(지장간)에 숨어 있어요.");
    expect(text).toContain("많고 적음은 좋고 나쁨이 아니라 기운이 어느 쪽으로 기울었는지를 보여 줘요.");
    expect(text).not.toMatch(/점수|등급|좋은 사주|나쁜 사주|운명/);
  });

  it("keeps the 개운 line the 오행 bars had", () => {
    render(<BalanceCard chart={DOBI} note="곁에 두면 좋은 것: 빨강 포인트 · 낮 햇볕 10분" />);
    expect(within(card()).getByText("곁에 두면 좋은 것: 빨강 포인트 · 낮 햇볕 10분")).toBeTruthy();
  });
});
