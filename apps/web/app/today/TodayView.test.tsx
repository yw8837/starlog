// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DECK_KEY } from "@/lib/deck";
import type { DailyData } from "@/lib/reading/types";
import { DAILY_KEY, saveDaily } from "@/lib/storage/daily";
import { TodayView, rearranged } from "./TodayView";

const REVISIT_NOTE = "오늘의 카드는 이미 골랐어요 · 내일 새 카드가 기다려요";

/** GET /api/tarot/daily before the pick: three face-down slots, nothing about their faces. */
const DEAL = { deal: [{ index: 0 }, { index: 1 }, { index: 2 }] };

/** The fortune the server hands out for the picked card, and again on every later visit that day. */
const READING: DailyData = {
  card: { cardId: "major-17-star", orientation: "upright", keyword: "희망" },
  summary: "작은 빛 하나를 따라가 보는 하루",
  body: "별 카드는 밤하늘 아래 물을 붓는 사람을 그려요. 서두르지 않아도 괜찮다는 이야기예요.",
  areas: { love: "먼저 안부를 건네 보세요", money: "작은 지출을 적어 봐요", work: "한 가지만 끝내 봐요" },
  lucky: { color: "하늘색", number: 7 },
  tip: "물 한 잔을 천천히 마셔 보세요",
  pick: 1,
};

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type FetchCall = [string, RequestInit | undefined];

/** The server as the page sees it: GET gives the deal (or the stored fortune), POST the picked card's fortune. */
function server({ get = DEAL, post = () => Promise.resolve(respond(READING)) }: { get?: unknown; post?: () => Promise<Response> } = {}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "POST" ? post() : respond(get)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const posts = (fetchMock: ReturnType<typeof server>) => (fetchMock.mock.calls as unknown as FetchCall[]).filter(([, init]) => init?.method === "POST");
const postedPick = (call: FetchCall) => (JSON.parse(String(call[1]?.body)) as { pick: number }).pick;

const cardButtons = () => screen.queryAllByRole("button", { name: /번째 카드 고르기/ });
/** The cards are named by where they lie on screen, left to right, whatever slot of the deal each stands for. */
const POSITIONS = ["1번째 카드 고르기", "2번째 카드 고르기", "3번째 카드 고르기"];
const reshuffleButton = () => screen.queryByRole("button", { name: "다시 섞기" });
const skipButton = () => screen.getByRole("button", { name: "바로 펼치기" });

function motion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({ matches: reduced && query.includes("reduce"), media: query })) as unknown as typeof window.matchMedia;
}

/** Opens the page to the three face-down cards: the deal arrives, the shuffle is skipped. */
async function toThreeCards() {
  render(<TodayView />);
  await screen.findByText("카드를 섞고 있어요");
  fireEvent.click(skipButton());
  expect(cardButtons()).toHaveLength(3);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.matchMedia = undefined as unknown as typeof window.matchMedia;
});

