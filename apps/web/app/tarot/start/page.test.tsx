// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE, won } from "@/lib/config";
import { times } from "@/lib/helpGuide";
import { PREMIUM } from "@/lib/premium/products";
import TarotStartPage, { metadata } from "./page";

const gate = vi.hoisted(() => ({ visible: false }));
vi.mock("@/lib/premium/pageGate", () => ({ premiumVisibleHere: async () => gate.visible }));
const redirect = vi.hoisted(() => vi.fn((href: string) => {
  throw new Error(`NEXT_REDIRECT ${href}`);
}));
vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/tarot/start" }));

const num = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

afterEach(() => {
  cleanup();
  redirect.mockClear();
});

async function renderBridge() {
  gate.visible = true;
  const view = render(await TarotStartPage());
  const links = within(screen.getByRole("list", { name: "타로 고르기" })).getAllByRole("link");
  return { ...view, links };
}

describe("/tarot/start, the 다리 화면 (owner 2026-10-16)", () => {
  it("does not exist while premium is not visible here: straight on to today's question builder", async () => {
    gate.visible = false;
    await expect(TarotStartPage()).rejects.toThrow("NEXT_REDIRECT /tarot/new?new=1");
    expect(redirect).toHaveBeenCalledWith("/tarot/new?new=1");
  });

  it("offers 일반 타로 (the gold one, today's 3-card flow) and 켈틱 크로스 10장 with its price, both into the same builder", async () => {
    const { container, links } = await renderBridge();
    expect(screen.getByRole("heading", { level: 1, name: "어떤 타로를 볼까요?" })).toBeTruthy();
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/tarot/new?new=1", "/tarot/new?new=1&spread=deep"]);
    expect(links[0]!.textContent).toContain("일반 타로");
    expect(links[0]!.textContent).toContain("카드 3장");
    expect(links[1]!.textContent).toContain("켈틱 크로스 10장");
    expect(links[1]!.textContent).toContain(won(PREMIUM["tarot-deep"].krw));
    expect(links[1]!.textContent).not.toContain("심층 타로");
    // One gold choice on the screen: the free flow stays the main one.
    expect(container.querySelectorAll("[data-primary]")).toHaveLength(1);
    expect(links[0]!.hasAttribute("data-primary")).toBe(true);
    expect(container.textContent).not.toMatch(/베타/);
    expect(metadata.robots).toMatchObject({ index: false });
  });

  it("looks like saju step 1 with tarot's own cast: a back-to-home bar, the question in a bubble, the astrologer cat leading and the librarian rabbit", async () => {
    await renderBridge();
    expect(screen.getByRole("link", { name: "홈으로" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("타로 보기")).toBeTruthy();
    expect(screen.getByRole("button", { name: "별을 읽는 점성술사 고양이" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "기록하는 사서 토끼" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /한복/ })).toBeNull();
  });

  it("says what each one holds, every number from config: today's free first reading and price, the 10-card length and follow-ups", async () => {
    const deep = PREMIUM["tarot-deep"];
    const { links } = await renderBridge();
    expect(links[0]!.textContent).toContain(`첫 풀이 하루 ${times(SITE.beta.teaserPerDay)} 무료`);
    expect(links[0]!.textContent).toContain(`이어서 물어보기 ${SITE.reading.followUps}번`);
    expect(links[1]!.textContent).toContain(`약 ${num(deep.approxChars)}자`);
    expect(links[1]!.textContent).toContain(`이어서 물어보기 ${deep.followUps}번`);
  });

  it("shows each price the same way, a chip at the end of the scope line (owner 2026-10-20: 금액란 통일)", async () => {
    const { links } = await renderBridge();
    const chips = links.map((link) => link.querySelector("[data-price]")?.textContent);
    expect(chips).toEqual([won(SITE.price.tarotStandardKrw), won(PREMIUM["tarot-deep"].krw)]);
    expect(links[0]!.textContent).not.toContain("전체 풀이");
  });

  it("reads the 10-card counts from PREMIUM at render time, never a hard-coded copy", async () => {
    const deep = PREMIUM["tarot-deep"];
    const saved = { followUps: deep.followUps, approxChars: deep.approxChars };
    deep.followUps = 7;
    deep.approxChars = 4321;
    try {
      const { links } = await renderBridge();
      expect(links[1]!.textContent).toContain("약 4,321자");
      expect(links[1]!.textContent).toContain("이어서 물어보기 7번");
    } finally {
      Object.assign(deep, saved);
    }
  });

  it("draws a small spread on each card (three backs in a fan, the cross and staff of ten), hidden from screen readers", async () => {
    const { links } = await renderBridge();
    const three = links[0]!.querySelector("[data-spread]");
    const celtic = links[1]!.querySelector("[data-spread]");
    expect(three?.getAttribute("data-spread")).toBe("three");
    expect(celtic?.getAttribute("data-spread")).toBe("celtic");
    for (const art of [three!, celtic!]) {
      expect(art.getAttribute("aria-hidden")).toBe("true");
      expect(art.getAttribute("focusable")).toBe("false");
    }
    expect(three!.querySelectorAll("[data-back]")).toHaveLength(3);
    expect(celtic!.querySelectorAll("[data-back]")).toHaveLength(10);
    // The pictures add nothing to the link names.
    expect(links[0]!.querySelector("[data-spread] title, [data-spread] text")).toBeNull();
  });
});
