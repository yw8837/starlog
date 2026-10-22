import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

/**
 * 나를 닮은 타로 카드 (/birth-card): a birth date → the card's own page → 공유하기 → a reading, with the date
 * nowhere in an address or a request, and the Starlog face even on a device that chose the 1909 deck.
 * Full-page shots go to BIRTH_CARD_SHOTS (default test-results/screens/birth-card) as <project>-<name>.png.
 */

const SHOTS = process.env.BIRTH_CARD_SHOTS ?? "test-results/screens/birth-card";
const SITE_URL = "https://starlog.yeolmaeapps.kr";

async function shot(page: Page, info: TestInfo, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // dev-only overlay badge
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-${name}.png`, fullPage: true, animations: "disabled" });
}

async function pick(form: Locator, year: string, month: string, day: string) {
  await form.getByLabel("태어난 연도").selectOption(year);
  await form.getByLabel("태어난 월").selectOption(month);
  await form.getByLabel("태어난 일").selectOption(day);
}

/** The face has loaded: a real picture, not a broken image. */
async function faceLoaded(face: Locator) {
  await expect(face).toBeVisible();
  await expect.poll(() => face.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
}

/** Requests the app made itself (not its build files or pictures), to look for a date in them. */
const ownRequests = (urls: string[]) => urls.filter((url) => !/\/_next\/static\/|\/cards\/|\.woff2?$|fonts\.g/.test(url));

test.beforeEach(async ({ page }) => {
  // This device picked the 1909 deck (내 정보 → 카드 디자인): the birth card is still drawn in the Starlog deck.
  await page.addInitScript(() => window.localStorage.setItem("starlog.deck", JSON.stringify({ front: "rws1909", back: "constellation" })));
  // The share sheet, caught.
  await page.addInitScript(() => {
    const shared: unknown[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: unknown) => void shared.push(data) });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  });
});

test("a birth date finds its card: the card's page, 공유하기 with that page, 내 고민도 타로로 보기 into a reading", async ({ page }, info) => {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  // `next dev` compiles a route on its first request: warm the card route so the click below measures the app.
  await page.request.get("/birth-card/empress");

  await page.goto("/birth-card");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("나를 닮은 타로 카드");
  await expect(page.getByRole("navigation", { name: "메이저 아르카나 22장" }).getByRole("link")).toHaveCount(22);
  await shot(page, info, "form");

  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "내 카드 찾기" }) });
  // Not whole yet: it says so and stays.
  await form.getByLabel("태어난 연도").selectOption("1990");
  await form.getByRole("button", { name: "내 카드 찾기" }).click();
  await expect(form.getByRole("alert")).toHaveText("생년월일을 끝까지 골라 주세요");
  await expect(page).toHaveURL(/\/birth-card$/);

  // 1+9+9+0+0+5+1+5 = 30 → 3 여황제
  await pick(form, "1990", "5", "15");
  await form.getByRole("button", { name: "내 카드 찾기" }).click();
  await expect(page).toHaveURL(`${new URL(page.url()).origin}/birth-card/empress`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("여황제");
  const face = page.getByRole("img", { name: "여황제 타로 카드" });
  await faceLoaded(face);
  expect(await face.getAttribute("src")).toBe("/cards/starlog/major-03-empress-sm.webp");
  expect(await face.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain("/cards/starlog/major-03-empress");
  await expect(page.getByRole("list", { name: "이런 사람이에요" }).getByRole("listitem")).toHaveCount(3);

  // The link preview is the card's own.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${SITE_URL}/api/og/birth-card/empress`);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `${SITE_URL}/birth-card/empress`);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", `${SITE_URL}/api/og/birth-card/empress`);
  await shot(page, info, "empress");

  await page.getByRole("button", { name: "공유하기" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)).toEqual([
    { title: "스타로그", text: "나를 닮은 타로 카드는 여황제 · 스타로그", url: `${SITE_URL}/birth-card/empress` },
  ]);

  await page.getByRole("link", { name: /내 고민도 타로로 보기/ }).click();
  // The 다리 화면 where premium is visible, else straight on to the question builder.
  await expect(page).toHaveURL(/\/tarot\/(start|new)/);

  // The date was never in an address or a request.
  expect(ownRequests(urls).filter((url) => /1990|0515/.test(url))).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage }))).not.toMatch(/1990|0515/);
});

test("a shared card opened as it is: the same page for a friend, 친구 생일로도 해 보기 finds theirs, and a 짝 카드 leads to its card", async ({ page }, info) => {
  await page.request.get("/birth-card/strength");
  await page.goto("/birth-card/hermit");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("은둔자");
  await faceLoaded(page.getByRole("img", { name: "은둔자 타로 카드" }));
  await shot(page, info, "hermit");

  await page.getByRole("link", { name: "친구 생일로도 해 보기" }).click();
  const find = page.locator("#find");
  await expect(find.getByRole("heading", { name: "내 카드 찾기" })).toBeInViewport();
  // 1+9+8+5+0+7+2+3 = 35 → 8 힘
  await pick(find, "1985", "7", "23");
  await find.getByRole("button", { name: "내 카드 찾기" }).click();
  await expect(page).toHaveURL(/\/birth-card\/strength$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("힘");

  // The longest name, for the shots, and a card with a 짝 카드 (1+0 = 1 마법사), whose link goes to that card.
  await page.goto("/birth-card/wheel-of-fortune");
  await faceLoaded(page.getByRole("img", { name: "운명의 수레바퀴 타로 카드" }));
  const pair = page.getByRole("region", { name: "짝 카드" });
  await expect(pair).toContainText("1+0 = 1");
  await shot(page, info, "wheel-of-fortune");
  await pair.getByRole("link", { name: /마법사/ }).click();
  await expect(page).toHaveURL(/\/birth-card\/magician$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("마법사");
  await expect(page.getByRole("region", { name: "짝 카드" })).toHaveCount(0);
});

test("the card's preview image is a PNG, and an unknown card is not a page", async ({ page }, info) => {
  const og = await page.request.get("/api/og/birth-card/empress");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toBe("image/png");
  const png = await og.body();
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.length).toBeGreaterThan(20_000);
  if (info.project.name === "desktop") {
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(`${SHOTS}/og-empress.png`, png);
    writeFileSync(`${SHOTS}/og-wheel-of-fortune.png`, await (await page.request.get("/api/og/birth-card/wheel-of-fortune")).body());
  }
  expect((await page.request.get("/api/og/birth-card/major-03-empress")).status()).toBe(404);
  expect((await page.request.get("/birth-card/major-03-empress")).status()).toBe(404);
});