describe("오늘의 한 장 다시 섞기", () => {
  it("is offered only while the three face-down cards wait for a pick, after them in the tab order", async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (release = resolve))));
    render(<TodayView />);
    // Asking the server whether today's card was picked: nothing to shuffle yet.
    expect(reshuffleButton()).toBeNull();

    await act(async () => release(respond(DEAL)));
    // The first shuffle is playing: it is already shuffling.
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    expect(reshuffleButton()).toBeNull();

    fireEvent.click(skipButton());
    const button = reshuffleButton()!;
    expect(button).toBeTruthy();
    expect(cardButtons()).toHaveLength(3);
    expect(cardButtons().at(-1)!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("plays the shuffle again and lays three face-down cards out afresh, asking the server nothing and turning nothing over", async () => {
    const fetchMock = server();
    await toThreeCards();

    fireEvent.click(reshuffleButton()!);
    // The deck shuffles again: no cards on the table, and focus waits on 바로 펼치기.
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    expect(cardButtons()).toHaveLength(0);
    expect(reshuffleButton()).toBeNull();
    expect(document.activeElement).toBe(skipButton());

    fireEvent.click(skipButton());
    // Three face-down cards again, focus back on 다시 섞기, still nothing face up.
    expect(cardButtons().map((card) => card.getAttribute("aria-label"))).toEqual(POSITIONS);
    expect(document.activeElement).toBe(reshuffleButton());
    expect(document.querySelector('[data-face="up"]')).toBeNull();
    expect(screen.queryByText(READING.summary)).toBeNull();
    // Only the first GET (the deal's three slots) ever reached the server.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["with motion, one riffle like 지금의 한 장", false, 1200],
    ["under reduced motion, a short pulse", true, 800],
  ])("replays a quick shuffle (%s) before the cards are back", async (_name, reduced, ms) => {
    motion(reduced);
    server();
    await toThreeCards();
    vi.useFakeTimers();

    fireEvent.click(reshuffleButton()!);
    act(() => vi.advanceTimersByTime(ms - 100));
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    expect(cardButtons()).toHaveLength(0);
    act(() => vi.advanceTimersByTime(150));
    expect(cardButtons()).toHaveLength(3);
    expect(reshuffleButton()).toBeTruthy();
  });

  it("makes the card tapped in a slot a different one of the three, kept as the pick sent to the server", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fetchMock = server();
    await toThreeCards();
    fireEvent.click(reshuffleButton()!);
    fireEvent.click(skipButton());

    const moved = rearranged([0, 1, 2]);
    expect(moved[0]).not.toBe(0);
    await act(async () => cardButtons()[0]!.click());
    expect(posts(fetchMock)).toHaveLength(1);
    expect(postedPick(posts(fetchMock)[0]!)).toBe(moved[0]);
  });

  it("keeps the first layout until the first reshuffle: the first card is slot 0, the second slot 1", async () => {
    const fetchMock = server();
    await toThreeCards();
    await act(async () => cardButtons()[1]!.click());
    expect(postedPick(posts(fetchMock)[0]!)).toBe(1);
  });
});

describe("오늘의 한 장 다시 섞기 after the pick", () => {
  it("is gone once a card is picked: only that card stays, the fortune opens, and the server heard one pick", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = server({ post: () => new Promise<Response>((resolve) => (finish = resolve)) });
    await toThreeCards();

    fireEvent.click(cardButtons()[1]!);
    // Waiting for the fortune: the other two cards are never shown, and there is nothing to shuffle.
    expect(screen.getByRole("list", { name: "세 장의 카드" }).children).toHaveLength(1);
    expect(cardButtons()).toHaveLength(0);
    expect(reshuffleButton()).toBeNull();

    await act(async () => finish(respond(READING)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(READING.summary);
    expect(reshuffleButton()).toBeNull();
    expect(cardButtons()).toHaveLength(0);
    expect(posts(fetchMock)).toHaveLength(1);
    expect(postedPick(posts(fetchMock)[0]!)).toBe(1);
  });

  it("counts the seconds under the bar while the card is read, and the bar creeps meanwhile", async () => {
    server({ post: () => new Promise<Response>(() => {}) });
    await toThreeCards();
    vi.useFakeTimers();

    fireEvent.click(cardButtons()[0]!);
    expect(screen.getByText("보통 10초 안팎")).toBeTruthy();
    const fill = () => Number(/scaleX\(([\d.]+)\)/.exec(document.querySelector<HTMLElement>('[style*="scaleX"]')!.style.transform)![1]);
    const first = fill();
    act(() => vi.advanceTimersByTime(9_000));
    expect(screen.getByText("9초째 · 보통 10초 안팎")).toBeTruthy();
    expect(fill()).toBeGreaterThan(first);
    act(() => vi.advanceTimersByTime(7_000));
    expect(screen.getByText("16초째 · 조금 더 걸리고 있어요. 길게는 30초까지 걸려요")).toBeTruthy();
    expect(fill()).toBeLessThan(1);
  });

  it("stays gone when the pick failed: 다시 시도 sends the same pick again and there is no way to choose another card", async () => {
    let attempts = 0;
    const fetchMock = server({
      post: () => (attempts++ === 0 ? Promise.reject(new TypeError("offline")) : Promise.resolve(respond(READING))),
    });
    await toThreeCards();

    await act(async () => cardButtons()[2]!.click());
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(reshuffleButton()).toBeNull();
    expect(cardButtons()).toHaveLength(0);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "다시 시도" })));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(READING.summary);
    expect(posts(fetchMock).map(postedPick)).toEqual([2, 2]);
  });

  it("is not on a revisit the same day: the card kept on this device opens at once, no deal is asked for", () => {
    saveDaily(READING);
    const fetchMock = server();
    render(<TodayView />);
    expect(screen.getByText(REVISIT_NOTE)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(READING.summary);
    expect(reshuffleButton()).toBeNull();
    expect(cardButtons()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is not on a revisit from another browser either: the server hands back the stored card, never the deal", async () => {
    const fetchMock = server({ get: READING });
    render(<TodayView />);
    expect(await screen.findByText(REVISIT_NOTE)).toBeTruthy();
    expect(reshuffleButton()).toBeNull();
    expect(cardButtons()).toHaveLength(0);
    expect(posts(fetchMock)).toHaveLength(0);
  });
});

