// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeckDraw, slotColumns } from "@/components/tarot/DeckDraw";
import { CrossSpread } from "./CrossSpread";
import { PairCharts } from "./PairCharts";
import { SpreadList } from "./SpreadList";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const POSITIONS = ["지금의 나", "가로막는 것", "바탕", "지나온 것", "바라는 것", "다가올 것", "나의 태도", "주변", "바람과 걱정", "결과의 방향"];
const IDS = ["cups-02", "cups-03", "cups-04", "cups-05", "cups-06", "cups-07", "cups-08", "cups-09", "cups-10", "major-17-star"];
const TEN = POSITIONS.map((position, i) => ({ position, cardId: IDS[i]!, orientation: i === 3 ? ("reversed" as const) : ("upright" as const) }));

describe("DeckDraw", () => {
  it("lays more than five slots in two rows (10 → 5+5, 7 → 4+3) and keeps one row up to five", () => {
    expect([1, 3, 5, 7, 10].map(slotColumns)).toEqual([1, 3, 5, 4, 5]);
  });

  it("deals ten picks through the server, hands the draw up, then says the cards are face up", async () => {
    const dealt = { cards: TEN, drawToken: "signed.deep.token" };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(dealt), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const onDealt = vi.fn();
    const onRevealed = vi.fn();
    render(
      <DeckDraw instant templateId="deep-tarot" heading="이번 달 내 재물 흐름은 어떨까?" step={{ step: 2, label: "카드 뽑기", backHref: "/tarot/new/situation", backLabel: "상황 고르기로" }} onDealt={onDealt} onRevealed={onRevealed} />,
    );
    expect(screen.getByRole("status").textContent).toBe("마음이 가는 카드를 10장 골라 주세요");
    const slots = screen.getByText("결과의 방향").closest("ol")!;
    expect(within(slots).getAllByRole("listitem")).toHaveLength(10);
    expect(slots.style.gridTemplateColumns).toBe("repeat(5, minmax(0, 1fr))");
    const fan = screen.getAllByRole("button").filter((b) => b.hasAttribute("data-fan-index"));
    for (const i of [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]) fireEvent.click(fan[i]!);
    expect(screen.getByRole("status").textContent).toBe("모두 골랐어요");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));
    });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ templateId: "deep-tarot" });
    expect(onDealt).toHaveBeenCalledWith({ templateId: "deep-tarot", drawToken: "signed.deep.token", cards: TEN });
    await waitFor(() => expect(onRevealed).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("img", { name: "결과의 방향 · 별 · 정방향" })).toBeTruthy();
  });
});

describe("CrossSpread", () => {
  it("lays out ten numbered cards with their positions, the second across the first", () => {
    render(<CrossSpread cards={TEN} />);
    const list = screen.getByRole("list", { name: "카드 10장 배치" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(10);
    expect(items[1]!.dataset.crossing).toBe("");
    expect(items[0]!.dataset.crossing).toBeUndefined();
    expect(screen.getByText("결과의 방향")).toBeTruthy();
    expect(screen.getByRole("img", { name: /^4번 지나온 것 · .+ \(역방향\)$/ })).toBeTruthy();
  });
});

describe("SpreadList", () => {
  it("lists each card with its number, position, name and orientation, keyword and an optional note", () => {
    render(<SpreadList title="카드 10장" cards={TEN.map((c, i) => ({ ...c, keyword: i === 0 ? "다시 만나는 마음" : undefined, note: i === 9 ? "끝에 놓인 별" : undefined }))} />);
    const items = within(screen.getByRole("list", { name: "카드 10장" })).getAllByRole("listitem");
    expect(items).toHaveLength(10);
    expect(items[0]!.textContent).toContain("1");
    expect(items[0]!.textContent).toContain("지금의 나");
    expect(items[0]!.textContent).toContain("다시 만나는 마음");
    expect(items[3]!.textContent).toContain("역방향");
    expect(items[9]!.textContent).toContain("끝에 놓인 별");
  });
});

describe("PairCharts", () => {
  const chart = (image: string) => ({
    pillars: [{ label: "태어난 해(년주)", gz: "庚午", ko: "경오" }, { label: "태어난 달(월주)", gz: "丙子", ko: "병자" }, { label: "태어난 날(일주)", gz: "丙寅", ko: "병인" }],
    elements: { 목: 1, 화: 3, 토: 0, 금: 1, 수: 1 },
    dayMaster: { display: "병화(丙火)", image },
  });

  it("shows both charts side by side, names the other person by the label, and never a birth date", () => {
    render(<PairCharts me={chart("하늘의 해")} partner={chart("큰 강과 바다")} partnerLabel="민지" />);
    expect(screen.getByRole("heading", { name: "나" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "민지" })).toBeTruthy();
    expect(screen.getByText("하늘의 해")).toBeTruthy();
    expect(screen.getByText("큰 강과 바다")).toBeTruthy();
    expect(screen.getAllByRole("list", { name: "오행 개수" })).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/\d{4}년|\d{1,2}월 \d{1,2}일/);
    // no duplicate ids from the two charts
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("calls the other person 그 사람 without a label", () => {
    render(<PairCharts me={chart("하늘의 해")} partner={chart("큰 강과 바다")} />);
    expect(screen.getByRole("heading", { name: "그 사람" })).toBeTruthy();
  });
});
