// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BIRTH_CARDS, pairCardOf } from "@/lib/birthCard";
import { SITE } from "@/lib/config";
import { findArticle } from "@/lib/guide";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import { NowGuide } from "@/components/seo/toolGuides";
import BirthCardPage, { metadata as formMetadata } from "./page";
import BirthCardResultPage, { generateMetadata, generateStaticParams } from "./[card]/page";

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: "/birth-card" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => nav.pathname,
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// next/link as a plain anchor that shows whether it prefetches, so the list's links can be checked.
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children?: ReactNode } & Record<string, unknown>) => (
    <a href={href} data-prefetch={prefetch === false ? "false" : undefined} {...rest}>
      {children}
    </a>
  ),
}));

const params = (card: string) => ({ params: Promise.resolve({ card }) }) as never;
/** A year, month or day of a birth date, as it could leak into an address. */
const DATEY = /19\d\d|20\d\d|\d{1,2}월|\d{1,2}일/;

let setItem: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  setItem = vi.spyOn(Storage.prototype, "setItem");
});

afterEach(() => {
  cleanup();
  nav.push.mockClear();
  nav.pathname = "/birth-card";
  vi.restoreAllMocks();
  const n = navigator as { share?: unknown; clipboard?: unknown };
  delete n.share;
  delete n.clipboard;
});

function pick(scope: HTMLElement, year: string, month: string, day: string) {
  fireEvent.change(within(scope).getByLabelText("태어난 연도"), { target: { value: year } });
  fireEvent.change(within(scope).getByLabelText("태어난 월"), { target: { value: month } });
  fireEvent.change(within(scope).getByLabelText("태어난 일"), { target: { value: day } });
}

