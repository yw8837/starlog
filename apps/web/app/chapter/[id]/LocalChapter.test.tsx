// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GAEUN_NOTE } from "@/lib/sajuEnrichment";
import { SAJU_GAEUN_HEADING, SAJU_NAMES_HEADING } from "@/lib/sajuPrologue";
import { resetAccountForTests } from "@/lib/account/client";
import { DECK_KEY } from "@/lib/deck";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { CHAPTERS_KEY } from "@/lib/storage/chapters";
import { LocalChapter } from "./LocalChapter";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace }), usePathname: () => "/chapter/x" }));

const PARTIAL = {
  id: "abcdef12",
  createdAt: Date.now(),
  chapterToken: "x",
  turns: [],
  followUpsLeft: 3,
  kind: "tarot",
  question: "q",
  conditions: [],
  note: "",
  cards: [{ position: "p", cardId: "major-09-hermit", orientation: "upright" }],
  // QA Q-02: no connection, timing, scenarios… (the page used to crash on "heading").
  reading: { verdict: "v", cards: [], action: { heading: "오늘 해 볼 일", body: "b" } },
};

const seed = (chapters: unknown[]) => localStorage.setItem(CHAPTERS_KEY, JSON.stringify({ v: 1, chapters }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  replace.mockReset();
});

