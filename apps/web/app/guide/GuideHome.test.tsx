// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GuideSajuPage from "@/app/guide/saju/page";
import GuideTarotPage from "@/app/guide/tarot/page";
import { SITE } from "@/lib/config";
import { GUIDE_STARTERS, articlesIn } from "@/lib/guide";
import { GUIDE_EDITOR } from "@/lib/guideReview";

/**
 * The guide's home (the root domain's "/", the tarot tab) introduces the site in writing (AdSense audit 2026-11-06): what
 * the guide is, how it is made and checked, what is its own, and where to start, tarot and saju with the same weight. The
 * article list stays. Every claim is one the repository backs (the checks in lib/guide-articles/*.test.ts, the KB).
 */

afterEach(cleanup);

const intro = () => screen.getByRole("heading", { level: 2, name: "스타로그 가이드는" }).closest("section") as HTMLElement;

describe("the home's introduction", () => {
  it("says what the guide is, with both counts", () => {
    render(<GuideTarotPage />);
    const text = intro().textContent ?? "";
    expect(text).toContain(`타로 ${articlesIn("tarot").length}편`);
    expect(text).toContain(`사주 ${articlesIn("saju").length}편`);
  });

  it("says how it is made and checked: an AI draft, the sources and automatic checks it is held to, and who answers for it", () => {
    render(<GuideTarotPage />);
    const how = within(intro()).getByRole("heading", { level: 3, name: "어떻게 만들고 확인하나요" }).parentElement as HTMLElement;
    const text = how.textContent ?? "";
    expect(text).toContain("AI 도구로 초안");
    for (const source of ["1909년", "웨이트", "카드 지식 베이스", "만세력 엔진", "자동 검사"]) expect(text, source).toContain(source);
    expect(text).toContain(GUIDE_EDITOR.name);
  });

  it("says what is original here", () => {
    render(<GuideTarotPage />);
    const own = within(intro()).getByRole("heading", { level: 3, name: "여기서만 볼 수 있는 것" }).parentElement as HTMLElement;
    expect(within(own).getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
  });

  it("names no AI company or model, makes no promise, and keeps the 검토 word for the owner's own reviews", () => {
    render(<GuideTarotPage />);
    const text = intro().textContent ?? "";
    expect(text).not.toMatch(/Claude|GPT|Gemini|OpenAI|Anthropic|베타|100%|정확도|적중/);
    expect(text).not.toContain("검토");
  });

  it("starts tarot and saju with the same weight: two paths of the same length side by side, and keeps the article list", () => {
    render(<GuideTarotPage />);
    expect(GUIDE_STARTERS.tarot.length).toBe(GUIDE_STARTERS.saju.length);
    const start = screen.getByRole("heading", { level: 2, name: "처음이라면 이 순서로 읽어 보세요" }).closest("section") as HTMLElement;
    const paths = within(start).getAllByRole("list");
    expect(paths.map((list) => within(list).getAllByRole("link").length)).toEqual([GUIDE_STARTERS.tarot.length, GUIDE_STARTERS.saju.length]);
    expect(start.textContent).toContain("타로");
    expect(start.textContent).toContain("사주");
    const list = screen.getByRole("heading", { level: 2, name: "타로 가이드" }).closest("section") as HTMLElement;
    expect(within(list).getAllByRole("link")).toHaveLength(articlesIn("tarot").length);
  });

  it("is the home's alone: the saju tab keeps its own short intro", () => {
    render(<GuideSajuPage />);
    expect(screen.queryByRole("heading", { level: 3, name: "어떻게 만들고 확인하나요" })).toBeNull();
    expect(SITE.nameKo).toBe("스타로그");
  });
});