describe("/birth-card, the form", () => {
  it("asks for a birth date with the app's date fields and finds the card on 내 카드 찾기, with nothing but the card's slug in the address", () => {
    render(<BirthCardPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("나를 닮은 타로 카드");
    const form = screen.getByRole("button", { name: "내 카드 찾기" }).closest("form")!;
    expect(form.getAttribute("action")).toBeNull();
    pick(form, "1990", "5", "15");
    fireEvent.click(within(form).getByRole("button", { name: "내 카드 찾기" }));
    // 1+9+9+0+0+5+1+5 = 30 → 3 여황제
    expect(nav.push).toHaveBeenCalledExactlyOnceWith("/birth-card/empress");
    // The date is kept nowhere: no storage write, no field with a name a plain submit would send.
    expect(setItem).not.toHaveBeenCalled();
    expect(form.querySelectorAll("[name]")).toHaveLength(0);
  });

  it("turns a lunar date into its solar day first (음력 2000-01-01 is 2000-02-05: 2+0+0+0+0+2+0+5 = 9, 은둔자)", () => {
    render(<BirthCardPage />);
    const form = screen.getByRole("button", { name: "내 카드 찾기" }).closest("form")!;
    fireEvent.click(within(form).getByRole("button", { name: "음력" }));
    pick(form, "2000", "1", "1");
    fireEvent.click(within(form).getByRole("button", { name: "내 카드 찾기" }));
    expect(nav.push).toHaveBeenCalledExactlyOnceWith("/birth-card/hermit");
  });

  it("says what is missing and goes nowhere until the date is whole", () => {
    render(<BirthCardPage />);
    const form = screen.getByRole("button", { name: "내 카드 찾기" }).closest("form")!;
    fireEvent.change(within(form).getByLabelText("태어난 연도"), { target: { value: "1990" } });
    fireEvent.click(within(form).getByRole("button", { name: "내 카드 찾기" }));
    expect(screen.getByRole("alert").textContent).toBe("생년월일을 끝까지 골라 주세요");
    expect(nav.push).not.toHaveBeenCalled();
    // Picking again clears the message at once.
    fireEvent.change(within(form).getByLabelText("태어난 월"), { target: { value: "5" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses a day after today in Korea and goes nowhere", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T12:00:00+09:00"));
    try {
      render(<BirthCardPage />);
      const form = screen.getByRole("button", { name: "내 카드 찾기" }).closest("form")!;
      pick(form, "2026", "12", "31");
      fireEvent.click(within(form).getByRole("button", { name: "내 카드 찾기" }));
      expect(screen.getByRole("alert").textContent).toBe("오늘 이후의 날짜는 고를 수 없어요.");
      expect(nav.push).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("explains the rule and links all 22 cards, each by its slug alone", () => {
    const { container } = render(<BirthCardPage />);
    expect(container.textContent).toContain("1+9+9+0+0+5+1+5");
    const list = screen.getByRole("navigation", { name: "메이저 아르카나 22장" });
    const hrefs = within(list).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(BIRTH_CARDS.map((card) => `/birth-card/${card.slug}`));
    // 22 links on one screen: none is prefetched before it is tapped.
    for (const a of within(list).getAllByRole("link")) expect(a.getAttribute("data-prefetch"), a.textContent ?? "").toBe("false");
    expect(container.textContent).toContain("재미로 보는 테스트예요");
  });

  it("is found from 지금의 한 장's guide, where the free tools link each other", () => {
    render(<NowGuide />);
    expect(screen.getByRole("link", { name: "나를 닮은 타로 카드" }).getAttribute("href")).toBe("/birth-card");
  });

  it("has its own title, description and canonical, with the site's preview image", () => {
    expect(formMetadata.title).toBe("나를 닮은 타로 카드 · 생년월일 탄생 카드 테스트");
    expect(formMetadata.alternates?.canonical).toBe("/birth-card");
    expect((formMetadata.openGraph as { images: Array<{ url: string }> }).images[0]?.url).toBe("/opengraph-image");
  });
});

describe("/birth-card/<slug>, the result", () => {
  it("is built for exactly the 22 slugs", () => {
    expect(generateStaticParams()).toEqual(BIRTH_CARDS.map((card) => ({ card: card.slug })));
  });

  it.each(BIRTH_CARDS.map((card) => [card.slug, card] as const))("%s: the Starlog face, the name, three traits, the question, the nudge and the ways on", async (slug, card) => {
    nav.pathname = `/birth-card/${slug}`;
    const { container } = render(await BirthCardResultPage(params(slug)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(card.name);
    expect(container.textContent).toContain("나를 닮은 타로 카드");

    // The face is the Starlog deck's, whatever this device picked; never a 1909 scan, never missing.
    const face = screen.getByRole("img", { name: `${card.name} 타로 카드` }) as HTMLImageElement;
    expect(face.getAttribute("src")).toBe(`/cards/starlog/${card.cardId}-sm.webp`);
    expect(face.getAttribute("srcset")).toContain(`/cards/starlog/${card.cardId}.webp 600w`);
    for (const img of container.querySelectorAll("img")) expect(img.getAttribute("src") ?? "", "1909 art").not.toMatch(/rws1909|^\/cards\/(major|cups|wands|swords|pentacles)-/);

    const traits = screen.getByRole("list", { name: "이런 사람이에요" });
    expect(within(traits).getAllByRole("listitem").map((li) => li.textContent)).toEqual([...card.traits]);
    expect(container.textContent).toContain(card.asks);
    expect(container.textContent).toContain(card.nudge);

    // One gold call to a reading, then a friend's birthday (the form below), the free one-card and the card's guide.
    // Worded so the birth card is not taken for part of the reading (it draws its own three cards).
    expect(screen.getByRole("link", { name: /내 고민도 타로로 보기/ }).getAttribute("href")).toBe("/tarot/start");
    expect(container.textContent).not.toContain("이 카드로 지금 고민 보기");

    // 짝 카드 (10–21): the card its two digits add up to, with the sum, its first trait and its page.
    const pair = pairCardOf(card);
    const slot = screen.queryByRole("region", { name: "짝 카드" });
    if (pair) {
      expect(slot, slug).toBeTruthy();
      const [tens, ones] = String(card.number);
      expect(slot!.textContent).toContain(`${tens}+${ones} = ${pair.number}`);
      const link = within(slot!).getByRole("link");
      expect(link.getAttribute("href")).toBe(`/birth-card/${pair.slug}`);
      expect(link.textContent).toContain(pair.name);
      expect(link.textContent).toContain(pair.traits[0]);
      for (const img of slot!.querySelectorAll("img")) expect(img.getAttribute("src") ?? "").toMatch(/^\/cards\/(starlog|backs)\//);
    } else {
      expect(slot, slug).toBeNull();
    }
    expect(screen.getByRole("link", { name: "친구 생일로도 해 보기" }).getAttribute("href")).toBe("#find");
    expect(container.querySelector("#find")?.textContent).toContain("내 카드 찾기");
    expect(screen.getByRole("link", { name: /지금의 한 장/ }).getAttribute("href")).toBe("/now");
    const guide = screen.getByRole("link", { name: new RegExp(`${card.name} 카드 뜻`) }).getAttribute("href")!;
    expect(findArticle(guide.replace(/^.*\/guide\//, ""))?.cardId).toBe(card.cardId);
    expect(screen.getByRole("button", { name: "공유하기" })).toBeTruthy();

    // No link on the page carries a date.
    for (const a of container.querySelectorAll("a")) expect(a.getAttribute("href") ?? "", a.textContent ?? "").not.toMatch(DATEY);
  });

  it("shares the card's own page, its name in the text and never a date", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    render(await BirthCardResultPage(params("hermit")));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    });
    // The text ends in the link too: some apps show the text only (owner 2026-10-23 "텍스트만 날라간다").
    expect(share).toHaveBeenCalledExactlyOnceWith({ title: SITE.nameKo, text: `나를 닮은 타로 카드는 은둔자 · 스타로그
${SITE.url}/birth-card/hermit`, url: `${SITE.url}/birth-card/hermit` });
  });

  it("shows 운명의 수레바퀴's 짝 카드 as 마법사 and 태양's as 운명의 수레바퀴: one step of adding per page", async () => {
    const { unmount } = render(await BirthCardResultPage(params("wheel-of-fortune")));
    expect(within(screen.getByRole("region", { name: "짝 카드" })).getByRole("link").getAttribute("href")).toBe("/birth-card/magician");
    unmount();
    render(await BirthCardResultPage(params("sun")));
    expect(within(screen.getByRole("region", { name: "짝 카드" })).getByRole("link").getAttribute("href")).toBe("/birth-card/wheel-of-fortune");
  });

  it("finds a friend's card from the form below it, onto that card's page", async () => {
    nav.pathname = "/birth-card/hermit";
    render(await BirthCardResultPage(params("hermit")));
    const find = document.getElementById("find")!;
    // The page's one gold button is the reading; this one is quieter.
    pick(find, "1985", "7", "23");
    fireEvent.click(within(find).getByRole("button", { name: "내 카드 찾기" }));
    expect(nav.push).toHaveBeenCalledExactlyOnceWith("/birth-card/strength");
  });

  it("gives each card its own title, description, canonical and preview image", async () => {
    const titles = new Set<string>();
    for (const card of BIRTH_CARDS) {
      const meta = await generateMetadata(params(card.slug));
      expect(meta.title).toBe(`나를 닮은 타로 카드 · ${card.name}`);
      titles.add(String(meta.title));
      const description = String(meta.description);
      expect(description).toContain(card.name);
      expect(description.length, description).toBeGreaterThanOrEqual(60);
      expect(description.length, description).toBeLessThanOrEqual(130);
      expect(meta.alternates?.canonical).toBe(`/birth-card/${card.slug}`);
      const og = meta.openGraph as { url: string; images: Array<{ url: string; width: number; height: number; alt: string }> };
      expect(og.url).toBe(`/birth-card/${card.slug}`);
      expect(og.images).toEqual([{ url: `/api/og/birth-card/${card.slug}`, width: 1200, height: 630, alt: `나를 닮은 타로 카드 · ${card.name} · 스타로그` }]);
    }
    expect(titles.size).toBe(22);
  });

  it("is the not-found page for any other slug", async () => {
    await expect(BirthCardResultPage(params("major-09-hermit"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata(params("nope"))).toEqual(NOT_FOUND_METADATA);
  });
});
