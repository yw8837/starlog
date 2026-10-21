// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { CHAPTERS_KEY } from "@/lib/storage/chapters";
import { LocalChapter } from "./LocalChapter";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/chapter/x" }));

/** PDF로 저장 on every finished reading: tarot, saju and the premium records, beside 공유하기 where there is one. */

/** 2026-10-20 16:30 UTC is already 10월 21일 in Korea. */
const AT = Date.UTC(2026, 9, 20, 16, 30);
const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });
const seed = (chapters: unknown[]) => localStorage.setItem(CHAPTERS_KEY, JSON.stringify({ v: 1, chapters }));

const TAROT = {
  id: "tarot001", createdAt: AT, chapterToken: "t", turns: [], followUpsLeft: 3, kind: "tarot", question: "이번 달 연락해도 될까?", conditions: [], note: "",
  cards: TAROT_SAMPLE.cards.map(({ position, cardId, orientation }) => ({ position, cardId, orientation })),
  reading: TAROT_SAMPLE.paid,
};
const SAJU = {
  id: "saju0001", createdAt: AT, chapterToken: "t", turns: [], followUpsLeft: 3, kind: "saju", birth: DEFAULT_SAJU_FORM, title: "한겨울에 뜬 해", summary: "요약",
  reading: { sections: [section("타고난 바탕")] },
};
const POS = ["지금의 나", "가로막는 것", "바탕", "지나온 것", "바라는 것", "다가올 것", "나의 태도", "주변", "바람과 걱정", "결과의 방향"];
const CARDS = POS.map((position, i) => ({ position, cardId: `cups-0${(i % 9) + 1}`, orientation: "upright" }));
const DEEP = {
  id: "deep0001", createdAt: AT, chapterToken: "t", turns: [], followUpsLeft: 5, kind: "tarot-deep", question: "이번 달 내 재물 흐름은 어떨까?", conditions: [], note: "", cards: CARDS,
  reading: {
    verdict: "천천히 가도 괜찮아요", positions: CARDS.map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
    crossing: section("지금과 가로막는 것"), axes: { heading: "두 갈래", vertical: section("세로"), horizontal: section("가로") },
    staff: section("기둥"), timing: section("시기"), action: section("오늘 해 볼 일"), observation: section("확인해 볼 신호"), followUps: [],
  },
};

let titleWhilePrinting = "";

beforeEach(() => {
  titleWhilePrinting = "";
  window.print = vi.fn(() => {
    titleWhilePrinting = document.title;
  }) as unknown as typeof window.print;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const savePdf = () => fireEvent.click(screen.getByRole("button", { name: "PDF로 저장" }));

describe("PDF로 저장 on a finished reading", () => {
  it("a tarot reading: beside 공유하기, printed as 스타로그-타로-<its day in Korea>", () => {
    seed([TAROT]);
    render(<LocalChapter id="tarot001" />);
    expect(screen.getByRole("button", { name: "공유하기" })).toBeTruthy();
    savePdf();
    expect(window.print).toHaveBeenCalledOnce();
    expect(titleWhilePrinting).toBe("스타로그-타로-2026-10-21");
    expect(screen.getByText("2026년 10월 21일")).toBeTruthy();
  });

  it("a 오픈 기념 무료 reading, which has no share, still keeps its PDF", () => {
    seed([{ ...TAROT, opening: true }]);
    render(<LocalChapter id="tarot001" />);
    expect(screen.queryByRole("button", { name: "공유하기" })).toBeNull();
    savePdf();
    expect(titleWhilePrinting).toBe("스타로그-타로-2026-10-21");
  });

  it("a saju reading: printed as 스타로그-사주-<day>", () => {
    seed([SAJU]);
    render(<LocalChapter id="saju0001" />);
    savePdf();
    expect(titleWhilePrinting).toBe("스타로그-사주-2026-10-21");
  });

  it("a premium reading: printed under its product's name", () => {
    seed([DEEP]);
    render(<LocalChapter id="deep0001" />);
    savePdf();
    expect(titleWhilePrinting).toBe("스타로그-켈틱크로스10장-2026-10-21");
  });
});
