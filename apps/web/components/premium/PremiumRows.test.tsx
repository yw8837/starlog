// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { PremiumRows } from "./PremiumRows";

const OCT = Date.parse("2026-10-25T12:00:00+09:00"); // after 10/24 (켈틱·궁합 on sale), before 11/15
const NOV15 = Date.parse("2026-11-15T00:00:00+09:00");
const IDS = ["newyear-2027", "match", "tarot-deep"] as const;

function stub(visible: boolean, open = visible) {
  const fetchMock = vi.fn(async () =>
    Response.json({
      products: [
        { id: "tarot-deep", open, visible, opensAt: null },
        { id: "match", open, visible, opensAt: null },
        { id: "newyear-2027", open: false, visible, opensAt: NOV15 },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OCT);
  vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetPremiumStatusForTests();
});

describe("PremiumRows (the premium rows of the home, the reading ends and the guides)", () => {
  it("draws nothing while premium is off, before the status answers, or when it cannot be read", async () => {
    const fetchMock = stub(false);
    const { container } = render(<PremiumRows ids={IDS} title="더 깊게 보기" />);
    expect(container.innerHTML).toBe("");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(container.innerHTML).toBe("");
    cleanup();
    resetPremiumStatusForTests();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const failed = render(<PremiumRows ids={IDS} title="더 깊게 보기" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failed.container.innerHTML).toBe("");
  });

  it("lists each visible product with its entry name, price and a link to its product page, in the order given; never gold", async () => {
    stub(true);
    const { container } = render(<PremiumRows ids={IDS} title="더 깊게 보기" />);
    const section = await screen.findByRole("region", { name: "더 깊게 보기" });
    const links = within(section).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/premium/newyear-2027", "/premium/match", "/premium/deep-tarot"]);
    expect(links[0]!.textContent).toContain("2027 신년운세");
    expect(links[0]!.textContent).toContain("14,900원");
    expect(links[0]!.textContent).toContain("11월 15일 열려요");
    expect(links[1]!.textContent).toContain("프리미엄 궁합");
    expect(links[2]!.textContent).toContain("켈틱 크로스 10장");
    expect(links[2]!.textContent).toContain("7,900원");
    expect(container.querySelector('[class*="primary"], [class*="gold"]')).toBeNull();
    expect(container.textContent).not.toMatch(/가장 깊게|타로×사주|베타/);
  });

  it("takes a line per product, and leaves out one before its window where asked (a reading end offers 2027 신년운세 from 11/15)", async () => {
    stub(true);
    render(<PremiumRows ids={["newyear-2027", "match"]} title="더 깊게 보고 싶다면" onlyOpen lines={{ match: "다른 사람과 함께 봐요" }} />);
    const section = await screen.findByRole("region", { name: "더 깊게 보고 싶다면" });
    expect(within(section).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/premium/match"]);
    expect(section.textContent).toContain("다른 사람과 함께 봐요");
    cleanup();
    vi.setSystemTime(NOV15);
    render(<PremiumRows ids={["newyear-2027", "match"]} title="더 깊게 보고 싶다면" onlyOpen />);
    const later = await screen.findByRole("region", { name: "더 깊게 보고 싶다면" });
    expect(within(later).getAllByRole("link")).toHaveLength(2);
  });

  it("on a guide page with the hosts split, links to the app host", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    stub(true);
    render(<PremiumRows ids={["match"]} title="이 풀이로 깊게 보기" host="guide" />);
    const link = await screen.findByRole("link", { name: /프리미엄 궁합/ });
    expect(link.getAttribute("href")).toBe(`${SITE.url}/premium/match`);
  });
});
