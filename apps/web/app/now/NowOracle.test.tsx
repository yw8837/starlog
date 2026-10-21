// @vitest-environment jsdom
import { DEFAULT_REVERSAL_RATE, createDeck, getCard } from "@starlog/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import source from "@content/kb/decision.ko.json";
import { SITE, won } from "@/lib/config";
import { drawNow } from "@/lib/decision";
import { NEW_TAROT_HREF } from "@/lib/freshStart";
import { HOWTO_SEEN_KEY, NowOracle } from "./NowOracle";

/** The face-down cards on the table. */
const tableCards = () => screen.getAllByRole("button", { name: /^카드 \d+$/ });
const queryTableCards = () => screen.queryAllByRole("button", { name: /^카드 \d+$/ });
const howtoToggle = () => screen.getByRole("button", { name: "사용법 보기" });
const howtoSteps = () => within(screen.getByRole("region", { name: "지금의 한 장 사용법" })).queryAllByRole("listitem");

/** Runs the pick → reveal → turn timers (each is scheduled by the effect the previous one triggers). */
function settle() {
  for (let i = 0; i < 3; i++) act(() => vi.runAllTimers());
}

/** Picks the table card in `slot` and returns the draw the page should show for it. */
function pickSlot(slot: number, seed: string) {
  const card = tableCards()[slot]!;
  const deckIndex = Number(card.dataset.card);
  fireEvent.click(card);
  settle();
  // The default card design is the Starlog deck: its why points at the Starlog picture.
  return drawNow(createDeck(seed, DEFAULT_REVERSAL_RATE), deckIndex, 0.5, "starlog");
}

function reducedMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({ matches: on && query.includes("reduce"), media: query })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.useFakeTimers();
  // The deploy build sets NEXT_PUBLIC_SPLIT_HOSTS=1; these tests run on one origin unless a test says so.
  vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "");
  const seeds = ["now-seed-first", "now-seed-second", "now-seed-third"];
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => seeds.shift() as ReturnType<Crypto["randomUUID"]>);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  window.matchMedia = undefined as unknown as typeof window.matchMedia;
  window.localStorage.clear();
});

describe("지금의 한 장", () => {
  it("shows the name, an optional question and all 78 cards on the table for one pick", () => {
    render(<NowOracle instant />);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["지금의 한 장 무료 원카드 타로가 건네는 한 문장"]);
    expect(screen.getByText("무료 원카드 타로가 건네는 한 문장")).toBeTruthy();
    const input = screen.getByLabelText("고민 한 줄") as HTMLInputElement;
    expect(input.placeholder).toBe("예: 오늘 먼저 연락해도 될까?");
    expect(input.maxLength).toBe(40);
    expect(tableCards()).toHaveLength(78);
    expect(screen.getByRole("group", { name: "카드 78장 중 1장 고르기" })).toBeTruthy();
    // Nothing is revealed before a card is picked.
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("turns the picked card over to its line and why, with the upsell as the one primary", () => {
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: "오늘 먼저 연락해도 될까?" } });
    const expected = pickSlot(6, "now-seed-first");

    const answer = screen.getByRole("heading", { level: 2 });
    expect(answer.textContent).toBe(expected.answer);
    expect(document.activeElement).toBe(answer);

    const card = getCard(expected.cardId);
    const reversed = expected.orientation === "reversed";
    expect(screen.getByRole("img", { name: `${card.names.ko}${reversed ? " 역방향" : ""}` })).toBeTruthy();
    expect(screen.getByText(expected.why)).toBeTruthy();
    // 오늘 해 볼 일 belongs to 오늘의 한 장: here the answer is the card's reading only, no daily tip under it.
    expect(screen.queryByText("오늘 해 볼 일")).toBeNull();
    // The source KB still carries this entry's tip (the runtime copy no longer does); it is not shown.
    const { tip } = (source.cards as Record<string, Record<string, { tip: string }>>)[expected.cardId]![expected.orientation]!;
    expect(screen.queryByText(tip)).toBeNull();
    expect(screen.getByText("오늘 먼저 연락해도 될까?")).toBeTruthy();
    expect(screen.getByRole("region", { name: "지금의 한 장 결과" }).dataset.lean).toBe(expected.lean);

    const upsell = screen.getByRole("link", { name: /타로 전체 풀이 보기/ });
    expect(upsell.getAttribute("href")).toBe(NEW_TAROT_HREF);
    // The line only leads into the button: the name is not said twice and there is no price here (it
    // shows later, in the unlock sheet and at checkout).
    expect(screen.getByText("더 자세히 보고 싶다면")).toBeTruthy();
    expect(screen.getAllByText(/타로 전체 풀이/)).toHaveLength(1);
    expect(screen.queryByText(new RegExp(won(SITE.price.tarotStandardKrw)))).toBeNull();
    expect(screen.queryByText(/기본 타로 3장/)).toBeNull();
    expect(screen.getByRole("button", { name: "한 번 더 뽑기" })).toBeTruthy();
    // The table, the question field and the how-to are gone while the answer is shown.
    expect(queryTableCards()).toHaveLength(0);
    expect(screen.queryByLabelText("고민 한 줄")).toBeNull();
    expect(screen.queryByRole("region", { name: "지금의 한 장 사용법" })).toBeNull();
  });

  it("names the unwritten worry when no question was typed", () => {
    render(<NowOracle instant />);
    pickSlot(0, "now-seed-first");
    expect(screen.getByText("마음속 고민에 건네는 한 문장")).toBeTruthy();
    expect(screen.queryByText("내 고민")).toBeNull();
  });

  it("draws again from a new deck, keeping the question, with the how-to folded", () => {
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: "이직 준비를 시작할까?" } });
    pickSlot(3, "now-seed-first");

    fireEvent.click(screen.getByRole("button", { name: "한 번 더 뽑기" }));
    expect(howtoToggle().getAttribute("aria-expanded")).toBe("false");
    expect((screen.getByLabelText("고민 한 줄") as HTMLInputElement).value).toBe("이직 준비를 시작할까?");
    expect(tableCards()).toHaveLength(78);
    expect(tableCards().every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);

    const second = pickSlot(3, "now-seed-second");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(second.answer);
  });

  it("다시 섞기 shuffles the cards on the table again; the pick still reads this visit's deck", () => {
    render(<NowOracle instant />);
    fireEvent.click(screen.getByRole("button", { name: "다시 섞기" }));
    expect(tableCards()).toHaveLength(78);
    const expected = pickSlot(5, "now-seed-first");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(expected.answer);
  });
});

