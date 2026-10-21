import { expect, type Page, test } from "@playwright/test";

/**
 * 방문 통계 consent (components/seo/ConsentBanner.tsx, GoogleAnalytics.tsx) in a browser that has not answered yet: the
 * config's stored 거부 is dropped here. The date is the browser's (page.clock), since the banner and GA go by it. Google's
 * hosts are blocked, so nothing reaches GA: the specs assert on the requests the page makes.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const TITLE = "방문 통계를 켜도 될까요?";
const GTAG = "https://www.googletagmanager.com/gtag/js?id=G-8X11ZGFZKY";

async function blockGoogle(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.context().route(
    (url) => /google|doubleclick/.test(url.hostname),
    async (route) => {
      requests.push(route.request().url());
      await route.abort();
    },
  );
  return requests;
}

const at = (page: Page, iso: string) => page.clock.setFixedTime(new Date(iso));
const banner = (page: Page) => page.getByRole("region", { name: TITLE });

test("before 2026-10-30 00:00 KST: no banner and no request to Google", async ({ page }) => {
  const requests = await blockGoogle(page);
  await at(page, "2026-10-29T23:50:00+09:00");
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(banner(page)).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("from then: the banner asks with two equal buttons above the tab bar; 거부 closes it for good and nothing goes to Google", async ({ page }) => {
  const requests = await blockGoogle(page);
  await at(page, "2026-10-30T10:00:00+09:00");
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText("어떤 화면을 많이 보는지 알아보려고 Google 애널리틱스를 써요.");
  await expect(banner(page).getByRole("link", { name: "자세히" })).toHaveAttribute("href", "/privacy#analytics");

  const allow = banner(page).getByRole("button", { name: "허용" });
  const deny = banner(page).getByRole("button", { name: "거부" });
  const [a, d] = [await allow.boundingBox(), await deny.boundingBox()];
  expect(Math.abs(a!.width - d!.width)).toBeLessThanOrEqual(1);
  expect(a!.height).toBe(d!.height);
  const look = (el: HTMLElement) => {
    const style = getComputedStyle(el);
    return [style.backgroundColor, style.color, style.borderColor, style.fontWeight, style.fontSize].join(" ");
  };
  expect(await allow.evaluate(look)).toBe(await deny.evaluate(look));

  if (test.info().project.name === "mobile") {
    // Above the bottom tab bar, which stays reachable.
    const bar = await page.getByRole("navigation", { name: "주요 메뉴" }).boundingBox();
    const box = await banner(page).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y);
  }
  // Nothing of the page stays under it: at the end, the footer is above it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect
    .poll(async () => {
      const footer = await page.getByRole("contentinfo").boundingBox();
      const box = await banner(page).boundingBox();
      return footer!.y + footer!.height <= box!.y + 1;
    })
    .toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));

  await deny.click();
  await expect(banner(page)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("starlog.analytics.consent") ?? "null")?.choice)).toBe("denied");
  await page.goto("/tarot/new");
  await expect(page.getByRole("main")).toBeVisible();
  await page.reload();
  await page.waitForTimeout(1000);
  await expect(banner(page)).toHaveCount(0);
  expect(requests.filter((url) => url.includes("googletagmanager"))).toEqual([]);
});

test("허용 loads gtag.js on this page, without a reload, and counts it with a redacted page_view", async ({ page }) => {
  const requests = await blockGoogle(page);
  await at(page, "2026-10-30T10:00:00+09:00");
  await page.goto("/?visit=first&utm_source=threads");
  await expect(banner(page)).toBeVisible();
  const gtag = page.waitForRequest(GTAG);
  await banner(page).getByRole("button", { name: "허용" }).click();
  await gtag;
  await expect(banner(page)).toHaveCount(0);
  expect(requests).toContain(GTAG);
  const origin = new URL(page.url()).origin;
  const views = () =>
    page.evaluate(() =>
      ((window as unknown as { dataLayer?: IArguments[] }).dataLayer ?? []).map((args) => [...args]).filter((args) => args[0] === "event" && args[1] === "page_view"),
    );
  expect(await views()).toEqual([["event", "page_view", { page_location: `${origin}/?utm_source=threads`, page_title: expect.any(String) }]]);

  // A client-side navigation: one more page_view, the new page's own title, the page before as referrer.
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "내 정보" }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect.poll(async () => (await views()).length).toBe(2);
  expect((await views())[1]).toEqual(["event", "page_view", { page_location: `${origin}/me`, page_title: "내 정보 · 스타로그", page_referrer: `${origin}/?utm_source=threads` }]);
});
