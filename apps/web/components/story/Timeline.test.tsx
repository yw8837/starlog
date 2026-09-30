// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { StoryChapter } from "@/lib/fixtures";
import { Timeline } from "./Timeline";

afterEach(cleanup);

const prologue: StoryChapter = {
  id: "prologue",
  kind: "saju",
  label: "프롤로그",
  title: "",
  href: "/chapter/prologue",
  cards: [],
  excerpt: { story: "", plain: "" },
};

const chapter: StoryChapter = {
  id: "sample",
  kind: "tarot",
  label: "1장",
  title: "뜸해진 연락 앞에서",
  href: "/chapter/sample",
  cards: [],
  excerpt: { story: "이야기 요약", plain: "풀이 요약" },
};

describe("Timeline", () => {
  it("reads straight through: the whole story, its short reading and a link to the full one", () => {
    const story = "이야기 ".repeat(80).trim();
    render(<Timeline chapters={[{ ...chapter, excerpt: { story, plain: "풀이 요약" } }]} scenes={[]} />);
    expect(screen.getByRole("heading", { level: 2, name: "뜸해진 연락 앞에서" })).toBeTruthy();
    // No toggle and no clamp: both texts are on the page in full.
    expect(screen.getByText(story)).toBeTruthy();
    expect(screen.getByText("풀이 요약")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "읽는 방식" })).toBeNull();
    const link = screen.getByRole("link", { name: "뜸해진 연락 앞에서 풀이 전체 보기" });
    expect(link.getAttribute("href")).toBe("/chapter/sample");
    expect(link.textContent).toBe("풀이 전체 보기");
  });

  it("shows the chapter's cards large, each named with its orientation", () => {
    const cards = [
      { cardId: "major-09-hermit", orientation: "upright" as const, name: "은둔자" },
      { cardId: "major-17-star", orientation: "reversed" as const, name: "별" },
    ];
    render(<Timeline chapters={[{ ...chapter, cards }]} scenes={[]} />);
    expect(screen.getByRole("img", { name: "은둔자 · 정방향" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "별 · 역방향" })).toBeTruthy();
    // The timeline's own items stay the chapters (no list nested inside one).
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("does not repeat a reading that is the same as the story", () => {
    render(<Timeline chapters={[{ ...chapter, excerpt: { story: "같은 문장", plain: "같은 문장" } }]} scenes={[]} />);
    expect(screen.getAllByText("같은 문장")).toHaveLength(1);
    expect(screen.queryByRole("heading", { level: 3, name: "풀이" })).toBeNull();
  });

  it("shows a busy skeleton with an accessible name while a chapter is still being read", () => {
    render(<Timeline chapters={[prologue, chapter]} scenes={[]} loadingId="prologue" />);
    const heading = screen.getByRole("heading", { level: 2, name: "불러오는 중이에요" });
    expect(heading.closest("article")?.getAttribute("aria-busy")).toBe("true");
    // The loading chapter has no link yet; the other chapter is not busy.
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "뜸해진 연락 앞에서 풀이 전체 보기" }).closest("article")?.hasAttribute("aria-busy")).toBe(false);
  });
});