describe("지금의 한 장 shuffle", () => {
  it("shuffles for one riffle (1.2s), then spreads the table, and shuffles again for the next draw", () => {
    reducedMotion(false);
    render(<NowOracle />);
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1100));
    expect(queryTableCards()).toHaveLength(0);
    act(() => vi.advanceTimersByTime(150));
    expect(tableCards()).toHaveLength(78);

    fireEvent.click(tableCards()[2]!);
    // The picked card stays on the table, raised, until the page turns it.
    expect(screen.getByRole("button", { name: "1번째로 고른 카드" })).toBeTruthy();
    // The raised card is held, then turns (each pause is scheduled once the one before has run).
    act(() => vi.advanceTimersByTime(500));
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole("button", { name: "한 번 더 뽑기" }));
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    // The new shuffle was asked for, so focus waits on 바로 펼치기.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "바로 펼치기" }));
    act(() => vi.advanceTimersByTime(1250));
    expect(tableCards()).toHaveLength(78);
    // Once the table is out, focus moves from the shuffle's 바로 펼치기 to 다시 섞기.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "다시 섞기" }));
  });

  it("under reduced motion the deck only pulses for 0.8s", () => {
    reducedMotion(true);
    render(<NowOracle />);
    act(() => vi.advanceTimersByTime(850));
    expect(tableCards()).toHaveLength(78);
  });
});

describe("지금의 한 장 how-to", () => {
  it("opens the three steps on a first visit; 알겠어요 folds them and remembers it", () => {
    render(<NowOracle instant />);
    expect(howtoToggle().getAttribute("aria-expanded")).toBe("true");
    expect(howtoSteps().map((step) => step.textContent)).toEqual([
      "고민을 한 줄 적어요 (마음속으로 떠올리기만 해도 돼요)",
      "펼쳐진 카드 중 끌리는 한 장을 골라요",
      "카드가 고민에 건네는 한 문장과 그렇게 읽은 이유가 나와요",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "알겠어요" }));
    expect(howtoToggle().getAttribute("aria-expanded")).toBe("false");
    expect(howtoSteps()).toHaveLength(0);
    expect(document.activeElement).toBe(howtoToggle());
    expect(window.localStorage.getItem(HOWTO_SEEN_KEY)).toBe("seen");
  });

  it("stays folded behind 사용법 보기 on a later visit, and the toggle opens it", () => {
    window.localStorage.setItem(HOWTO_SEEN_KEY, "seen");
    render(<NowOracle instant />);
    expect(howtoToggle().getAttribute("aria-expanded")).toBe("false");
    expect(howtoSteps()).toHaveLength(0);

    fireEvent.click(howtoToggle());
    expect(howtoToggle().getAttribute("aria-expanded")).toBe("true");
    expect(howtoSteps()).toHaveLength(3);
  });

  it("counts a first answer as having seen the steps", () => {
    render(<NowOracle instant />);
    pickSlot(1, "now-seed-first");
    expect(window.localStorage.getItem(HOWTO_SEEN_KEY)).toBe("seen");
  });

  it("explains how answers are made, folded until asked, without naming any model", () => {
    render(<NowOracle instant />);
    const toggle = screen.getByRole("button", { name: "어떻게 답이 나오나요?" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "어떻게 답이 나오나요?" })).toBeNull();

    fireEvent.click(toggle);
    const panel = screen.getByRole("region", { name: "어떻게 답이 나오나요?" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const text = panel.textContent ?? "";
    expect(text).toContain("78장의 카드가 정방향과 역방향마다");
    expect(text).toContain("카드 지식으로 미리 준비한 답");
    expect(text).toContain("가 보기, 조금 더 지켜보기, 다른 길도 살펴보기");
    expect(text).toContain("횟수 제한 없이 무료");
    expect(text).toContain("전문가");
    expect(text).not.toMatch(/AI|인공지능|모델/);
    expect(within(panel).getByRole("link", { name: "같은 질문으로 다시 뽑아도 될까요?" }).getAttribute("href")).toBe("/guide/redrawing-same-question");
    expect(within(panel).getByRole("link", { name: /더 자세히: 지금의 한 장 사용법/ }).getAttribute("href")).toBe("/guide/now-card-how-to");
  });

  it("sends its two guide links to the root domain when the hosts are split: the guide lives there, not on the app host", () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    render(<NowOracle instant />);
    fireEvent.click(screen.getByRole("button", { name: "어떻게 답이 나오나요?" }));
    const panel = screen.getByRole("region", { name: "어떻게 답이 나오나요?" });
    expect(within(panel).getByRole("link", { name: "같은 질문으로 다시 뽑아도 될까요?" }).getAttribute("href")).toBe(`${SITE.guideUrl}/guide/redrawing-same-question`);
    expect(within(panel).getByRole("link", { name: /더 자세히: 지금의 한 장 사용법/ }).getAttribute("href")).toBe(`${SITE.guideUrl}/guide/now-card-how-to`);
  });
});
