// @vitest-environment jsdom
import { DEFAULT_REVERSAL_RATE, createDeck, getCard } from "@starlog/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import source from "@content/kb/decision.ko.json";
import { SITE, won } from "@/lib/config";
import { drawNow } from "@/lib/decision";
import { CRISIS_LEAD } from "@/lib/crisis";
import { NEW_TAROT_HREF } from "@/lib/freshStart";
import { GUIDE_MOVED_TO_HELP } from "@/lib/hostRoutes";
import { NOW_TYPES, nowFacts, nowType } from "@/lib/tarotType";
import { assertVoice } from "@/lib/voice/banned";
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

    // The button says where it goes (spec 6.2 N6, N7): the 3-card question builder, not a paid product's name. No price
    // here (it shows later, in the unlock sheet and at checkout).
    const upsell = screen.getByRole("link", { name: /카드 3장으로 보기/ });
    expect(upsell.getAttribute("href")).toBe(NEW_TAROT_HREF);
    expect(screen.getByText("이 고민, 카드 3장으로 더 볼래?")).toBeTruthy();
    expect(screen.queryByText(/타로 전체 풀이/)).toBeNull();
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

describe("타로로 판정 (spec 3.2, 6.2)", () => {
  const verdict = () => screen.queryByRole("region", { name: "타로로 판정" });

  it("names the turned card by rule, with 타로로's line, the facts and where the name comes from", () => {
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: "오늘 먼저 연락해도 될까?" } });
    const expected = pickSlot(6, "now-seed-first");
    const slug = nowType(expected.cardId, expected.orientation);
    const block = verdict()!;
    expect(block).toBeTruthy();
    const text = block.textContent ?? "";
    expect(text).toContain(NOW_TYPES[slug].name);
    expect(text).toContain(NOW_TYPES[slug].line);
    expect(text).toContain(nowFacts(slug));
    expect(text).toContain("카드 원소와 기울기로 정해지는 별명이에요");
    // 타로로 says it, as on the home's hook: the cat is the owner's picture (public/characters).
    expect(within(block).getByRole("img", { name: /타로로/ })).toBeTruthy();
    // It comes after the card and its why, before the way on.
    const why = screen.getByText(expected.why);
    expect(why.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(block.compareDocumentPosition(screen.getByRole("link", { name: /카드 3장으로 보기/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const line of [text, "이 고민, 카드 3장으로 더 볼래?", "카드 3장으로 보기"]) assertVoice(line);
  });

  it("names it for a worry kept in mind too (nothing typed)", () => {
    render(<NowOracle instant />);
    const expected = pickSlot(2, "now-seed-first");
    expect(verdict()?.textContent).toContain(NOW_TYPES[nowType(expected.cardId, expected.orientation)].name);
  });

  it("shows the facts only, no nickname, for a heavy worry (spec 2.5)", () => {
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: "수술 받아도 될까" } });
    const expected = pickSlot(6, "now-seed-first");
    const slug = nowType(expected.cardId, expected.orientation);
    expect(verdict()).toBeNull();
    expect(screen.queryByText(NOW_TYPES[slug].name)).toBeNull();
    expect(screen.queryByText(NOW_TYPES[slug].line)).toBeNull();
    expect(screen.getByText(nowFacts(slug, { polite: true }))).toBeTruthy();
    // 타로로's casual nudge (N6) belongs to the teasing step only (review 2026-11-11 #3): the plain button stays.
    expect(screen.queryByText("이 고민, 카드 3장으로 더 볼래?")).toBeNull();
    expect(screen.getByRole("link", { name: /카드 3장으로 보기/ })).toBeTruthy();
    // A heavy topic keeps the card's line and why: only the nickname goes (coordinator 2026-11-11). So does its share.
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(expected.answer);
    expect(screen.getByText(expected.why)).toBeTruthy();
    expect(screen.queryByText(CRISIS_LEAD)).toBeNull();
    expect(screen.getByRole("button", { name: "공유하기" })).toBeTruthy();
  });

  it("overstatement the wide near-crisis list reads loses the nickname only: the facts, the card's line and why stay (review 2026-11-11 #1)", () => {
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: "배고파 죽겠어 뭐 먹지" } });
    const expected = pickSlot(6, "now-seed-first");
    expect(verdict()).toBeNull();
    expect(screen.getByText(nowFacts(nowType(expected.cardId, expected.orientation), { polite: true }))).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(expected.answer);
    expect(screen.getByText(expected.why)).toBeTruthy();
    expect(screen.queryByText(CRISIS_LEAD)).toBeNull();
    expect(screen.queryByText("이 고민, 카드 3장으로 더 볼래?")).toBeNull();
  });

  it("shows the care line and the helplines in its place for crisis words: no nickname, no facts", () => {
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: "요즘 살고 싶지 않아요" } });
    const expected = pickSlot(6, "now-seed-first");
    const slug = nowType(expected.cardId, expected.orientation);
    expect(verdict()).toBeNull();
    expect(screen.queryByText(NOW_TYPES[slug].name)).toBeNull();
    expect(screen.queryByText(nowFacts(slug, { polite: true }))).toBeNull();
    expect(screen.getByText(CRISIS_LEAD)).toBeTruthy();
    expect(screen.getByRole("link", { name: /109/ }).getAttribute("href")).toBe("tel:109");
    // No casual nudge right after the care lines: the plain way on only.
    expect(screen.queryByText("이 고민, 카드 3장으로 더 볼래?")).toBeNull();
    expect(screen.getByRole("link", { name: /카드 3장으로 보기/ })).toBeTruthy();
    // A passive tier hides the card's line and why too (coordinator 2026-11-11).
    expect(screen.queryByText(expected.answer)).toBeNull();
    expect(screen.queryByText(expected.why)).toBeNull();
  });

  it.each([
    ["죽고 싶어", false],
    ["죽고 싶어. 유서도 써놨어", true],
    ["살기 싫다 진짜", false],
    ["더 버틸 자신이 없어", false],
    ["그냥 사라질까", false],
  ])("crisis words of any tier, or a plain wish to end it or vanish, get no card line or why: the plain card name and the care lines only (review 2026-11-11 #4, coordinator): %s", (question, urgent) => {
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: question } });
    const expected = pickSlot(6, "now-seed-first");
    const card = getCard(expected.cardId);
    const heading = screen.getByRole("heading", { level: 2 });
    // The card's name where its line would be, and focus there as for a line.
    expect(heading.textContent).toBe(`${card.names.ko}${expected.orientation === "reversed" ? " 역방향" : ""}`);
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByText(expected.answer)).toBeNull();
    expect(screen.queryByText(expected.why)).toBeNull();
    expect(verdict()).toBeNull();
    expect(screen.queryByText(nowFacts(nowType(expected.cardId, expected.orientation), { polite: true }))).toBeNull();
    expect(screen.getByText(CRISIS_LEAD)).toBeTruthy();
    expect(screen.getByRole("link", { name: /109/ }).getAttribute("href")).toBe("tel:109");
    expect(screen.queryAllByRole("link", { name: /119/ })).toHaveLength(urgent ? 1 : 0);
    expect(screen.queryByText("이 고민, 카드 3장으로 더 볼래?")).toBeNull();
    // No 공유하기 either: the link's page would show the very line hidden here (coordinator 2026-11-11).
    expect(screen.queryByRole("button", { name: "공유하기" })).toBeNull();
    expect(screen.getByRole("button", { name: "한 번 더 뽑기" })).toBeTruthy();
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
    // The how-to moved from the guide to the app's /help (AdSense audit 2026-10-27).
    expect(within(panel).getByRole("link", { name: /더 자세히: 지금의 한 장 사용법/ }).getAttribute("href")).toBe(GUIDE_MOVED_TO_HELP["/guide/now-card-how-to"]);
  });

  it("sends its guide link to the root domain when the hosts are split, and keeps the how-to on the app host's /help", () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    render(<NowOracle instant />);
    fireEvent.click(screen.getByRole("button", { name: "어떻게 답이 나오나요?" }));
    const panel = screen.getByRole("region", { name: "어떻게 답이 나오나요?" });
    expect(within(panel).getByRole("link", { name: "같은 질문으로 다시 뽑아도 될까요?" }).getAttribute("href")).toBe(`${SITE.guideUrl}/guide/redrawing-same-question`);
    expect(within(panel).getByRole("link", { name: /더 자세히: 지금의 한 장 사용법/ }).getAttribute("href")).toBe("/help#tarot-now-guide");
  });
});

