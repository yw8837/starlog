// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { kstMonthDay } from "@/lib/kst";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { clearChapters, saveChapter, type NewChapter } from "@/lib/storage/chapters";
import { HomeCheckin } from "./HomeCheckin";

const DAY = 86_400_000;
const MONEY = {
  kind: "saju",
  birth: DEFAULT_SAJU_FORM,
  title: "흙 속의 쇠",
  summary: "요약",
  topic: "money",
  reading: {
    sections: [{ heading: "나의 기본 결 · 한눈에 보기", body: "본문" }],
    observation: { heading: "앞으로 몇 주 · 확인해 볼 신호", body: "카드 명세서를 한 번 열어 보세요" },
    followUps: [],
  },
  chapterToken: "t",
} as NewChapter;

afterEach(() => {
  cleanup();
  clearChapters();
});

describe("HomeCheckin (saju-topics spec §5.3)", () => {
  it("names a topic reading's source '<날짜> 사주 · 재물운'", () => {
    const at = Date.now() - 4 * DAY;
    saveChapter(MONEY, at);
    render(<HomeCheckin />);
    // The text a person reads (the accessible name drops the space the source's span starts with).
    expect(screen.getByRole("heading").textContent).toBe(`지난 풀이 돌아보기 · ${kstMonthDay(at)} 사주 · 재물운`);
  });
});