describe("LocalChapter with a partial saved reading (QA Q-02)", () => {
  it("offers no share for it: a share without the reading's own link would only send the site's home (owner 2026-10-14)", () => {
    seed([PARTIAL]);
    render(<LocalChapter id="abcdef12" />);
    expect(screen.queryByRole("button", { name: /공유하기|카카오톡으로 보내기/ })).toBeNull();
  });

  it("shows what it can read, says the rest is missing, takes no questions, and can erase it after a confirm", () => {
    seed([PARTIAL]);
    render(<LocalChapter id="abcdef12" />);
    expect(screen.getByRole("heading", { level: 1, name: "q" })).toBeTruthy();
    expect(screen.getByText("v")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /오늘 해 볼 일/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "이 기록의 일부를 읽지 못했어요" })).toBeTruthy();
    expect(screen.getByText("이 기록은 일부를 읽지 못해 더 물어볼 수 없어요")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "이어서 물어볼 내용" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "이 기록 지우기" }));
    expect(localStorage.getItem(CHAPTERS_KEY)).toContain("abcdef12");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    });
    expect(localStorage.getItem(CHAPTERS_KEY)).not.toContain("abcdef12");
    expect(replace).toHaveBeenCalledWith("/story");
  });

  it("offers to erase an entry it cannot read at all", () => {
    seed([{ id: "abcdef12", kind: "tarot" }]);
    render(<LocalChapter id="abcdef12" />);
    expect(screen.getByRole("heading", { level: 1, name: "이 기록을 읽지 못했어요" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이 기록 지우기" })).toBeTruthy();
  });
});

const SAJU_CHAPTER = {
  id: "abcdef31",
  createdAt: Date.parse("2026-10-07T03:00:00.000Z"),
  chapterToken: "x",
  turns: [],
  followUpsLeft: 3,
  kind: "saju",
  birth: { calendar: "solar", year: 1990, month: 1, day: 1, isLeapMonth: false, timeKnown: false, hour: null, minute: null, gender: "female", placeId: "seoul" },
  title: "한겨울에 뜬 해",
  summary: "요약",
};
const GLANCE = {
  goesWell: "불(火) 기운이 3개로 가장 많아, 드러내고 알리는 일에서 잘 풀리는 편이에요.",
  watchOut: "쇠(金) 기운이 겉에 없어, 정리하고 마무리하는 일은 뒤로 밀리기 쉬운 편이에요.",
  remedy: "하루를 마칠 때 끝낸 일 하나를 골라 깔끔히 닫아 두세요.",
  thisYear: "올해 병오(丙午)년에는 나와 어깨를 나란히 하는 힘(비견)이 실려, 사람과 어울리며 함께하는 일에 힘이 붙는 해로 읽어요.",
  thisYearAction: "함께할 사람과 맡을 몫부터 나눠 정해 보세요.",
};
const SECTIONS = [{ heading: "타고난 바탕 · 태어난 계절이 나에게 주는 힘", body: "첫 절 본문" }];

describe("LocalChapter for a saju reading with 한눈에 보기 (owner 2026-10-07)", () => {
  it("shows the card first in the reading, with its four plain labels and every sentence", () => {
    seed([{ ...SAJU_CHAPTER, reading: { sections: SECTIONS, observation: { heading: "앞으로 몇 주 · 확인해 볼 신호", body: "신호" }, glance: GLANCE, followUps: [] } }]);
    render(<LocalChapter id="abcdef31" />);
    const card = screen.getByRole("region", { name: "한눈에 보기" });
    const reading = document.getElementById("chapter-reading")!;
    expect(reading.firstElementChild).toBe(card);
    for (const label of ["잘 풀리는 쪽", "조심할 쪽", "이렇게 보완", "올해 흐름"]) expect(within(card).getByText(label)).toBeTruthy();
    for (const sentence of Object.values(GLANCE)) expect(within(card).getByText(sentence)).toBeTruthy();
    // the year's one thing to do is named for a screen reader too, without showing a fifth label (review 2026-10-08)
    const actionLabel = within(card).getByText("올해 해 볼 일");
    expect(actionLabel.className).toBe("sr-only");
    expect(actionLabel.closest("dd")?.textContent).toContain(GLANCE.thisYearAction);
    // the card comes before the first section
    expect(card.compareDocumentPosition(screen.getByText("첫 절 본문")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "이 기록의 일부를 읽지 못했어요" })).toBeNull();
  });

  it("shows a section's **구** in bold, escapes the rest, and drops marks that do not pair up (reading-voice-2026-10 §2.2)", () => {
    const sections = [
      { heading: "타고난 바탕 · 태어난 계절이 나에게 주는 힘", body: "쉬는 날에도 **손을 놓지 못하기** 쉬워요. <b>그대로</b>" },
      { heading: "많은 기운·적은 기운 · 다섯 기운이 놓인 모양과 숨은 기운", body: "**짝이 맞지 않는 표시예요." },
    ];
    seed([{ ...SAJU_CHAPTER, reading: { sections, observation: { heading: "앞으로 몇 주 · 확인해 볼 신호", body: "신호" }, glance: GLANCE, followUps: [] } }]);
    render(<LocalChapter id="abcdef31" />);
    expect(screen.getByText("손을 놓지 못하기").tagName).toBe("STRONG");
    expect(screen.getByText("손을 놓지 못하기").parentElement?.textContent).toBe("쉬는 날에도 손을 놓지 못하기 쉬워요. <b>그대로</b>");
    expect(screen.getByText("짝이 맞지 않는 표시예요.").tagName).toBe("P");
    expect(document.getElementById("chapter-reading")!.textContent).not.toContain("**");
  });

  it("opens a reading saved before the card as it was, without a card", () => {
    seed([{ ...SAJU_CHAPTER, reading: { sections: SECTIONS, observation: { heading: "앞으로 몇 주 · 확인해 볼 신호", body: "신호" }, followUps: [] } }]);
    render(<LocalChapter id="abcdef31" />);
    expect(screen.getByText("첫 절 본문")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "한눈에 보기" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "이 기록의 일부를 읽지 못했어요" })).toBeNull();
  });

  it("leaves out only a card it cannot read: the rest of the reading stays whole and takes questions (review 2026-10-08)", () => {
    seed([{ ...SAJU_CHAPTER, createdAt: Date.now(), reading: { sections: SECTIONS, glance: { goesWell: 3 }, followUps: [] } }]);
    render(<LocalChapter id="abcdef31" />);
    expect(screen.getByText("첫 절 본문")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "한눈에 보기" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "이 기록의 일부를 읽지 못했어요" })).toBeNull();
    expect(screen.queryByText("이 기록은 일부를 읽지 못해 더 물어볼 수 없어요")).toBeNull();
    expect(screen.getByRole("textbox", { name: "이어서 물어볼 내용" })).toBeTruthy();
  });

  it("still says the record is partial when a part other than the card cannot be read", () => {
    seed([{ ...SAJU_CHAPTER, createdAt: Date.now(), reading: { sections: SECTIONS, observation: { heading: "앞으로 몇 주 · 확인해 볼 신호" }, glance: GLANCE, followUps: [] } }]);
    render(<LocalChapter id="abcdef31" />);
    expect(screen.getByRole("heading", { name: "이 기록의 일부를 읽지 못했어요" })).toBeTruthy();
  });

  it("shows 이름표 풀이 and 기운 채우기 like the other sections, the fixed 개운 note under 기운 채우기 only (saju enrichment 2026-10-08)", () => {
    const sections = [
      { heading: SAJU_NAMES_HEADING, body: "사주로 보면 **배운 것을 쌓아 가는** 경향이 있어요." },
      { heading: SAJU_GAEUN_HEADING, body: "미루고 싶은 날에는 **낮 햇볕 10분**부터 가볍게 해 보세요." },
      { heading: "계산 기준 · 보지 않은 것과 달라질 수 있는 것", body: "계산 기준 본문" },
    ];
    seed([{ ...SAJU_CHAPTER, reading: { sections, observation: { heading: "앞으로 몇 주 · 확인해 볼 신호", body: "신호" }, glance: GLANCE, followUps: [] } }]);
    render(<LocalChapter id="abcdef31" />);
    expect(screen.getByRole("heading", { name: /^이름표 풀이/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^기운 채우기/ })).toBeTruthy();
    expect(screen.getByText("배운 것을 쌓아 가는").tagName).toBe("STRONG");
    expect(screen.getByText("낮 햇볕 10분").tagName).toBe("STRONG");
    expect(screen.getAllByText(GAEUN_NOTE)).toHaveLength(1);
    expect(screen.getByText(GAEUN_NOTE).closest("article")?.textContent).toContain("낮 햇볕 10분");
  });
});

