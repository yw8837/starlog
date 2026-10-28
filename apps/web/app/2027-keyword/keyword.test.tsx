// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ILJU, KEYWORD_PATH, iljuBySlug } from "@/lib/keyword2027";
import { STEMS } from "@starlog/core";
import { STEM_GODS, contentOf } from "@/lib/keyword2027Content";
import { PREMIUM_IDS } from "@/lib/premium/products";
import { resetPremiumStatusForTests } from "@/lib/premium/status";

const push = vi.hoisted(() => vi.fn());
const nav = vi.hoisted(() => ({ pathname: "/2027-keyword" }));
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
);
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => nav.pathname }));

const { default: KeywordTestPage, metadata: formMetadata } = await import("./page");
const { default: KeywordResultPage, generateMetadata, generateStaticParams, dynamicParams } = await import("./[ilju]/page");
const { KeywordForm } = await import("./KeywordForm");
const { KeywordCtas } = await import("./[ilju]/KeywordCtas");
const { TodayGuide } = await import("@/components/seo/toolGuides");

const params = (ilju: string) => ({ params: Promise.resolve({ ilju }) }) as never;

/** GET /api/premium/status as the server answers it, every product visible (or not). */
function premiumStatus(visible: boolean) {
  const fetchMock = vi.fn(async () => Response.json({ products: PREMIUM_IDS.map((id) => ({ id, open: visible, visible, opensAt: null, closesAt: null })) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function pick(label: string, value: string | number) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });
}

beforeEach(() => {
  nav.pathname = KEYWORD_PATH;
  push.mockClear();
  notFound.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetPremiumStatusForTests();
});

describe("the form", () => {
  it("goes to the 일주's page by its slug only: no birth date in the address, nothing stored, nothing sent", () => {
    const fetchMock = premiumStatus(false);
    const stored = vi.spyOn(Storage.prototype, "setItem");
    render(<KeywordForm />);
    pick("태어난 연도", 2000);
    pick("태어난 월", 1);
    pick("태어난 일", 1);
    fireEvent.click(screen.getByRole("button", { name: "내 키워드 보기" }));
    expect(push).toHaveBeenCalledTimes(1);
    const path = push.mock.calls[0]![0] as string;
    expect(path).toBe("/2027-keyword/mu-o");
    // The only digits in the address are the test's own name.
    expect(path.replace(KEYWORD_PATH, "")).not.toMatch(/\d/);
    expect(stored).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads a lunar date with 윤달 through the same engine", () => {
    render(<KeywordForm />);
    fireEvent.click(screen.getByRole("button", { name: "음력" }));
    pick("태어난 연도", 2020);
    pick("태어난 월", 4);
    pick("태어난 일", 1);
    fireEvent.click(screen.getByRole("checkbox", { name: "윤달이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "내 키워드 보기" }));
    // 음력 2020 윤4월 1일 is 양력 2020-05-23, a 丙寅 day (평달 4월 1일, 2020-04-23, would be 丙申).
    expect(push).toHaveBeenCalledWith("/2027-keyword/byeong-in");
  });

  it("on a shared page of the same 일주, goes back up to the result instead of a push that changes nothing", () => {
    nav.pathname = "/2027-keyword/mu-o";
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    render(<KeywordForm />);
    pick("태어난 연도", 2000);
    pick("태어난 월", 1);
    pick("태어난 일", 1);
    fireEvent.click(screen.getByRole("button", { name: "내 키워드 보기" }));
    expect(push).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    // Another 일주 still opens its own page.
    pick("태어난 일", 2);
    fireEvent.click(screen.getByRole("button", { name: "내 키워드 보기" }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("asks for every part of the date and goes nowhere until then", () => {
    render(<KeywordForm />);
    pick("태어난 연도", 1990);
    fireEvent.click(screen.getByRole("button", { name: "내 키워드 보기" }));
    expect(screen.getByRole("alert").textContent).toContain("생년월일을 끝까지 골라 주세요");
    expect(push).not.toHaveBeenCalled();
  });

  it("is the test page's one form, with the page's one gold button, and says how the date is used", async () => {
    render(await KeywordTestPage());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("2027년 나의 키워드");
    expect(screen.getByRole("button", { name: "내 키워드 보기" })).toBeTruthy();
    expect(document.body.textContent).toContain("저장하지 않아요");
    expect(document.body.textContent).toContain("재미로 보는 테스트");
    // The app's rule for a birth just after midnight, in plain words.
    expect(document.body.textContent).toContain("자정");
    // The 60 pages are linked from here, each by its slug.
    for (const ilju of ILJU) expect(document.querySelector(`a[href="${KEYWORD_PATH}/${ilju.slug}"]`), ilju.slug).not.toBeNull();
  });

  // SEO audit 2026-10-27 (LOW): the hub was 922 characters; it now shows what 丁未 is to each of the ten day stems.
  it("shows what 丁 and 未 are to each of the ten day stems, from the same table the keywords are written on", async () => {
    render(await KeywordTestPage());
    const table = screen.getByRole("table", { name: /정미년의 두 글자/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(10);
    for (const [i, stem] of STEMS.entries()) {
      const cells = within(rows[i] as HTMLElement).getAllByRole("cell").map((cell) => cell.textContent);
      expect(rows[i]?.textContent, stem).toContain(stem);
      expect(cells, stem).toEqual(expect.arrayContaining([STEM_GODS[stem].stemGod, STEM_GODS[stem].branchGod]));
    }
  });

  it("has its own title, description and canonical", () => {
    expect(formMetadata.title).toBe("2027년 나의 키워드 · 생일로 보는 무료 사주 테스트");
    expect(formMetadata.alternates?.canonical).toBe(KEYWORD_PATH);
  });
});

describe("the 60 result pages", () => {
  it("are built for every 일주, and render on demand when a built copy cannot be read (other addresses: 404, below)", () => {
    expect(generateStaticParams()).toEqual(ILJU.map((ilju) => ({ ilju: ilju.slug })));
    expect(dynamicParams).toBe(true);
  });

  it("all render the 일주's result for anyone, with the share buttons, the CTAs and the form, and never a birth date", async () => {
    premiumStatus(false);
    for (const ilju of ILJU) {
      const content = contentOf(ilju);
      const { container } = render(await KeywordResultPage(params(ilju.slug)));
      expect(screen.getByRole("heading", { level: 1 }).textContent, ilju.slug).toContain(`${ilju.ko}일주의 2027년`);
      const main = within(container.querySelector("main")!);
      expect(main.getByText(content.keyword), ilju.slug).toBeTruthy();
      for (const line of [content.brings, content.watch, content.action]) expect(main.getByText(line), ilju.slug).toBeTruthy();
      expect(main.getByRole("button", { name: "공유하기" })).toBeTruthy();
      expect(main.getByRole("heading", { name: "내 키워드 찾기" })).toBeTruthy();
      expect(main.getByRole("link", { name: "친구 생일로도 해 보기" }).getAttribute("href")).toBe("#find");
      expect(main.getByRole("link", { name: "사주 풀이 보기" }).getAttribute("href")).toBe("/saju/start?new=1");
      // No year, month or day anywhere in a link: the only number is 2027.
      for (const a of container.querySelectorAll("a[href]")) expect(a.getAttribute("href")!.replaceAll("2027", ""), ilju.slug).not.toMatch(/\d{4}/);
      cleanup();
    }
    // Sixty full pages: several seconds when the whole suite shares the machine.
  }, 60_000);

  it("answer 404 for anything that is not one of the 60", async () => {
    await expect(KeywordResultPage(params("gap-chuk"))).rejects.toThrow("404");
    await expect(KeywordResultPage(params("1990-01-01"))).rejects.toThrow("404");
  });

  it("each have their own title, description, canonical and share image", async () => {
    const titles = new Set<string>();
    for (const ilju of ILJU) {
      const meta = await generateMetadata(params(ilju.slug));
      const content = contentOf(ilju);
      expect(meta.title).toBe(`${ilju.ko}일주 2027년 키워드 '${content.keyword}'`);
      titles.add(String(meta.title));
      expect(meta.alternates?.canonical).toBe(`${KEYWORD_PATH}/${ilju.slug}`);
      const og = meta.openGraph as { url?: string; images?: Array<{ url: string; width: number; height: number; alt: string }> };
      expect(og.url).toBe(`${KEYWORD_PATH}/${ilju.slug}`);
      expect(og.images?.[0]).toMatchObject({ url: `/api/og/2027-keyword/${ilju.slug}`, width: 1200, height: 630 });
      expect(og.images?.[0]?.alt).toContain(content.keyword);
    }
    expect(titles.size).toBe(60);
    expect(iljuBySlug("gap-ja")).not.toBeNull();
  });
});

describe("the CTAs", () => {
  const gapja = iljuBySlug("gap-ja")!;

  it("lead to 2027 신년운세 where it is on sale here, and to the saju start", async () => {
    premiumStatus(true);
    render(<KeywordCtas />);
    expect((await screen.findByRole("link", { name: "2027 신년운세 깊게 보기" })).getAttribute("href")).toBe("/premium/newyear-2027");
    expect(screen.getByRole("link", { name: "사주 풀이 보기" }).getAttribute("href")).toBe("/saju/start?new=1");
    expect(gapja.slug).toBe("gap-ja");
  });

  it("fall back to the saju reading entry while premium is off here", async () => {
    const fetchMock = premiumStatus(false);
    render(<KeywordCtas />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("link", { name: "2027 신년운세 깊게 보기" })).toBeNull();
    expect(document.querySelector('a[href^="/premium"]')).toBeNull();
    expect(screen.getByRole("link", { name: "사주 풀이 보기" }).getAttribute("href")).toBe("/saju/start?new=1");
  });

  it("fall back once the product's sales window has closed (2027-12-01), even where premium is visible", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-12-01T00:00:00+09:00"));
    const fetchMock = premiumStatus(true);
    render(<KeywordCtas />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("link", { name: "2027 신년운세 깊게 보기" })).toBeNull();
    expect(screen.getByRole("link", { name: "사주 풀이 보기" }).getAttribute("href")).toBe("/saju/start?new=1");
  });
});

describe("discovery", () => {
  it("is linked once from where the free tools link each other: 오늘의 한 장's 함께 보면 좋은 곳 (the home stays as it is)", () => {
    const { container } = render(<TodayGuide />);
    expect([...container.querySelectorAll(`a[href="${KEYWORD_PATH}"]`)].map((a) => a.textContent)).toEqual(["2027년 나의 키워드"]);
  });
});
