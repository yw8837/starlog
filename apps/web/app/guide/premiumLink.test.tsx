// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import { resetPremiumStatusForTests } from "@/lib/premium/status";

vi.mock("next/script", async () => {
  const { createElement } = await import("react");
  return { default: ({ src }: { src: string }) => createElement("script", { "data-ads-src": src }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/guide/x", notFound: () => { throw new Error("404"); } }));

/** Owner: every premium has a guide article; the article links back to its product where premium is visible. */

const OCT = Date.parse("2026-10-20T12:00:00+09:00");
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
const article = async (slug: string) => render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));

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

describe("the three premium guide articles link their product", () => {
  for (const state of [false, "fail"] as const) {
    it(`show nothing new while premium is ${state === false ? "off" : "unknown"}`, async () => {
      const fetchMock = stub(state);
      const { container } = await article("saju-compatibility");
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/premium/status")).toBe(true));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(container.querySelector('a[href*="/premium/"]')).toBeNull();
      expect(screen.queryByText("이 풀이로 더 깊게 보기")).toBeNull();
    });
  }

  for (const [slug, href] of [["saju-compatibility", "/premium/match"], ["new-year-fortune", "/premium/newyear-2027"], ["celtic-cross-spread", "/premium/deep-tarot"]] as const) {
    it(`/guide/${slug} links ${href} under its article where premium is visible`, async () => {
      stub(true);
      await article(slug);
      const section = await screen.findByRole("region", { name: "이 풀이로 더 깊게 보기" });
      expect(within(section).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([href]);
    });
  }

  for (const [slug, href, name] of [["saju-compatibility", "/premium/match", "프리미엄 궁합"], ["new-year-fortune", "/premium/newyear-2027", "2027 신년운세"], ["celtic-cross-spread", "/premium/deep-tarot", "켈틱 크로스 10장"]] as const) {
    it(`/guide/${slug}: the server HTML links ${href} in one line, so crawlers find the product page (SEO P1-1)`, async () => {
      stub(true);
      const html = renderToString(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(name);
      // Reading first (review 2026-10-23): the product line comes after 같이 읽어 볼 글, not right under the body.
      expect(html.indexOf(`href="${href}"`)).toBeGreaterThan(html.indexOf("같이 읽어 볼 글"));
    });
  }

  it("leaves every other article as it is", async () => {
    stub(true);
    const { container } = await article("the-hermit");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('a[href*="/premium/"]')).toBeNull();
  });
});
