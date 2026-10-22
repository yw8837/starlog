import { mkdirSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * 2027년 나의 키워드 (free test ②): a birth date finds the 일주 in the browser and opens /2027-keyword/<slug>; the
 * date never reaches an address, a request or storage. The result shares its own page and card, and offers 2027
 * 신년운세 only where that product is visible (the dev server has premium off, so the visible case answers the status
 * call here), the saju start always. KEYWORD_SHOTS=<dir> also saves the form and three results per project.
 */

const SITE_URL = "https://starlog.yeolmaeapps.kr";
/** 1993-07-19: (days since 1970-01-01 + 17) mod 60 = 37, a 辛丑 day. */
const BIRTH = { year: "1993", month: "7", day: "19" };
const SLUG = "sin-chuk";

const PREMIUM_IDS = ["tarot-deep", "match", "newyear-2027"];
const premiumVisible = (page: Page) =>
  page.route("**/api/premium/status", (route) =>
    route.fulfill({ json: { products: PREMIUM_IDS.map((id) => ({ id, open: true, visible: true, opensAt: null, closesAt: null })) } }),
  );

async function shot(page: Page, info: TestInfo, name: string) {
  const dir = process.env.KEYWORD_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${dir}/${info.project.name}-${name}.png`, fullPage: true, animations: "disabled" });
}

async function fillBirth(page: Page, scope = page.locator("main")) {
  await scope.getByLabel("태어난 연도").selectOption(BIRTH.year);
  await scope.getByLabel("태어난 월").selectOption(BIRTH.month);
  await scope.getByLabel("태어난 일").selectOption(BIRTH.day);
}

test("the form finds the 일주 and opens its page by the slug alone; the date stays in the page", async ({ page }, info) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.method()} ${request.url()} ${request.postData() ?? ""}`));
  await page.addInitScript(() => {
    const shared: ShareData[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => void shared.push(data) });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  });
  await premiumVisible(page);

  await page.goto("/2027-keyword");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2027년 나의 키워드");
  await shot(page, info, "form");
  // An unfinished date says so and stays.
  await page.getByLabel("태어난 연도").selectOption(BIRTH.year);
  await page.getByRole("button", { name: "내 키워드 보기" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("생년월일을 끝까지 골라 주세요");
  await expect(page).toHaveURL(/\/2027-keyword$/);

  await fillBirth(page);
  await page.getByRole("button", { name: "내 키워드 보기" }).click();
  await page.waitForURL(`**/2027-keyword/${SLUG}`);
  expect(new URL(page.url()).pathname).toBe(`/2027-keyword/${SLUG}`);
  expect(new URL(page.url()).search).toBe("");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("신축일주의 2027년");
  await expect(page.locator("main")).toContainText("시험대 넘기");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${SITE_URL}/api/og/2027-keyword/${SLUG}`);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `${SITE_URL}/2027-keyword/${SLUG}`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE_URL}/2027-keyword/${SLUG}`);

  // 공유하기 hands the system sheet this 일주's page and its keyword, nothing else.
  await page.getByRole("button", { name: "공유하기" }).click();
  const shared = (await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared)) as ShareData[];
  expect(shared).toHaveLength(1);
  expect(shared[0]!.url).toBe(`${SITE_URL}/2027-keyword/${SLUG}`);
  expect(shared[0]!.text).toContain("시험대 넘기");

  // The CTAs: 2027 신년운세 where it is visible, the saju start always.
  await expect(page.getByRole("link", { name: "2027 신년운세 깊게 보기" })).toHaveAttribute("href", "/premium/newyear-2027");
  await expect(page.getByRole("link", { name: "사주 풀이 보기" })).toHaveAttribute("href", "/saju/start?new=1");
  await shot(page, info, `result-${SLUG}`);

  // Nowhere: no request (address or body) and no storage holds the date.
  const date = /1993|19930719|1993-0?7-19/;
  expect(requests.filter((line) => date.test(line))).toEqual([]);
  const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage, ...window.sessionStorage }) + document.cookie);
  expect(stored).not.toMatch(date);

  await page.getByRole("link", { name: "사주 풀이 보기" }).click();
  await page.waitForURL(/\/saju\/(start|new)/);
});

test("a shared link shows that 일주 to anyone, with 내 키워드 찾기; premium off falls back to the saju start", async ({ page }, info) => {
  await page.goto("/2027-keyword/gap-ja");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("갑자일주의 2027년");
  await expect(page.getByRole("heading", { name: "내 키워드 찾기" })).toBeVisible();
  await expect(page.getByRole("link", { name: "사주 풀이 보기" })).toHaveAttribute("href", "/saju/start?new=1");
  // The dev server runs with premium off: once the status has answered, no product is offered.
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: "2027 신년운세 깊게 보기" })).toHaveCount(0);
  await expect(page.locator('main a[href^="/premium"]')).toHaveCount(0);
  await shot(page, info, "result-gap-ja");

  // 친구 생일로도 해 보기 goes down to the form, and a friend's date opens the friend's 일주.
  await page.getByRole("link", { name: "친구 생일로도 해 보기" }).click();
  await expect(page).toHaveURL(/#find$/);
  const find = page.locator("#find");
  await expect(find).toBeInViewport();
  await fillBirth(page, find);
  await find.getByRole("button", { name: "내 키워드 보기" }).click();
  await page.waitForURL(`**/2027-keyword/${SLUG}`);
  expect(new URL(page.url()).search).toBe("");

  // The same 일주 again (one's own birth on a page shared with that 일주): back up to the result, no new page.
  await page.locator("#find").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await fillBirth(page, page.locator("#find"));
  await page.locator("#find").getByRole("button", { name: "내 키워드 보기" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(new URL(page.url()).pathname).toBe(`/2027-keyword/${SLUG}`);
});

test("each 일주's card is a PNG, an unknown one a 404; 丁未 meets its own year", async ({ page, request }, info) => {
  const image = await request.get(`/api/og/2027-keyword/${SLUG}`);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect([...(await image.body()).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect((await request.get("/api/og/2027-keyword/gap-chuk")).status()).toBe(404);
  expect((await request.get("/2027-keyword/gap-chuk")).status()).toBe(404);

  await page.goto("/2027-keyword/jeong-mi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("정미일주의 2027년");
  await expect(page.locator("main")).toContainText("같은 간지");
  await shot(page, info, "result-jeong-mi");
});
