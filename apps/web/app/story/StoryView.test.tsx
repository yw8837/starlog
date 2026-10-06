// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { clearChapters, saveChapter, type NewChapter } from "@/lib/storage/chapters";
import { StoryView } from "./StoryView";

const OLD: NewChapter = {
  kind: "saju",
  birth: DEFAULT_SAJU_FORM,
  title: "한겨울에 뜬 해",
  summary: "한겨울에 태어난 병화 일간이에요.",
  reading: { sections: [{ heading: "월령과 뿌리", body: "…" }], followUps: [] },
  chapterToken: "saju.token",
};
const MONEY = {
  ...OLD,
  birth: { ...DEFAULT_SAJU_FORM, year: 1992, month: 8, day: 3, gender: "male" },
  title: "흙 속의 쇠",
  summary: "흙 속에 쇠가 묻힌 명식이에요.",
  topic: "money",
} as NewChapter;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ payments: false, login: false, owner: false, user: null })));
});

afterEach(() => {
  cleanup();
  clearChapters();
  resetAccountForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("내 기록 titles (saju-topics spec §5.3)", () => {
  it("titles saju records '<운> · <생일>' and keeps the teaser summary under them", () => {
    saveChapter(OLD, Date.now() - 1000);
    saveChapter(MONEY);
    render(<StoryView />);
    expect(screen.getByText("재물운 · 1992년 8월 3일")).toBeTruthy();
    expect(screen.getByText("사주팔자 · 1990년 1월 1일")).toBeTruthy();
    expect(screen.getByText("흙 속에 쇠가 묻힌 명식이에요.")).toBeTruthy();
    expect(screen.queryByText("한겨울에 뜬 해")).toBeNull();
  });

  it("keeps an older record's teaser title while the topics are closed", () => {
    vi.stubEnv("NEXT_PUBLIC_SAJU_TOPICS", "off");
    saveChapter(OLD, Date.now() - 1000);
    saveChapter(MONEY);
    render(<StoryView />);
    expect(screen.getByText("한겨울에 뜬 해")).toBeTruthy();
    expect(screen.getByText("재물운 · 1992년 8월 3일")).toBeTruthy();
  });
});
