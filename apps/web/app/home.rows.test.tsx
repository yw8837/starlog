// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { SITE } from "@/lib/config";
import { assertVoice } from "@/lib/voice/banned";
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

/** In document order, one after another. */
const inOrder = (nodes: Element[]) => {
  for (let i = 1; i < nodes.length; i++) expect(nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
};

describe("the home's rows", () => {
  // Spec 2026-11-26 worry catalog §5.4: the hook, the 오픈 기념 line, the 고민 판 where the two big cards were, the 2027 line,
  // the 2027 키워드 line, the quick cards, 도구로 바로 보기, who reads what (the rest below as before).
  it("leads with the one hook (the page's h1, the one gold button, to 지금의 한 장), then the 고민 판, the free tests, the tools by name", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-11T12:00:00+09:00"));
    try {
      const { container } = render(<HomePage />);
      const main = screen.getByRole("main");
      const h1s = container.querySelectorAll("h1");
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!.textContent).toBe("연락할까 말까? 카드 한 장 뽑아 봐");
      const hook = screen.getByRole("link", { name: /한 장 뽑기/ });
      const board = screen.getByRole("region", { name: "지금 무슨 고민이야?" });
      const worries = within(board).getAllByRole("link");
      const keyword = screen.getByRole("link", { name: /2027년 내 키워드는\?/ });
      const today = screen.getByRole("link", { name: /오늘의 한 장/ });
      const birth = screen.getByRole("link", { name: /나를 닮은 타로 카드/ });
      const tools = screen.getByRole("region", { name: "도구로 바로 보기" });
      const tarot = within(tools).getByRole("link", { name: "타로 3장 보기" });
      const saju = within(tools).getByRole("link", { name: "사주 보기" });
      const intro = screen.getByText("타로는 고양이 타로로가, 사주는 토끼 사주주가 내 상황에 맞춰 읽어 드려요.");
      const opening = await screen.findByText(/오픈 기념 타로 전체 풀이 무료는 11월 30일까지예요/);
      inOrder([h1s[0]!, hook, opening, board, keyword, today, birth, tools, intro]);
      // Six worries in §5.4's order, then the way to all of them.
      expect(worries.map((a) => a.getAttribute("href"))).toEqual(["/w/some", "/w/no-reply", "/w/again", "/w/solo", "/w/money-leak", "/w/job", "/worries"]);
      expect(tarot.getAttribute("href")).toBe("/tarot/new");
      expect(saju.getAttribute("href")).toBe("/saju/start");
      // The two big cards are gone: their names live on in the tools row only.
      expect(screen.queryByText("카드 3장으로 고민 깊게 보기")).toBeNull();
      // The hook is the one gold primary; 지금의 한 장 is no longer a quick card beside it.
      const gold = [...main.querySelectorAll("a, button")].filter((el) => /(^|_|\s)(primary|entryPrimary)(_|\s|$)/.test(el.className));
      expect(gold).toEqual([hook]);
      expect([...main.querySelectorAll('a[href="/now"]')]).toEqual([hook]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows each worry card's own way of reading and its catalog price (§12.3), never gold", () => {
    render(<HomePage />);
    const board = screen.getByRole("region", { name: "지금 무슨 고민이야?" });
    const cards = within(board).getAllByRole("listitem").map((li) => li.textContent);
    expect(cards).toEqual([
      "이거 썸 맞아?톡 말고, 약속도 서로 잡아?타로 3장 · 2,900원",
      "답 없는 톡, 먼저 할까답 없는 톡에 네 하루 다 쓰진 마.타로 3장 · 2,900원",
      "다시 만나도 될까다시 만날 이유에 달라진 것도 있어?타로 3장 · 2,900원",
      "연애는 하고 싶은데외로운 거랑 연애하고 싶은 건 달라.사주 연애운 · 4,900원",
      "돈 쓰고 또 후회해큰돈 안 썼다면 자주 나간 돈부터 봐.사주 재물운 · 4,900원",
      "어떤 일이 나랑 맞지?잘하는 일이랑 버티는 일은 달라.사주 직장운 · 4,900원",
    ]);
    for (const text of cards) assertVoice(text ?? "");
  });

  it("is the home before the catalog while SITE.features.worries is off (§8): 타로 보기 and 사주 보기 cards, no 고민 판", async () => {
    const features = SITE.features as { worries: boolean };
    features.worries = false;
    try {
      const { container } = render(<HomePage />);
      const main = screen.getByRole("main");
      expect(screen.queryByRole("region", { name: "지금 무슨 고민이야?" })).toBeNull();
      expect(screen.queryByRole("region", { name: "도구로 바로 보기" })).toBeNull();
      expect(container.querySelector('a[href^="/w/"], a[href="/worries"]')).toBeNull();
      const hook = screen.getByRole("link", { name: /한 장 뽑기/ });
      const tarot = screen.getByRole("link", { name: /타로 보기/ });
      const saju = screen.getByRole("link", { name: /사주 보기/ });
      const keyword = screen.getByRole("link", { name: /2027년 내 키워드는\?/ });
      const intro = screen.getByText("타로는 고양이 타로로가, 사주는 토끼 사주주가 내 상황에 맞춰 읽어 드려요.");
      inOrder([hook, tarot, saju, keyword, intro]);
      expect(tarot.textContent).toContain("카드 3장으로 고민 깊게 보기");
      const gold = [...main.querySelectorAll("a, button")].filter((el) => /(^|_|\s)(primary|entryPrimary)(_|\s|$)/.test(el.className));
      expect(gold).toEqual([hook]);
    } finally {
      features.worries = true;
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
    await waitFor(() => expect(screen.getByRole("link", { name: /타로 3장 보기/ })).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/지난 풀이 돌아보기/)).toBeNull();
  });
});
