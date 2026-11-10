// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { assertVoice } from "@/lib/voice/banned";
import { HomeHook, HomeIntro, KeywordLine, QuickCards } from "./HomeEntries";

afterEach(cleanup);

/** Spec 2026-11-11 entry funnel renewal 3.1, 6.1: one hook on the home's first screen, 타로로's, to 지금의 한 장. */
describe("the home hook", () => {
  it("asks the one question as the page's h1 and sends to 지금의 한 장 with the one gold button", () => {
    render(<HomeHook />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("연락할까 말까? 카드 한 장 뽑아 봐");
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "고민 하나 떠올리고 78장 중 한 장. 로그인 없이 무료, 바로 나와.")).toBeTruthy();
    const go = screen.getByRole("link", { name: /한 장 뽑기/ });
    expect(go.getAttribute("href")).toBe("/now");
    // The gold primary (components/ui/Button), the first screen's only one.
    expect(go.className).toMatch(/primary/);
    // True for every draw (review 2026-11-11 #7b): a nickname is not always shown, and the visitor, not 타로로, draws.
    expect(screen.getByText("뽑은 카드가 고민에 한 문장으로 답해 줘")).toBeTruthy();
    expect(screen.queryByText(/별명/)).toBeNull();
    // 타로로 holds the card (the owner's picture, public/characters/cat-tarot-card).
    expect(screen.getByRole("img", { name: /타로로/ })).toBeTruthy();
  });

  it("passes the banned list (spec 2.4)", () => {
    const { container } = render(<HomeHook />);
    for (const node of container.querySelectorAll("h1, p, a")) assertVoice(node.textContent ?? "");
  });
});

describe("below the entries", () => {
  it("says what each guide is before its name, so 타로로 never reads as 타로 + 로 (moved under the entries)", () => {
    render(<HomeIntro />);
    expect(screen.getByText("타로는 고양이 타로로가, 사주는 토끼 사주주가 내 상황에 맞춰 읽어 드려요.")).toBeTruthy();
  });

  it("offers the 2027 keyword in one thin line (H9)", () => {
    render(<KeywordLine />);
    const link = screen.getByRole("link", { name: /2027년 내 키워드는\?/ });
    expect(link.getAttribute("href")).toBe("/2027-keyword");
    expect(link.textContent).toContain("생일만 넣으면 무료");
    assertVoice(link.textContent ?? "");
  });

  it("puts 오늘의 한 장 and 나를 닮은 타로 카드 in the quick cards (지금의 한 장 is the hook now, H8)", () => {
    render(<QuickCards />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/today", "/birth-card"]);
    const birth = within(links[1]!);
    expect(birth.getByText("나를 닮은 타로 카드")).toBeTruthy();
    expect(birth.getByText("생일로 찾는 내 카드")).toBeTruthy();
    expect(birth.getByText("로그인 없이 무료")).toBeTruthy();
    for (const a of links) assertVoice(a.textContent ?? "");
  });
});

describe("the home's characters", () => {
  it("scale with transform and a set size, not CSS zoom, which Firefox before 126 ignores (review 2026-11-11 #7d)", () => {
    // jsdom's import.meta.url is not a file URL: found from the run's folder (the repo or apps/web), as GuideAds.test does.
    const web = ["apps/web", "."].map((path) => resolve(process.cwd(), path)).find((path) => existsSync(join(path, "components/home"))) ?? "";
    const css = readFileSync(join(web, "components/home/home.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/(^|[;{\s])zoom\s*:/);
  });
});
