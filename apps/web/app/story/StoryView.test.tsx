// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { DECK_KEY } from "@/lib/deck";
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

const TAROT: NewChapter = {
  kind: "tarot",
  question: "타로 질문",
  conditions: [],
  note: "",
  cards: [{ position: "지금의 나", cardId: "major-09-hermit", orientation: "upright" }],
  reading: { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } } as never,
  chapterToken: "tarot.token",
};
const SERVER_ID = "abcdefghij0123456789";

describe("내 기록 records", () => {
  afterEach(() => localStorage.removeItem(DECK_KEY));

  it("shows a reading saved without its deck in the 1909 scans it was written for, and one with a deck in that deck", () => {
    localStorage.setItem(DECK_KEY, JSON.stringify({ front: "starlog", back: "constellation" }));
    saveChapter(TAROT, Date.now() - 1000);
    saveChapter({ ...TAROT, cards: [{ position: "지금의 나", cardId: "major-17-star", orientation: "upright" }], deck: "starlog" } as NewChapter);
    const { container } = render(<StoryView />);
    const sources = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(sources).toContain("/cards/major-09-hermit-sm.webp");
    expect(sources).toContain("/cards/starlog/major-17-star-sm.webp");
    expect(sources).not.toContain("/cards/starlog/major-09-hermit-sm.webp");
  });

  it("says only this device keeps the records when none is in the account (QA-02)", () => {
    saveChapter(TAROT);
    render(<StoryView />);
    expect(screen.getByText("기록 1개 · 이 기기에 보관돼요")).toBeTruthy();
  });

  it("says the account keeps them too when they are saved there, and opens one by its account id, the same on every device (QA-02)", () => {
    saveChapter({ ...TAROT, serverId: SERVER_ID });
    render(<StoryView />);
    expect(screen.getByText("기록 1개 · 이 기기와 계정에 보관돼요")).toBeTruthy();
    expect(screen.getByRole("link", { name: /타로 질문/ }).getAttribute("href")).toBe(`/chapter/${SERVER_ID}`);
  });

  it("counts the ones in the account when only some are (QA-02)", () => {
    saveChapter(TAROT, Date.now() - 1000);
    saveChapter({ ...TAROT, serverId: SERVER_ID });
    render(<StoryView />);
    expect(screen.getByText("기록 2개 · 이 기기에 보관돼요 · 1개는 계정에도 있어요")).toBeTruthy();
  });

  it("account sync: logged in, marks each record this device alone keeps (이 기기에만), shows a reading once when its account copy is here too, newest first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/me"
          ? Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [], opening: [] } })
          : Response.json({ readings: [], next: null }),
      ),
    );
    const local = saveChapter({ ...TAROT, question: "이 기기에서만 연 질문" }, Date.now() - 2000).chapter;
    saveChapter({ ...TAROT, question: "계정에도 있는 질문", serverId: SERVER_ID }, Date.now() - 1000);
    // The same account reading as a record of its own (pulled before a lost move answer linked it): shown once.
    localStorage.setItem("starlog.chapters", JSON.stringify({ v: 1, chapters: [...JSON.parse(localStorage.getItem("starlog.chapters")!).chapters, { ...TAROT, id: SERVER_ID, serverId: SERVER_ID, createdAt: Date.now() - 1000, turns: [], followUpsLeft: 3, question: "계정에도 있는 질문" }] }));
    render(<StoryView />);
    const badge = await screen.findByText("이 기기에만");
    const links = screen.getAllByRole("link", { name: /질문/ });
    expect(links.map((link) => link.textContent?.includes("계정에도 있는 질문"))).toEqual([true, false]);
    expect(links[1]!.contains(badge)).toBe(true);
    expect(links[1]!.getAttribute("href")).toBe(`/chapter/${local.id}`);
    expect(screen.getAllByText("이 기기에만")).toHaveLength(1);
    expect(screen.getByText("기록 2개 · 이 기기에 보관돼요 · 1개는 계정에도 있어요")).toBeTruthy();
  });

  it("marks nothing for a visitor who is not logged in: every record is on this device alone, as the header says", () => {
    saveChapter(TAROT);
    render(<StoryView />);
    expect(screen.queryByText("이 기기에만")).toBeNull();
  });
});
