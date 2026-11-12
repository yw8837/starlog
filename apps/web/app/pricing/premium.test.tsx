// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import PricingPage from "./page";

const OCT = Date.parse("2026-10-20T12:00:00+09:00");

function stub(visible: boolean | "fail", setOpen = false) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url !== "/api/premium/status") return new Response(null, { status: 404 });
    if (visible === "fail") throw new TypeError("offline");
    return Response.json({
      products: [
        { id: "tarot-deep", open: visible, visible, opensAt: null },
        { id: "match", open: visible, visible, opensAt: null },
        { id: "newyear-2027", open: visible, visible, opensAt: null },
      ],
      set: { open: setOpen, opensAt: null },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const premium = () => document.querySelector("#premium") as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OCT);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
});

describe("/pricing links each reading to the page that starts it (SEO P1-1, P1-2)", () => {
  it("the tarot card links /tarot/new, the saju card /saju/new and each premium card its product page, in the server HTML", () => {
    stub(false);
    const html = renderToString(<PricingPage />);
    for (const href of ["/tarot/new", "/saju/new", "/premium/deep-tarot", "/premium/match", "/premium/newyear-2027"]) expect(html).toContain(`href="${href}"`);
  });
});

describe("/pricing's 2027 신년운세 + 프리미엄 궁합 set (owner 2026-11-10)", () => {
  it("shows the set with its price, the real saving, both readings, its checkout and its refund rule where the server sells it; nothing before", async () => {
    stub(true, true);
    render(<PricingPage />);
    const card = await screen.findByRole("region", { name: /2027 신년운세 \+ 프리미엄 궁합/ });
    expect(card.textContent).toContain("18,900원");
    expect(card.textContent).toContain("따로 사면 22,800원, 3,900원 아껴요");
    expect(card.textContent).toContain(
      "결제일로부터 7일 안에 두 풀이를 모두 열지 않았으면 18,900원 전액을, 하나만 열었으면 열지 않은 풀이 몫을 환불받을 수 있어요(2027 신년운세를 열었으면 4,000원, 프리미엄 궁합을 열었으면 11,000원). 두 풀이를 모두 열면 환불되지 않아요.",
    );
    // Review LOW 4: the tier's closing line speaks of readings paid for alone and sends the set to its own rule.
    const premium = document.getElementById("premium")!;
    expect(premium.textContent).toContain("따로 결제한 풀이는 열기 전에는 결제일로부터 7일 안에 전액 환불받을 수 있어요. 세트의 환불 기준은 세트 안내에 있어요.");
    // "남은 풀이 몫" is the approved app-set sentence (owner 2026-11-13, wording-proposals 6), not a countdown.
    expect(card.textContent).not.toMatch(/지금만|마감|할인|남은(?! 풀이 몫)/);
    expect(within(card).getByRole("link").getAttribute("href")).toMatch(/^\/pay\/checkout\?product=set-2027&/);
    cleanup();
    resetPremiumStatusForTests();
    stub(true, false);
    render(<PricingPage />);
    await screen.findByRole("region", { name: /2027 신년운세/ });
    expect(screen.queryByRole("region", { name: /프리미엄 궁합/ })?.textContent ?? "").not.toContain("18,900원");
  });
});

describe("/pricing's premium tier (plan-reconciled §4.2)", () => {
  for (const state of [false, "fail"] as const) {
    it(`shows the premium readings plainly while premium is ${state === false ? "off" : "unknown"}: names, prices and their product pages (static links, SEO P1-1), never 준비 중 (review 2026-10-20 A3)`, async () => {
      const fetchMock = stub(state);
      render(<PricingPage />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(within(premium()).getByRole("heading", { level: 2 }).textContent).toBe("깊게 보는 풀이");
      expect([...premium().querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["켈틱 크로스 10장", "프리미엄 궁합", "2027 신년운세"]);
      expect(premium().textContent).toContain("14,900원");
      expect(premium().textContent).not.toContain("준비 중");
      expect([...premium().querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/premium/deep-tarot", "/premium/match", "/premium/newyear-2027"]);
      expect(premium().querySelector("button")).toBeNull();
    });
  }

  it("where premium is visible: 깊게 보는 풀이 with each product's scope lines, state and product page", async () => {
    stub(true);
    const { container } = render(<PricingPage />);
    await waitFor(() => expect(within(premium()).getAllByRole("link", { name: /자세히 보기/ })).toHaveLength(3));
    const cards = [...premium().querySelectorAll("section")];
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual([
      expect.stringContaining("켈틱 크로스 10장"),
      expect.stringContaining("프리미엄 궁합"),
      expect.stringContaining("2027 신년운세"),
    ]);
    expect(cards[0]!.textContent).toContain("7,900원");
    expect(cards[0]!.textContent).toContain("판매 중");
    expect(cards[0]!.textContent).toContain("이어서 물어보기 3번");
    expect(cards[2]!.textContent).toContain("14,900원");
    // on sale now, no opening date (owner 2026-10-20)
    expect(cards[2]!.textContent).toContain("판매 중");
    expect(premium().textContent).not.toMatch(/열려요|곧 열려요|오픈 예정/);
    expect(within(premium()).getAllByRole("link", { name: /자세히 보기/ }).map((a) => a.getAttribute("href"))).toEqual(["/premium/deep-tarot", "/premium/match", "/premium/newyear-2027"]);
    expect(premium().textContent).not.toMatch(/베타|오픈 기념|가장 깊게|타로×사주/);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.queryByText("준비 중인 풀이")).toBeNull();
  });
});
