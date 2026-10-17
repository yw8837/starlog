// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";
import { resetPremiumStatusForTests } from "@/lib/premium/status";

/**
 * Plan task 24 and the owner's decision of 2026-10-16 (the 궁합 partner is never kept on our servers): the policies
 * describe the premium readings in the documents themselves, whatever STARLOG_PREMIUM says (review 2026-10-17 M3: the
 * names and prices are public on /pricing already, and a policy must not depend on a client request).
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
    it(`is in the documents while premium is ${state === false ? "off" : "unknown"}, in the first render (review 2026-10-17 M3)`, () => {
      for (const Page of PAGES) {
        stub(state);
        const { container } = render(<Page />);
        expect(container.textContent).toMatch(/프리미엄 풀이/);
        cleanup();
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
    expect(text).toContain("운영자의 서버에는 상대방의 생년월일과 태어난 시를 저장하지 않습니다");
    expect(text).toContain("최대 30일");
    expect(text).toContain("공유 이미지");
    expect(text).toContain("계정에 보관하는 궁합 풀이에는 상대방의 출생 정보와 명식을 넣지 않습니다");
    // As it works since 2026-10-17: only the day master and the tilt go to the AI, the share image carries the relation,
    // the account keeps the relation and the label, a login again on the writing device keeps follow-ups, 30 days then gone.
    // What the AI gets of the other person, exactly (review 2026-10-17 #1), and what it never gets.
    for (const item of ["부르는 말과 관계", "일간(한 글자)", "오행의 기울기", "두 사람의 일지 사이 관계 이름", "대운이 바뀌는 시기(몇 년 안인지)", "태어난 시를 아는지 여부"]) expect(text).toContain(item);
    expect(text).toContain("일간 한 글자를 뺀 기둥 간지, 대운의 간지와 시작 시기는 전달하지 않고 풀이 글에도 쓰지 않습니다");
    expect(text).not.toContain("일간과 오행의 기울기만");
    expect(text).toContain("30일이 지난 뒤 앱을 처음 열 때 지웁니다");
    expect(text).toContain("풀이 글(상대방의 일간·오행 기울기·두 사람 일지 관계에 대한 해석이 들어 있습니다)");
    expect(text).toContain("결제하지 않고 떠나거나 24시간이 지나면 지웁니다");
    expect(text).toContain("공유 이미지에는 고른 관계만");
    expect(text).toContain("관계, 부르는 말");
    expect(text).toContain("풀이를 연 기기에서는 다시 로그인해도");
    expect(text).not.toContain("풀이를 열 때 지웁니다");
    expect(screen.getByRole("heading", { name: "프리미엄 풀이를 이용하는 경우" })).toBeTruthy();
  });

  it("terms: the three products with their prices and what they hold, the 2027 신년운세 sales window, and an unfinished reading kept", async () => {
    stub(true);
    render(<TermsPage />);
    const article = await screen.findByRole("region", { name: "제7조의3 (프리미엄 풀이)" });
    const text = article.textContent ?? "";
    for (const line of ["켈틱 크로스 10장", "7,900원", "프리미엄 궁합", "2027 신년운세", "14,900원", "이어서 물어보기 3번", "30일"]) expect(text).toContain(line);
    expect(text).toContain("2026년 11월 15일 0시부터 2027년 11월 30일까지");
    expect(text).toContain("이미 지난 달도");
    expect(text).toContain("운영자 쪽 문제로 완성되지 않은 풀이는 쓰이지 않습니다");
    // The same reopening rule as 제7조 and the refund page (MAX_RESTORES 3).
    expect(text).toContain("3번까지 다시 열어");
    expect(text).toContain("네 번째로 끊긴 때에는");
    expect(text).toContain("운영자는 상대방의 생년월일과 태어난 시를 서버에 저장하지 않으며(계정에는 관계, 부르는 말, 고민과 풀이 글을 보관합니다)");
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
