// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