describe("지금의 한 장 공유하기 (owner 2026-10-23)", () => {
  beforeEach(() => {
    const proto = (window.HTMLDialogElement ?? window.HTMLElement).prototype as HTMLElement & { showModal?: () => void; close?: () => void };
    proto.showModal ??= function (this: HTMLElement) {
      this.setAttribute("open", "");
    };
    proto.close ??= function (this: HTMLElement) {
      this.removeAttribute("open");
    };
  });

  it("shares the turned card's own link: the card, its side, which line and the design, never the worry typed; nothing to stop", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "abcdefghijkl", path: "/s/abcdefghijkl" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: "이직해도 될까?" } });
    const expected = pickSlot(6, "now-seed-first");
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    const sheet = screen.getByRole("dialog", { name: "결과 공유하기", hidden: true });
    expect(sheet.textContent).toContain("뽑은 카드와 카드가 건넨 한 문장, 그렇게 읽은 이유가 보여요");
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/share/now");
    // Math.random() is 0.5 here: the second of the three lines.
    // The nickname was shown, so the link carries it (spec 6.2 N8); still nothing typed.
    expect(JSON.parse(String(init.body))).toEqual({ cardId: expected.cardId, orientation: expected.orientation, pick: 1, deck: "starlog", nick: true });
    expect(String(init.body)).not.toContain("이직");
    expect(sheet.textContent).toContain("/s/abcdefghijkl");
    expect(within(sheet).queryByRole("button", { name: "공유 그만하기", hidden: true })).toBeNull();
    vi.unstubAllGlobals();
  });

  it("leaves the nickname out of the link when none was shown (spec 6.2 N9)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "abcdefghijkl", path: "/s/abcdefghijkl" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: "대출 갈아탈까" } });
    const expected = pickSlot(6, "now-seed-first");
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    const sheet = screen.getByRole("dialog", { name: "결과 공유하기", hidden: true });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ cardId: expected.cardId, orientation: expected.orientation, pick: 1, deck: "starlog" });
    vi.unstubAllGlobals();
  });
});
