// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { CHAPTERS_KEY } from "@/lib/storage/chapters";
import { LocalChapter } from "./LocalChapter";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/chapter/x" }));

/** The next step at the end of a finished reading (plan-reconciled §4.3): never gold, only where premium is visible. */

const OCT = Date.parse("2026-10-25T12:00:00+09:00"); // after 10/24 (켈틱·궁합 on sale), before 11/15
const NOV20 = Date.parse("2026-11-20T12:00:00+09:00");
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

function stub(visible: boolean | "fail") {
  const fetchMock = vi.fn(async (url: string) => {
    if (url !== "/api/premium/status") return new Response(null, { status: 404 });
    if (visible === "fail") throw new TypeError("offline");
    return Response.json({
      products: [
        { id: "tarot-deep", open: visible, visible, opensAt: null },
        { id: "match", open: visible, visible, opensAt: null },
        { id: "newyear-2027", open: false, visible, opensAt: Date.parse("2026-11-15T00:00:00+09:00") },
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

  it("offers 프리미엄 궁합 after a saju reading, and 2027 신년운세 too from 2026-11-15", async () => {
    stub(true);
    seed([SAJU]);
    render(<LocalChapter id="saju00001" />);
    const before = await screen.findByRole("region", { name: "더 깊게 보고 싶다면" });
    expect(within(before).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/premium/match"]);
    expect(before.textContent).toContain("다른 사람과 함께");
    cleanup();
    resetPremiumStatusForTests();
    vi.setSystemTime(NOV20);
    stub(true);
    render(<LocalChapter id="saju00001" />);
    const after = await screen.findByRole("region", { name: "더 깊게 보고 싶다면" });
    expect(within(after).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/premium/newyear-2027", "/premium/match"]);
  });
});
