import { expect, type Locator, type Page, test } from "@playwright/test";
import { cardTable, pickCard, tableCards } from "./cards";
import { ownerPass } from "./opening";

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
  // The transfer abroad told before consent (제28조의8 제2항): recipient and country, items, retention, no disadvantage.
  for (const part of ["Google LLC(미국)", "방문한 페이지(공유·초대 번호는 가림)", "기기 정보", "IP 주소", "쿠키 식별값", "최대 14개월", "거부해도 이용에 제한은 없어요"]) await expect(banner(page)).toContainText(part);
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

/** Its own client address, so the per-IP limiters never span tests. */
async function ownAddress(page: Page) {
  // cf-connecting-ip is the one the Workers preview reads (as bonds.spec.ts sets it); x-forwarded-for, next dev's.
  const n = () => Math.floor(Math.random() * 250);
  const ip = `10.8.${n()}.${n()}`;
  await page.context().setExtraHTTPHeaders({ "cf-connecting-ip": ip, "x-forwarded-for": ip });
}

/**
 * The page's key control can be used while the banner is up: brought to the middle of the window, nothing lies over
 * its centre (the banner included), and a click would land on it.
 */
async function usable(control: Locator) {
  await expect(control).toBeVisible();
  await control.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const onTop = await control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && el.contains(hit);
  });
  expect(onTop, "nothing covers the control").toBe(true);
  await control.click({ trial: true });
}

/**
 * A tarot reading opened with the owner pass (as share.spec.ts makes one), kept on this device four times (a 내 기록
 * long enough that its footer is not where the floating button sits) and shared once; returns the share's path.
 */
async function savedReadings(page: Page): Promise<string> {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const input = { topicId: "contact", whoId: "us", whenId: "month", question: "이번 달 그 사람에게 먼저 연락해도 될까?", conditions: [], note: "" };
  const draw = await (await page.request.post("/api/tarot/draw", { data: { templateId: "relationship-contact", picks: [2, 9, 15] } })).json();
  const res = await (await page.request.post("/api/tarot/reading", { data: { drawToken: draw.drawToken, input, unlock: { method: "owner" } } })).json();
  const chapters = [1, 2, 3, 4].map((n) => ({ id: `consentaa0${n}`, kind: "tarot", createdAt: Date.now() - n * 60_000, chapterToken: res.chapterToken, turns: [], followUpsLeft: 3, question: input.question, conditions: [], note: "", cards: draw.cards, reading: res.reading }));
  await page.addInitScript((value) => window.localStorage.setItem("starlog.chapters", value), JSON.stringify(chapters));
  const share = await page.request.post("/api/share", { data: { chapterToken: res.chapterToken, reading: res.reading }, headers: { origin } });
  expect(share.ok(), await share.text()).toBe(true);
  return (await share.json()).path as string;
}

async function settleAnimations(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
}

/** gtag.js ends a page's engagement (user_engagement) when the page is hidden: as when the visitor switches apps. */
async function hidePage(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
  });
}

test.describe("unanswered on 10/30: the key controls stay usable under the banner", () => {
  test.beforeEach(async ({ page }) => {
    await blockGoogle(page);
    await ownAddress(page);
    // A clock that runs (from 10/30): the draw table tells a second tap from a double tap by the time between them.
    await page.clock.install({ time: new Date("2026-10-30T10:00:00+09:00") });
  });

  // A guest is sent from checkout to log in (pay-flow.spec.ts, on the dev server, pays as a logged-in owner).
  test("/pay/checkout as a guest: the login it leads to, and 카카오로 계속하기", async ({ page }) => {
    await page.goto("/pay/checkout?product=saju&returnTo=%2Fme");
    await expect(page).toHaveURL(/\/login\?next=%2Fpay%2Fcheckout/, { timeout: 30_000 });
    await expect(banner(page)).toBeVisible();
    await page.getByRole("checkbox", { name: "만 14세 이상이에요" }).check();
    await usable(page.getByRole("button", { name: "카카오로 계속하기" }));
  });

  test("/tarot/draw: three cards picked, then 결과 보기", async ({ page }) => {
    const flow = { who: "us", topicId: "contact", when: "month", conditions: { relation: "알아가는 중", "recent-contact": "뜸해짐" }, note: "" };
    // Saved just now by the page's clock (a 30-minute-old flow starts clean).
    await page.addInitScript((value) => window.sessionStorage.setItem("starlog.tarot-flow", JSON.stringify({ savedAt: Date.now(), ...value })), flow);
    await page.goto("/tarot/draw?instant=1");
    await expect(banner(page)).toBeVisible();
    await expect(tableCards(page)).toHaveCount(78);
    await settleAnimations(page);
    // On this step the banner waits at the end of the page, never over the card table.
    const table = await cardTable(page).boundingBox();
    const box = await banner(page).boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(table!.y + table!.height);
    for (let i = 0; i < 3; i++) await pickCard(page);
    await expect(page.getByText("모두 골랐어요")).toBeVisible();
    await usable(page.getByRole("button", { name: "결과 보기" }));
  });

  test("/story and /s/<id>: 새로 물어보기 (the floating one on phones) and the shared reading's 타로 보기", async ({ page }) => {
    await ownerPass(page, test.info());
    const share = await savedReadings(page);
    await page.goto("/story");
    await expect(banner(page)).toBeVisible();
    await usable(page.getByRole("link", { name: "새로 물어보기" }).filter({ visible: true }));
    await page.goto(share);
    await expect(banner(page)).toBeVisible();
    await usable(page.getByRole("link", { name: "타로 보기" }));
  });
});

