import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { pickCard, tableCards } from "./cards";
import { ownerPass } from "./opening";

/**
 * Every AI reading result needs a login (owner 2026-11-04, final). A visitor makes the question and draws the cards (or
 * enters the birth data and sees the free 명식, or shuffles and picks 오늘의 한 장) without one; where the reading would
 * show, the screen asks for the login (/login, the 만 14세 box, mock Kakao) and comes back to the same place, where the
 * reading goes on from the very same cards and input, without drawing again. In owner mode (playwright.config.ts) only an
 * owner-pass browser may sign up, so each test takes the pass first: the pass skips the day's count, never the login, and
 * it is no login (the screens still see a visitor). Tagged @login: the Workers preview refuses the mock login.
 */

const NAV = 30_000;
const GENERATION = 120_000;

/** Each test gets its own client address, so the per-IP limiters never span tests. */
async function ownAddress(page: Page, info: TestInfo) {
  const ip = `10.44.${info.workerIndex}.${Math.floor(Math.random() * 250)}`;
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": ip, "x-forwarded-for": ip });
}

async function settleAnimations(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
}

/** The JSON bodies this page sends to `path`. */
function bodiesTo(page: Page, path: string): Array<Record<string, unknown>> {
  const bodies: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === path) bodies.push(JSON.parse(request.postData() ?? "{}") as Record<string, unknown>);
  });
  return bodies;
}

/** /login as a person uses it: the 만 14세 box, then mock Kakao (a fresh account), back to where it was asked. */
async function logIn(page: Page, next: string) {
  await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(next).replace(/[?]/g, "\\?")}$`), { timeout: NAV });
  await page.getByRole("checkbox", { name: "만 14세 이상이에요" }).check();
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
}

test.beforeEach(async ({ page }, info) => {
  test.setTimeout(300_000);
  await ownAddress(page, info);
  await ownerPass(page, info);
});

test("tarot: a visitor draws, is asked to log in where the 맛보기 would show, and reads the very same cards after it @login", async ({ page }) => {
  const teasers = bodiesTo(page, "/api/tarot/teaser");
  await page.goto("/tarot/new");
  await page.getByRole("button", { name: "나", exact: true }).click();
  await page.getByRole("button", { name: "재물운" }).click();
  await page.getByRole("button", { name: "이번 주" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
  await page.getByRole("button", { name: "카드 뽑기" }).click();
  await expect(page).toHaveURL(/\/tarot\/draw$/, { timeout: NAV });

  await page.goto("/tarot/draw?instant=1");
  await expect(tableCards(page)).toHaveCount(78);
  await settleAnimations(page);
  for (let i = 0; i < 3; i++) await pickCard(page);
  const dealt = page.waitForResponse((r) => r.url().endsWith("/api/tarot/draw") && r.request().method() === "POST");
  await page.getByRole("button", { name: "결과 보기" }).click();
  const { drawToken, cards } = (await (await dealt).json()) as { drawToken: string; cards: Array<{ cardId: string }> };
  expect(cards).toHaveLength(3);

  // The reading step: the question and the cards stay, a login is asked where the 맛보기 would be, nothing is generated.
  await expect(page).toHaveURL(/\/tarot\/result\?instant=1$/, { timeout: NAV });
  const panel = page.getByRole("region", { name: "맛보기 풀이는 로그인하고 볼 수 있어요" });
  await expect(panel).toBeVisible({ timeout: NAV });
  await expect(panel).toContainText("고른 카드와 질문은 그대로 있어요");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("재물");
  expect(teasers).toEqual([]);

  await panel.getByRole("link", { name: "로그인하고 맛보기 보기" }).click();
  await logIn(page, "/tarot/result?instant=1");
  await expect(page).toHaveURL(/\/tarot\/result\?instant=1&login=ok$/, { timeout: NAV });
  await expect(page.getByRole("region", { name: "전체 풀이에 담긴 것" })).toBeVisible({ timeout: GENERATION });
  // The same draw, not a new one: the 맛보기 was asked for once, with the token the visitor's draw got.
  expect(teasers).toHaveLength(1);
  expect(teasers[0]!.drawToken).toBe(drawToken);
  await expect(panel).toHaveCount(0);
});

test("saju: a visitor sees the free 명식, is asked to log in for the 맛보기, and gets it for the same birth data after it @login", async ({ page }) => {
  const teasers = bodiesTo(page, "/api/saju/teaser");
  await page.goto("/saju/new");
  await page.getByLabel("태어난 연도").selectOption("1990");
  await page.getByLabel("태어난 월").selectOption("1");
  await page.getByLabel("태어난 일").selectOption("1");
  await page.getByRole("button", { name: "여성", exact: true }).click();
  await page.getByRole("button", { name: "알아요" }).click();
  await page.getByLabel("태어난 시", { exact: true }).selectOption("9");
  await page.getByLabel("태어난 분").selectOption("30");
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page).toHaveURL(/\/saju\/chart$/, { timeout: NAV });

  // The 명식 is free without a login; the 맛보기 asks for one.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("나의 명식");
  await expect(page.getByRole("complementary", { name: "명식" })).toContainText("壬");
  const panel = page.getByRole("region", { name: "맛보기 풀이는 로그인하고 볼 수 있어요" });
  await expect(panel).toBeVisible({ timeout: NAV });
  expect(teasers).toEqual([]);

  await panel.getByRole("link", { name: "로그인하고 맛보기 보기" }).click();
  await logIn(page, "/saju/chart");
  await expect(page).toHaveURL(/\/saju\/chart\?login=ok$/, { timeout: NAV });
  await expect(page.getByRole("region", { name: "전체 풀이에 담긴 것" })).toBeVisible({ timeout: GENERATION });
  expect(teasers).toHaveLength(1);
  expect(teasers[0]!.birth).toMatchObject({ year: 1990, month: 1, day: 1, hour: 9, minute: 30 });
});

test("오늘의 한 장: a visitor shuffles and picks, is asked to log in, and that very slot turns over after it @login", async ({ page }) => {
  const picks = bodiesTo(page, "/api/tarot/daily");
  await page.goto("/today");
  await page.getByRole("button", { name: "바로 펼치기" }).click();
  const cards = page.getByRole("button", { name: /번째 카드 고르기/ });
  await expect(cards).toHaveCount(3);
  await cards.nth(1).click();

  const panel = page.getByRole("region", { name: "오늘의 한 장은 로그인하고 볼 수 있어요" });
  await expect(panel).toBeVisible({ timeout: NAV });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("고른 카드는 로그인하면 펼쳐져요");
  expect(picks).toEqual([]);

  await panel.getByRole("link", { name: "로그인하고 카드 펼치기" }).click();
  await logIn(page, "/today?pick=1");
  await expect(page.locator("#today-line")).toBeVisible({ timeout: GENERATION });
  // That slot, once, with no second shuffle or pick; the address is clean again.
  expect(picks).toHaveLength(1);
  expect(picks[0]).toMatchObject({ pick: 1 });
  await expect(page).toHaveURL(/\/today$/);
});
