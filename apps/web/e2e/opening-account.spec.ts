import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { pickCard, tableCards } from "./cards";
import { loginForOpening, openingOn, ownerPass } from "./opening";

/**
 * 오픈 기념 무료 per account (owner 2026-10-27 "계정 위주로 돌아가는 게 맞지 않니?"): a visitor who taps it is sent to log in
 * (/login, the 만 14세 box, mock Kakao) and comes back to the result, which opens it by itself; the same account on another
 * browser is refused, then never offered it again (/api/me openingUsed). In owner mode (playwright.config.ts) only an
 * owner-pass browser may log in, so each browser takes the pass first: the pass skips the device's count, never the
 * account's. Each run logs in to a mock Kakao account of its own.
 * SHOTS: where the screenshots go.
 */

const NAV = 30_000;
const GENERATION = 120_000;
const RULE = "11월 30일까지 로그인한 계정마다 타로 전체 풀이 한 번을 무료로 열 수 있어요(오픈 기념 무료, 같은 기기에서는 한 번). 내 기록에 보관돼요(이어서 물어보기 제외).";

test.skip(() => !openingOn(), "오픈 기념 무료 ran until 2026-11-30 (KST)");

async function shot(page: Page, info: TestInfo, name: string) {
  const dir = process.env.SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${info.project.name}-${name}.png`, fullPage: true });
}

/** A browser of its own, with the project's size, stored 방문 통계 answer and an address of its own. */
async function newPage(browser: Browser, info: TestInfo): Promise<Page> {
  const { baseURL, viewport, deviceScaleFactor, storageState } = info.project.use;
  const page = await (await browser.newContext({ baseURL, viewport, deviceScaleFactor, storageState })).newPage();
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.27.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  return page;
}

async function settleAnimations(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
}

/** 나 · 재물운 · 이번 주 → one situation chip → three cards → the result's unlock sheet. */
async function toSheet(page: Page) {
  await page.goto("/tarot/new");
  await page.getByRole("button", { name: "나", exact: true }).click();
  await page.getByRole("button", { name: "재물운" }).click();
  await page.getByRole("button", { name: "이번 주" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
  await page.getByRole("button", { name: "지금은 수입이 없음" }).click();
  await page.getByRole("button", { name: "카드 뽑기" }).click();
  await expect(page).toHaveURL(/\/tarot\/draw$/, { timeout: NAV });
  await page.goto("/tarot/draw?instant=1");
  await expect(tableCards(page)).toHaveCount(78);
  await settleAnimations(page);
  for (let i = 0; i < 3; i++) await pickCard(page);
  await expect(page.getByText("모두 골랐어요")).toBeVisible();
  await page.getByRole("button", { name: "결과 보기" }).click();
  await expect(page).toHaveURL(/\/tarot\/result\?instant=1$/, { timeout: NAV });
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  await expect(sheet).toBeVisible({ timeout: GENERATION });
  return sheet;
}

test("a visitor taps 오픈 기념 무료, logs in with Kakao and comes back to it opened; the same account on another browser is refused, then offered it no more", async ({ browser }, info) => {
  test.setTimeout(360_000);
  const name = `opening-${info.project.name}-${Date.now()}`;

  // 0. A phone already logged in to the account, waiting on its own unlock sheet (the account has not taken it yet).
  const phone = await newPage(browser, info);
  await loginForOpening(phone, info, name);
  const phoneSheet = await toSheet(phone);
  const phoneFree = phoneSheet.getByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ });
  await expect(phoneFree).toBeVisible();

  // 1. A visitor: the button says it logs in first, and the rule under it says per account.
  const web = await newPage(browser, info);
  await ownerPass(web, info);
  const sheet = await toSheet(web);
  await expect(sheet).toContainText(RULE);
  const free = sheet.getByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료 · 로그인하고 받기$/ });
  await expect(free).toBeVisible();
  await shot(web, info, "1-visitor-sheet");

  // 2. Tapping it goes to /login with the way back to open it; the mock Kakao account is pinned to `name`.
  let generated = 0;
  web.on("request", (r) => {
    if (r.url().endsWith("/api/tarot/reading")) generated += 1;
  });
  await web.route(
    (url) => url.pathname === "/api/auth/age",
    async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { url: string };
      await route.fulfill({ response, json: { ...body, url: `${body.url}&mockUser=${encodeURIComponent(name)}` } });
    },
  );
  await free.click();
  await expect(web).toHaveURL(/\/login\?next=%2Ftarot%2Fresult%3Funlock%3Dopening%26instant%3D1$/, { timeout: NAV });
  expect(generated).toBe(0);
  await shot(web, info, "2-login");
  await web.getByRole("checkbox", { name: "만 14세 이상이에요" }).check();
  await web.getByRole("button", { name: "카카오로 계속하기" }).click();

  // 3. Back on the result, it opens by itself as 오픈 기념 무료: read and kept, no follow-ups.
  await expect(web).toHaveURL(/\/chapter\/[a-z0-9]{6,32}$/, { timeout: GENERATION });
  expect(generated).toBe(1);
  await expect(web.getByText("오픈 기념 무료 풀이는 내 기록에 보관돼요. 이어서 물어보기는 결제한 풀이에서 할 수 있어요.")).toHaveCount(1);
  await expect(web.getByRole("region", { name: /이어서 물어보기/ })).toHaveCount(0);
  expect((await (await web.request.get("/api/me")).json()).user).toBeTruthy();
  await shot(web, info, "3-opened");

  // 4. The phone, still showing the button, taps it: refused for the account (its own device count untouched), and the
  //    account now says it took it (/api/me openingUsed), so the free button goes and paying is the gold choice.
  const opened = phone.waitForResponse((r) => r.url().endsWith("/api/tarot/reading"));
  await phoneFree.click();
  const refused = await opened;
  expect(refused.status()).toBe(429);
  expect(await refused.json()).toMatchObject({ code: "BETA_LIMIT", scope: "account" });
  await expect(phoneSheet).toContainText("이 계정으로는 오픈 기념 무료 풀이를 이미 받았어요");
  await expect(phoneSheet).not.toContainText("이 기기에서는 오픈 기념 무료 풀이를 이미 열었어요");
  await expect(phoneSheet.getByRole("button", { name: /오픈 기념 무료/ })).toHaveCount(0);
  await expect(phoneSheet.getByRole("link", { name: "2,900원 결제하고 보기" })).toBeVisible();
  await expect(phone).toHaveURL(/\/tarot\/result/);
  await phoneSheet.scrollIntoViewIfNeeded();
  await shot(phone, info, "4-phone-refused");
  // Coming back to it later, the account's screens never offer it again.
  await phone.reload();
  await expect(phoneSheet).toBeVisible({ timeout: GENERATION });
  await expect(phoneSheet.getByRole("link", { name: "2,900원 결제하고 보기" })).toBeVisible();
  await expect(phoneSheet.getByRole("button", { name: /오픈 기념 무료/ })).toHaveCount(0);
  await shot(phone, info, "5-phone-later");
  await web.context().close();
  await phone.context().close();
});

test("the terms and the privacy policy say what changed on top while it runs (owner 2026-10-27)", async ({ page }, info) => {
  await page.goto("/terms");
  const terms = page.getByRole("complementary", { name: /바뀐 내용 · 오픈 기념 무료$/ });
  await expect(terms).toContainText("로그인한 계정마다 한 번 드립니다");
  await expect(page.locator("#service")).toContainText("로그인한 계정마다 한 번(같은 기기에서는 한 번)");
  await page.goto("/privacy");
  const privacy = page.getByRole("complementary", { name: /^\d{4}년 \d{1,2}월 \d{1,2}일 바뀐 내용$/ });
  await expect(privacy).toHaveText(/오픈 기념 무료를 계정마다 한 번 드리기 위해 받은 여부와 시각을 보관해요\. 탈퇴하면 함께 지워요\.$/);
  await expect(page.locator("#items")).toContainText("오픈 기념 무료를 받았는지와 받은 시각(2026년 11월 30일까지 진행하는 오픈 기념 무료를 계정마다 한 번만 드리기 위해)");
  await expect(page.locator("#purposes")).toContainText("오픈 기념 무료를 계정마다 한 번만 드리기");
  await privacy.scrollIntoViewIfNeeded();
  await shot(page, info, "6-privacy-notice");
});
