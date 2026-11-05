// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { asMember } from "@/lib/testing/account";
import { kstMonthDay } from "@/lib/kst";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { clearChapters, listChapters, saveChapter, type NewChapter } from "@/lib/storage/chapters";
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

beforeEach(() => asMember());

afterEach(() => {
  cleanup();
  clearChapters();
  resetAccountForTests();
  vi.unstubAllGlobals();
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

describe("HomeCheckin without a session (owner 2026-11-05)", () => {
  it("shows nothing of a past reading to a visitor, and keeps the reading", async () => {
    saveChapter(MONEY, Date.now() - 5 * DAY);
    resetAccountForTests();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ payments: true, login: true, owner: false, user: null })));
    const { container } = render(<HomeCheckin />);
    await act(async () => {});
    expect(container.textContent).toBe("");
    expect(listChapters()).toHaveLength(1);
  });
});