describe("LocalChapter for a topic reading (saju-topics spec §5.3)", () => {
  it("names the topic in the eyebrow and keeps the teaser title", () => {
    seed([
      {
        id: "abcdef21",
        createdAt: Date.parse("2026-10-02T03:00:00.000Z"),
        chapterToken: "x",
        turns: [],
        followUpsLeft: 3,
        kind: "saju",
        birth: { calendar: "solar", year: 1992, month: 8, day: 3, isLeapMonth: false, timeKnown: false, hour: null, minute: null, gender: "male", placeId: "seoul" },
        title: "흙 속의 쇠",
        summary: "요약",
        topic: "money",
        reading: { sections: [{ heading: "나의 기본 결 · 한눈에 보기", body: "본문" }] },
      },
    ]);
    render(<LocalChapter id="abcdef21" />);
    expect(screen.getByText("사주 재물운 · 10월 2일")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "흙 속의 쇠" })).toBeTruthy();
  });
});

/** The front image of `cardId` in `container`, as each TarotCard renders it. */
const faceSources = (container: HTMLElement, cardId: string) =>
  [...container.querySelectorAll("img")].map((img) => img.getAttribute("src") ?? "").filter((src) => src.includes(cardId));

describe("LocalChapter card design", () => {
  it("shows a reading saved without its deck in the 1909 scans it was written for, whatever this device chose", () => {
    localStorage.setItem(DECK_KEY, JSON.stringify({ front: "starlog", back: "constellation" }));
    seed([PARTIAL]);
    const { container } = render(<LocalChapter id="abcdef12" />);
    const faces = faceSources(container, "major-09-hermit");
    expect(faces.length).toBeGreaterThan(0);
    for (const src of faces) expect(src).toBe("/cards/major-09-hermit-sm.webp");
  });

  it("keeps the deck a reading recorded", () => {
    localStorage.setItem(DECK_KEY, JSON.stringify({ front: "rws1909", back: "constellation" }));
    seed([{ ...PARTIAL, deck: "starlog" }]);
    const { container } = render(<LocalChapter id="abcdef12" />);
    const faces = faceSources(container, "major-09-hermit");
    expect(faces.length).toBeGreaterThan(0);
    for (const src of faces) expect(src).toBe("/cards/starlog/major-09-hermit-sm.webp");
  });
});

/** A reading saved in the account (20-character id), as GET /api/readings lists it. */
const SERVER_ID = "abcdefghij0123456789";
const { id: _localId, ...ACCOUNT_CHAPTER } = { ...PARTIAL, question: "계정에 있는 질문" };

function accountServer(user: object | null, readings: unknown[] = []) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/me") return Response.json({ payments: true, login: true, owner: false, user });
    if (url.startsWith("/api/readings")) return Response.json({ readings, next: null });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const LOGGED_IN = { nickname: "별", gift: null, unused: [], opening: [] };

