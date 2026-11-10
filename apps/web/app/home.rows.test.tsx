// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { clearChapters, saveChapter } from "@/lib/storage/chapters";
import HomePage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ products: [] })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
  resetAccountForTests();
  clearChapters();
  localStorage.clear();
});

it("names the site on its home: the app's WebSite JSON-LD (스타로그, also Starlog), which the root layout no longer repeats on every page (SEO P1-9)", () => {
  const { container } = render(<HomePage />);
  const sites = [...container.querySelectorAll('script[type="application/ld+json"]')].map((script) => JSON.parse(script.textContent ?? "")).filter((node) => node["@type"] === "WebSite");
  expect(sites).toHaveLength(1);
  expect(sites[0]).toMatchObject({ "@id": "https://starlog.yeolmaeapps.kr/#website", name: "스타로그", url: "https://starlog.yeolmaeapps.kr/" });
});

describe("the home's rows", () => {
  // Spec 2026-11-11 entry funnel renewal 3.1: one hook first, then the 오픈 기념 line and the 2027 line, the two paid entries,
  // then the free tests and who reads what.
  it("leads with the one hook (the page's h1, the one gold button, to 지금의 한 장), then 타로 · 사주, then the free tests", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-11T12:00:00+09:00"));
    try {
      const { container } = render(<HomePage />);
      const main = screen.getByRole("main");
      const h1s = container.querySelectorAll("h1");
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!.textContent).toBe("연락할까 말까? 카드 한 장 뽑아 봐");
      const hook = screen.getByRole("link", { name: /한 장 뽑기/ });
      const tarot = screen.getByRole("link", { name: /타로 보기/ });
      const saju = screen.getByRole("link", { name: /사주 보기/ });
      const keyword = screen.getByRole("link", { name: /2027년 내 키워드는\?/ });
      const today = screen.getByRole("link", { name: /오늘의 한 장/ });
      const birth = screen.getByRole("link", { name: /나를 닮은 타로 카드/ });
      const intro = screen.getByText("타로는 고양이 타로로가, 사주는 토끼 사주주가 내 상황에 맞춰 읽어 드려요.");
      const opening = await screen.findByText(/오픈 기념 타로 전체 풀이 무료는 11월 30일까지예요/);
      const order = [h1s[0]!, hook, opening, tarot, saju, keyword, today, birth, intro];
      for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // The hook is the one gold primary; 지금의 한 장 is no longer a quick card beside it.
      const gold = [...main.querySelectorAll("a, button")].filter((el) => /(^|_|\s)(primary|entryPrimary)(_|\s|$)/.test(el.className));
      expect(gold).toEqual([hook]);
      expect([...main.querySelectorAll('a[href="/now"]')]).toEqual([hook]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows no 지난 풀이 돌아보기 even when a reading is due (owner 2026-10-20: it lives in 내 정보)", async () => {
    saveChapter(
      {
        kind: "tarot",
        question: "돌아볼 질문",
        conditions: [],
        note: "",
        cards: [card],
        reading: { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" }, observation: { heading: "며칠 안에 확인해 볼 신호", body: "답장이 오는지 보세요" } } as never,
        chapterToken: "t",
      },
      Date.now() - 4 * 86_400_000,
    );
    render(<HomePage />);
    await waitFor(() => expect(screen.getByRole("link", { name: /타로 보기/ })).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/지난 풀이 돌아보기/)).toBeNull();
  });
});
