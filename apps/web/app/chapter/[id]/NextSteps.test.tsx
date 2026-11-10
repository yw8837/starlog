// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asMember } from "@/lib/testing/account";
import { resetAccountForTests } from "@/lib/account/client";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { CHAPTERS_KEY } from "@/lib/storage/chapters";
import { LocalChapter } from "./LocalChapter";

beforeEach(() => asMember());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/chapter/x" }));

/** The next step at the end of a finished reading (plan-reconciled §4.3): never gold, only where premium is visible. */

const OCT = Date.parse("2026-10-25T12:00:00+09:00"); // after everything went on sale (owner 2026-10-20)
const seed = (chapters: unknown[]) => localStorage.setItem(CHAPTERS_KEY, JSON.stringify({ v: 1, chapters }));
const TAROT = {
  id: "tarot0001", createdAt: OCT, chapterToken: "x", turns: [], followUpsLeft: 3, kind: "tarot", question: "q", conditions: [], note: "",
  cards: TAROT_SAMPLE.cards.map(({ position, cardId, orientation }) => ({ position, cardId, orientation })), reading: TAROT_SAMPLE.paid,
};
const SAJU = {
  id: "saju00001", createdAt: OCT, chapterToken: "x", turns: [], followUpsLeft: 3, kind: "saju",
  birth: { calendar: "solar", year: 1990, month: 1, day: 1, isLeapMonth: false, timeKnown: false, hour: null, minute: null, gender: "female", placeId: "seoul" },
  title: "한겨울에 뜬 해", summary: "요약",
  reading: { sections: [{ heading: "타고난 바탕 · 태어난 계절이 나에게 주는 힘", body: "첫 절 본문" }], observation: { heading: "앞으로 몇 주 · 확인해 볼 신호", body: "신호" }, followUps: [] },
};

const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });
const YEAR = {
  id: "year0001", createdAt: OCT, chapterToken: "t", turns: [], followUpsLeft: 3, kind: "newyear-2027", birth: SAJU.birth, title: "차근차근 쌓아 가는 해",
  reading: {
    title: "차근차근 쌓아 가는 해", overview: section("2027 정미년과 나의 명식"), luck: section("지금의 10년 속 2027년"),
    areas: { heading: "영역별로 보면", work: section("일"), money: section("돈"), relations: section("관계"), health: section("몸과 생활 리듬") },
    lucky: section("2027년을 가볍게 돕는 것"), months: [{ month: 1, heading: "1월 · 신축월", body: "1월 본문이에요." }],
    closing: section("한 해를 보내는 방법"), observation: section("첫 달에 확인해 볼 신호"), followUps: [],
  },
};
const MATCH = {
  id: "pair0001", createdAt: OCT, chapterToken: "t", turns: [], followUpsLeft: 3, kind: "match", relation: "friend", relationLabel: "친구",
  me: { birth: SAJU.birth },
  reading: {
    verdict: "결론", saju: { dayMasters: section("두 사람의 일간"), elements: section("오행"), pillars: section("두 일지"), luck: section("10년") },
    periods: ["2026년 10월~12월", "2027년 1월~3월", "2027년 4월~6월", "2027년 7월~9월"].map(section), together: section("서로에게 맞는 말과 행동"),
    avoid: section("서로 피하면 좋은 말과 행동"), action: section("오늘 해 볼 일"), observation: section("몇 주 안에 확인해 볼 신호"), followUps: [],
  },
};

function stub(visible: boolean | "fail") {
  const fetchMock = vi.fn(async (url: string) => {
    if (url !== "/api/premium/status") return new Response(null, { status: 404 });
    if (visible === "fail") throw new TypeError("offline");
    return Response.json({
      products: [
        { id: "tarot-deep", open: visible, visible, opensAt: null },
        { id: "match", open: visible, visible, opensAt: null },
        { id: "newyear-2027", open: visible === true, visible, opensAt: null },
      ],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const next = () => screen.queryByRole("region", { name: "더 깊게 보고 싶다면" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OCT);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
  resetAccountForTests();
  localStorage.clear();
});

describe("the next step at a reading's end", () => {
  for (const state of [false, "fail"] as const) {
    it(`adds nothing to a tarot or saju record while premium is ${state === false ? "off" : "unknown"}`, async () => {
      const fetchMock = stub(state);
      seed([TAROT, SAJU]);
      const tarot = render(<LocalChapter id="tarot0001" />);
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/premium/status")).toBe(true));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(next()).toBeNull();
      expect(tarot.container.querySelector('a[href^="/premium/"]')).toBeNull();
      cleanup();
      const saju = render(<LocalChapter id="saju00001" />);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(next()).toBeNull();
      expect(saju.container.querySelector('a[href^="/premium/"]')).toBeNull();
      expect(screen.getByRole("heading", { name: "카드로 이어서 보기" })).toBeTruthy();
    });
  }

  it("offers 켈틱 크로스 10장 after a tarot reading's follow-ups and rating, never gold", async () => {
    stub(true);
    seed([TAROT]);
    render(<LocalChapter id="tarot0001" />);
    const section = await screen.findByRole("region", { name: "더 깊게 보고 싶다면" });
    const [link] = within(section).getAllByRole("link");
    expect(link!.getAttribute("href")).toBe("/premium/deep-tarot");
    expect(link!.textContent).toContain("켈틱 크로스 10장");
    expect(link!.textContent).toContain("카드 10장");
    expect(document.getElementById("chapter-follow-up")!.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.querySelector('[class*="primary"]')).toBeNull();
  });

  it("offers 프리미엄 궁합 first after a tarot reading about love, then 켈틱 크로스 10장, at their normal prices (sales 2026-11-10 item 2)", async () => {
    stub(true);
    seed([{ ...TAROT, question: "이번 달 그 사람과의 연애는 순탄할까?" }]);
    render(<LocalChapter id="tarot0001" />);
    const section = await screen.findByRole("region", { name: "더 깊게 보고 싶다면" });
    expect(within(section).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/premium/match", "/premium/deep-tarot"]);
    expect(section.textContent).toContain("7,900원");
    expect(section.textContent).not.toMatch(/지금만|오늘만|마감|할인/);
  });

  for (const [kind, other] of [["newyear-2027", "/premium/match"], ["match", "/premium/newyear-2027"]] as const) {
    it(`offers the other one after a ${kind} reading: ${other} (sales 2026-11-10 item 2)`, async () => {
      stub(true);
      seed([kind === "match" ? MATCH : YEAR]);
      render(<LocalChapter id={kind === "match" ? "pair0001" : "year0001"} />);
      const section = await screen.findByRole("region", { name: "이어서 보면 좋은 풀이" });
      expect(within(section).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([other]);
      expect(section.querySelector('[class*="primary"]')).toBeNull();
    });
  }

  it("offers 2027 신년운세 and 프리미엄 궁합 after a saju reading, both on sale now (owner 2026-10-20)", async () => {
    stub(true);
    seed([SAJU]);
    render(<LocalChapter id="saju00001" />);
    const next = await screen.findByRole("region", { name: "더 깊게 보고 싶다면" });
    expect(within(next).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/premium/newyear-2027", "/premium/match"]);
    expect(next.textContent).toContain("다른 사람과 함께");
  });
});