describe("rearranged", () => {
  const LAYOUTS = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const DICE = [0, 0.2, 0.4, 0.6, 0.8, 0.9999];

  it("is another layout of the same three slots from any layout, whatever the dice say", () => {
    const random = vi.spyOn(Math, "random");
    for (const from of LAYOUTS) {
      for (const dice of DICE) {
        random.mockReturnValue(dice);
        const next = rearranged(from);
        expect([...next].sort()).toEqual([0, 1, 2]);
        expect(next).not.toEqual(from);
      }
    }
  });

  it("can reach every one of the five other layouts", () => {
    const random = vi.spyOn(Math, "random");
    const reached = new Set(
      DICE.map((dice) => {
        random.mockReturnValue(dice);
        return rearranged([0, 1, 2]).join("");
      }),
    );
    expect(reached.size).toBe(5);
    expect(reached.has("012")).toBe(false);
  });
});

describe("오늘의 한 장 card design", () => {
  const faces = (cardId: string) =>
    [...document.querySelectorAll("img")].map((img) => img.getAttribute("src") ?? "").filter((src) => src.includes(cardId));

  it("shows today's fortune in the deck it was read with, after the device switched designs", () => {
    window.localStorage.setItem(DECK_KEY, JSON.stringify({ front: "starlog", back: "constellation" }));
    saveDaily({ ...READING, deck: "rws1909" } as DailyData);
    server();
    render(<TodayView />);
    expect(screen.getByText(READING.summary)).toBeTruthy();
    expect(faces("major-17-star").length).toBeGreaterThan(0);
    for (const src of faces("major-17-star")) expect(src).toBe("/cards/major-17-star-sm.webp");
  });

  it("keeps the deck the server sent with a fresh pick", async () => {
    window.localStorage.setItem(DECK_KEY, JSON.stringify({ front: "rws1909", back: "constellation" }));
    server({ post: () => Promise.resolve(respond({ ...READING, deck: "starlog" })) });
    await toThreeCards();
    await act(async () => cardButtons()[0]!.click());
    expect(await screen.findByText(READING.summary)).toBeTruthy();
    for (const src of faces("major-17-star")) expect(src).toBe("/cards/starlog/major-17-star-sm.webp");
    expect(JSON.parse(window.localStorage.getItem(DAILY_KEY) ?? "{}").reading.deck).toBe("starlog");
  });
});

describe("오늘의 한 장 in the server HTML (SEO-06)", () => {
  it("has the page's h1 before this device's saved card is known", () => {
    const html = renderToString(<TodayView />);
    expect(html).toMatch(/<h1[^>]*>오늘의 한 장<\/h1>/);
  });

  it("holds the first visit's screen in place, unseen, so the guide below does not jump when it appears (M-06)", () => {
    const doc = new DOMParser().parseFromString(renderToString(<TodayView />), "text/html");
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    const held = [...doc.querySelectorAll('[aria-hidden="true"]')].find((el) => el.textContent?.includes("오늘의 타로 카드를 골라 볼까요?"));
    expect(held?.textContent).toContain("오늘의 타로 카드를 골라 볼까요?");
    expect(held?.textContent).toContain("섞은 카드 세 장 가운데 마음이 가는 한 장을 골라 주세요");
    expect(held?.textContent).toContain("하루 한 번 · 고른 카드는 오늘 하루 그대로예요");
    // the same room the server's answer is awaited in (the shuffle's 220px)
    expect(held?.querySelector("div")).toBeTruthy();
    const file = ["apps/web/app/today/TodayView.module.css", "app/today/TodayView.module.css"].map((path) => resolve(process.cwd(), path)).find((path) => existsSync(path));
    expect(readFileSync(file ?? "", "utf8")).toMatch(/\.held \{[^}]*visibility: hidden;/);
  });
});
