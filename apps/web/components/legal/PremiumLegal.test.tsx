// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";
import { resetPremiumStatusForTests } from "@/lib/premium/status";

/**
 * Plan task 24 and the owner's decision of 2026-10-16 (the 궁합 partner is never kept on our servers): the policies
 * describe the premium readings only where premium is visible, as client islands; STARLOG_PREMIUM off shows today's text.
 */

function stub(visible: boolean | "fail") {
  const fetchMock = vi.fn(async (url: string) => {
    if (url !== "/api/premium/status") return new Response(null, { status: 404 });
    if (visible === "fail") throw new TypeError("offline");
    return Response.json({ products: [{ id: "tarot-deep", open: visible, visible, opensAt: null }, { id: "match", open: visible, visible, opensAt: null }, { id: "newyear-2027", open: false, visible, opensAt: Date.parse("2026-11-15T00:00:00+09:00") }] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const PAGES = [PrivacyPage, TermsPage, RefundPage];

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetPremiumStatusForTests();
});

describe("the policies' premium text", () => {
  for (const state of [false, "fail"] as const) {
    it(`is absent while premium is ${state === false ? "off" : "unknown"}: today's policies`, async () => {
      for (const Page of PAGES) {
        const fetchMock = stub(state);
        const { container } = render(<Page />);
        await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/premium/status")).toBe(true));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(container.textContent).not.toMatch(/프리미엄|상대방|2027 신년운세|우리 사이 궁합|켈틱/);
        cleanup();
        resetPremiumStatusForTests();
      }
    });
  }

  it("privacy: the 궁합 partner's items, purpose, that our servers keep none of it, the sealed 30 days on the device, and deletion", async () => {
    stub(true);
    render(<PrivacyPage />);
    const section = await screen.findByRole("heading", { name: "프리미엄 궁합에 입력한 상대방 정보" });
    const text = section.parentElement!.textContent ?? "";
    for (const item of ["생년월일", "양력·음력", "태어난 시", "성별", "부르는 말", "관계"]) expect(text).toContain(item);
    expect(text).toContain("이 풀이를 만들고 이어서 물어보기에 답하는 데만");
    expect(text).toContain("운영자의 서버에는 저장하지 않습니다");
    expect(text).toContain("최대 30일");
    expect(text).toContain("공유 이미지");
    expect(text).toContain("계정에 보관하는 궁합 풀이에는 상대방의 출생 정보와 명식을 넣지 않습니다");
    expect(screen.getByRole("heading", { name: "프리미엄 풀이를 볼 때" })).toBeTruthy();
  });

  it("terms: the three products with their prices and what they hold, the 2027 신년운세 sales window, and an unfinished reading kept", async () => {
    stub(true);
    render(<TermsPage />);
    const article = await screen.findByRole("region", { name: "제7조의3 (프리미엄 풀이)" });
    const text = article.textContent ?? "";
    for (const line of ["켈틱 크로스 10장", "7,900원", "프리미엄 궁합", "2027 신년운세", "14,900원", "이어서 물어보기 5번", "30일"]) expect(text).toContain(line);
    expect(text).toContain("2026년 11월 15일 0시부터 2027년 11월 30일까지");
    expect(text).toContain("이미 지난 달도");
    expect(text).toContain("완성되어 저장되지 않으면 결제한 풀이는 쓰이지 않으며");
    expect(text).not.toContain("우리 사이");
    expect(text).not.toMatch(/베타|오픈 기념|정확|비법/);
  });

  it("refund: premium follows the same rule, with what is free first and a failed long reading kept", async () => {
    stub(true);
    render(<RefundPage />);
    const section = await screen.findByRole("region", { name: "프리미엄 풀이" });
    const text = section.textContent ?? "";
    expect(text).toContain("같은 기준이에요");
    expect(text).toContain("7일 안에 전액 환불");
    expect(text).toContain("카드 10장의 키워드");
    expect(text).toContain("결제한 풀이는 그대로 남아");
  });
});
