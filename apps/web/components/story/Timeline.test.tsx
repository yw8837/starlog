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
  it("names each chapter link by its title", () => {
    render(<Timeline chapters={[chapter]} scenes={[]} mode="story" />);
    expect(screen.getByRole("link", { name: "뜸해진 연락 앞에서" }).getAttribute("href")).toBe("/chapter/sample");
    expect(screen.getByText("이야기 요약")).toBeTruthy();
  });

  it("shows a busy skeleton with an accessible name while a chapter is still being read", () => {
    render(<Timeline chapters={[prologue, chapter]} scenes={[]} mode="story" loadingId="prologue" />);
    const link = screen.getByRole("link", { name: "불러오는 중이에요" });
    expect(link.getAttribute("href")).toBe("/chapter/prologue");
    expect(link.closest("article")?.getAttribute("aria-busy")).toBe("true");
    // Only the loading chapter is busy.
    expect(screen.getByRole("link", { name: "뜸해진 연락 앞에서" }).closest("article")?.hasAttribute("aria-busy")).toBe(false);
  });
});