test("what reaches GA's collect endpoint carries only redacted dl, dr and dt (page_view and user_engagement, /b/<code> then /pay/success?paymentKey=…)", async ({ page }) => {
  // gtag.js itself is fetched; every hit to the collect endpoint is caught here and answered locally, so nothing is sent.
  const hits: Array<{ raw: string; params: Record<string, string> }> = [];
  await page.context().route(
    (url) => /google|doubleclick/.test(url.hostname),
    async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "www.googletagmanager.com" && url.pathname === "/gtag/js") return route.continue();
      if (url.pathname.endsWith("/g/collect")) {
        const body = route.request().postData() ?? "";
        for (const line of body ? body.split(/\r?\n/).filter(Boolean) : [""]) {
          hits.push({ raw: `${url.search} ${line}`, params: { ...Object.fromEntries(url.searchParams), ...Object.fromEntries(new URLSearchParams(line)) } });
        }
        return route.fulfill({ status: 204 });
      }
      return route.abort();
    },
  );
  await page.clock.install({ time: new Date("2026-10-30T10:00:00+09:00") });
  await page.addInitScript(() => window.localStorage.setItem("starlog.analytics.consent", JSON.stringify({ choice: "granted", at: "2026-10-30T01:00:00.000Z" })));
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const event = (name: string, path: string) => hits.find((hit) => hit.params.en === name && hit.params.dl === `${origin}${path}`);

  // Each page: its page_view, a moment of use (a tap), then hidden, which sends its user_engagement.
  await page.goto("/b/K7Q2ZP?ref=zz#yy");
  await expect.poll(() => event("page_view", "/b/"), { timeout: 20_000 }).toBeTruthy();
  expect(event("page_view", "/b/")!.params.dt).toBe("별자리 인연 초대 · 스타로그");
  await page.mouse.click(10, 300);
  await page.waitForTimeout(3_000);
  await hidePage(page);
  await expect.poll(() => event("user_engagement", "/b/"), { timeout: 20_000 }).toBeTruthy();

  // The next page names the /b/ page as its referrer, redacted the same way.
  await page.goto("/pay/success?paymentKey=tgen_SECRET1&orderId=ORDER_SECRET2&amount=2900", { referer: `${origin}/b/K7Q2ZP?ref=zz` });
  await expect.poll(() => event("page_view", "/pay/success"), { timeout: 20_000 }).toBeTruthy();
  expect(event("page_view", "/pay/success")!.params.dr).toBe(`${origin}/b/`);
  await page.mouse.click(10, 300);
  await page.waitForTimeout(3_000);
  await hidePage(page);
  await expect.poll(() => event("user_engagement", "/pay/success"), { timeout: 20_000 }).toBeTruthy();
  expect(event("user_engagement", "/pay/success")!.params.dr).toBe(`${origin}/b/`);

  for (const hit of hits) {
    for (const secret of ["K7Q2ZP", "ref=zz", "tgen_SECRET1", "ORDER_SECRET2", "paymentKey", "orderId", "amount=2900"]) expect(hit.raw, `${hit.params.en}: ${secret}`).not.toContain(secret);
    expect([`${origin}/b/`, `${origin}/pay/success`]).toContain(hit.params.dl);
  }
});
