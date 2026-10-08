// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAPTERS_KEY } from "@/lib/storage/chapters";
import { LocalChapter } from "./LocalChapter";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace }) }));

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