describe("LocalChapter for a reading not on this device (QA-02)", () => {
  // Earlier renders may have read the account already (no fetch stub: logged out).
  beforeEach(resetAccountForTests);
  afterEach(() => {
    vi.unstubAllGlobals();
    resetAccountForTests();
  });

  it("logged in: finds a reading opened on another device in the account and shows it", async () => {
    accountServer(LOGGED_IN, [{ id: SERVER_ID, createdAt: Date.now(), chapter: ACCOUNT_CHAPTER }]);
    render(<LocalChapter id={SERVER_ID} />);
    expect(await screen.findByRole("heading", { level: 1, name: "계정에 있는 질문" })).toBeTruthy();
    expect(screen.queryByText(/연 기기에만 보관돼요\. 지웠거나/)).toBeNull();
  });

  it("on the device that opened it, the account id opens the same reading", () => {
    accountServer(LOGGED_IN);
    seed([{ ...PARTIAL, serverId: SERVER_ID }]);
    render(<LocalChapter id={SERVER_ID} />);
    expect(screen.getByRole("heading", { level: 1, name: "q" })).toBeTruthy();
  });

  it("logged in, found nowhere: points to 내 기록, never says every reading stays on the device that opened it", async () => {
    const fetchMock = accountServer(LOGGED_IN);
    render(<LocalChapter id="zzzzzz99" />);
    expect(await screen.findByRole("heading", { level: 1, name: "이 주소의 기록을 찾지 못했어요" })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/readings"))).toBe(true);
    expect(screen.getByText("결제나 가입 선물로 연 풀이는 내 기록에 모두 있어요. 그 밖의 풀이는 연 기기에만 보관돼요.")).toBeTruthy();
    const missing = screen.getByRole("region", { name: "이 주소의 기록을 찾지 못했어요" });
    expect(within(missing).getByRole("link", { name: "내 기록으로" }).getAttribute("href")).toBe("/story");
  });

  it("logged out: says which readings come back with a login and which stay on the device that opened them", async () => {
    const fetchMock = accountServer(null);
    render(<LocalChapter id="zzzzzz99" />);
    expect(await screen.findByRole("heading", { level: 1, name: "이 기기에 없는 기록이에요" })).toBeTruthy();
    expect(screen.getByText("결제나 가입 선물로 연 풀이는 로그인하면 내 기록에서 볼 수 있어요. 그 밖의 풀이는 연 기기에만 보관돼요.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/readings"))).toBe(false);
  });
});

describe("LocalChapter 풀이 후기", () => {
  beforeEach(resetAccountForTests);
  afterEach(() => {
    vi.unstubAllGlobals();
    resetAccountForTests();
  });

  it("tells a visitor who is not logged in that logging in lets them review, on a reading kept in an account", async () => {
    accountServer(null);
    seed([{ ...PARTIAL, serverId: "abcdefghij0123456789" }]);
    render(<LocalChapter id="abcdef12" />);
    expect(await screen.findByText("로그인하면 후기를 남길 수 있어요")).toBeTruthy();
  });

  it("offers no account review on a reading kept only on this device: no account holds it, so logging in could not review it", async () => {
    accountServer(null);
    seed([PARTIAL]);
    render(<LocalChapter id="abcdef12" />);
    await act(async () => {});
    expect(screen.queryByText("로그인하면 후기를 남길 수 있어요")).toBeNull();
    expect(document.getElementById("review-title")).toBeNull();
  });
});

describe("LocalChapter 결과 공유", () => {
  beforeAll(() => {
    // jsdom has no <dialog> methods; Modal calls showModal()/close().
    const proto = (window.HTMLDialogElement ?? window.HTMLElement).prototype as HTMLElement & { showModal?: () => void; close?: () => void };
    proto.showModal ??= function (this: HTMLElement) {
      this.setAttribute("open", "");
    };
    proto.close ??= function (this: HTMLElement) {
      this.removeAttribute("open");
    };
  });

  it("offers 공유 그만하기 on reopening when this device already made the reading's link", () => {
    seed([{ ...PARTIAL, createdAt: Date.now(), cards: TAROT_SAMPLE.cards.map(({ position, cardId, orientation }) => ({ position, cardId, orientation })), reading: TAROT_SAMPLE.paid }]);
    localStorage.setItem("starlog.shares", JSON.stringify({ abcdef12: "abcdefghijkl" }));
    render(<LocalChapter id="abcdef12" />);
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    expect(screen.getByRole("button", { name: "공유 그만하기" })).toBeTruthy();
  });
});
