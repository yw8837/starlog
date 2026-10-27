import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { pickCard, tableCards } from "./cards";
import { consentBanner, usable } from "./consent";
import { fakeBrowserClock, openingOn, ownerPass } from "./opening";

/**
 * Accounts and payments in owner mode (STARLOG_PAYMENTS=owner, mock Kakao and mock Toss, local D1):
 * the owner pass opens sales on this browser; everyone else keeps the sheet of 오픈 기념 무료 (tarot; saju
 * offers no free reading), which the other specs cover. A mock Kakao login without mockUser is a fresh account each time, and
 * a new account gets no signup gift (removed, owner 2026-10-14 evening). The question steps are the ones tarot-flow.spec.ts uses (chips toggle, the
 * situation step comes after 다음). 오픈 기념 무료 ends with 2026-11-30 (KST): the sheet lines naming it go from 12월 1일.
 */

test.beforeEach(async ({ page }) => fakeBrowserClock(page));

const NAV = 30_000;
const GENERATION = 120_000;
/** The 오픈 기념 무료 rule as the unlock sheet says it. */
const OPENING_RULE = "11월 30일까지 로그인한 계정마다 타로 전체 풀이 한 번을 무료로 열 수 있어요(오픈 기념 무료, 같은 기기에서는 한 번). 내 기록에 보관돼요(이어서 물어보기 제외).";

async function ownAddress(page: Page, info: TestInfo) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.9.${info.workerIndex}.${Math.floor(Math.random() * 250)}` });
}

async function settleAnimations(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
}

/** 나 · 재물운 · 이번 주 → one situation chip → three cards → the result with its free teaser. */
async function toResult(page: Page) {
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
  await expect(page).toHaveURL(/\/tarot\/result/, { timeout: NAV });
  await expect(page.getByRole("region", { name: "전체 풀이에 담긴 것" })).toBeVisible({ timeout: GENERATION });
}

test("owner mode: log in (no signup gift), pay for a tarot reading that takes follow-ups, see it in 내 정보 and refund an unopened one", async ({ page }, info) => {
  test.setTimeout(600_000);
  await ownAddress(page, info);
  // The helper waits out OWNER_LOGIN_LIMITER (5 a minute): the @login specs in the same dev run take the pass too.
  await ownerPass(page, info);

  // 1. A guest is asked to log in to pay, with 오픈 기념 무료 named on the sheet; no signup gift is promised there or on the login page.
  await toResult(page);
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  if (openingOn()) await expect(sheet).toContainText(OPENING_RULE);
  else await expect(sheet).not.toContainText("오픈 기념 무료");
  await expect(sheet).not.toContainText("선물");
  await page.getByRole("link", { name: "로그인하고 전체 풀이 보기" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Ftarot%2Fresult$/, { timeout: NAV });
  await expect(page.getByText(/가입 선물|무료로 드려요/)).toHaveCount(0);
  await page.getByRole("checkbox", { name: "만 14세 이상이에요" }).check();
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
  await expect(page).toHaveURL(/\/tarot\/result\?login=ok$/, { timeout: NAV });

  // 2. The new account holds no gift: the sheet offers no gift, only 오픈 기념 무료 and paying.
  expect((await (await page.request.get("/api/me")).json()).user.gift).toBeNull();
  await expect(sheet.getByRole("link", { name: "2,900원 결제하고 보기" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "가입 선물로 무료로 보기" })).toHaveCount(0);

  // 3. The reading is paid: checkout with the 청약철회 and minor notices, mock Toss, back, opened automatically,
  //    saved in the account, and it takes follow-ups (a 오픈 기념 무료 reading does not).
  await sheet.getByRole("link", { name: "2,900원 결제하고 보기" }).click();
  await expect(page).toHaveURL(/\/pay\/checkout\?/, { timeout: NAV });
  await expect(page.getByText(/청약철회가 제한돼요/)).toBeVisible();
  await expect(page.getByText(/법정대리인의 동의 없이/)).toBeVisible();
  await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
  await page.getByRole("button", { name: "2,900원 결제하기" }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]+$/, { timeout: GENERATION });
  const saved = await (await page.request.get("/api/readings?limit=5")).json();
  expect(saved.readings).toHaveLength(1);
  await expect(page.getByRole("button", { name: "공유하기" })).toBeVisible();
  const followUp = page.getByRole("region", { name: /이어서 물어보기/ });
  await expect(followUp).toContainText("3번 남았어요");
  const field = followUp.getByRole("textbox", { name: "이어서 물어볼 내용" });
  await field.fill("이번 주에 무엇부터 줄이면 좋을까요?");
  const answered = page.waitForResponse((r) => r.url().endsWith("/api/followup"));
  await field.press("Enter");
  await answered;
  await expect(followUp).toContainText("2번 남았어요", { timeout: 30_000 });

  // 4. A saju purchase left unopened shows in 내 정보 and refunds in full.
  await page.goto("/pay/checkout?product=saju&returnTo=%2Fme");
  await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
  await page.getByRole("button", { name: "4,900원 결제하기" }).click();
  await expect(page).toHaveURL(/\/me(\?|$)/, { timeout: NAV });
  await expect(page.getByText("사주 전체 풀이 · 열지 않음")).toBeVisible({ timeout: NAV });
  await expect(page.getByRole("heading", { name: "결제 내역" })).toBeVisible();
  await page.getByRole("button", { name: "환불받기", exact: true }).click();
  await page.getByRole("button", { name: "전액 환불받기" }).click();
  await expect(page.getByText("환불했어요. 카드사에 따라 며칠 걸릴 수 있어요.")).toBeVisible({ timeout: NAV });
  await expect(page.getByText("환불됨")).toBeVisible({ timeout: NAV });
});

test("a cancelled Toss window charges nothing and goes back", async ({ page }, info) => {
  await ownAddress(page, info);
  await page.goto("/pay/fail?code=PAY_PROCESS_CANCELED&message=x");
  await expect(page.getByText("결제를 취소했어요")).toBeVisible({ timeout: NAV });
  await expect(page.getByText("청구된 금액은 없어요.")).toBeVisible();
});

test("a browser without the owner pass keeps today's sheet in owner mode", async ({ page }, info) => {
  test.setTimeout(300_000);
  await ownAddress(page, info);
  await toResult(page);
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  if (openingOn()) {
    await expect(sheet).toContainText(OPENING_RULE);
    await expect(sheet.getByRole("link")).toHaveCount(0);
  } else {
    // 오픈 기념 무료 ended 2026-11-30: nothing opens for a visitor while sales are owner-only.
    await expect(sheet).not.toContainText("오픈 기념 무료");
    await expect(sheet.getByRole("button", { name: "전체 풀이 보기", exact: true })).toBeDisabled();
  }
});

/** 재물운 on /saju/chart for 1992-08-03 (남성), from the form; the topics are on in dev. */
async function toSajuTopic(page: Page) {
  await page.goto("/saju/new");
  await page.getByLabel("태어난 연도").selectOption("1992");
  await page.getByLabel("태어난 월").selectOption("8");
  await page.getByLabel("태어난 일").selectOption("3");
  await page.getByRole("button", { name: "남성", exact: true }).click();
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page).toHaveURL(/\/saju\/chart$/, { timeout: NAV });
  await page.getByRole("group", { name: "다른 운도 볼 수 있어요" }).getByRole("button", { name: "재물운" }).click();
  await expect(page.getByRole("region", { name: "재물운 전체 풀이에 담긴 것" })).toBeVisible({ timeout: GENERATION });
}

test("owner mode, 주제별 사주: the 운 survives the login, no gift is offered, 재물운 and 직장운 are each paid and open as themselves", async ({ page }, info) => {
  test.setTimeout(600_000);
  await ownAddress(page, info);
  // The helper waits out OWNER_LOGIN_LIMITER (5 a minute): the @login specs in the same dev run take the pass too.
  await ownerPass(page, info);
  await toSajuTopic(page);
  const money = page.getByRole("region", { name: "재물운 전체 풀이에 담긴 것" });
  // A guest is asked to log in to pay: no free reading is promised for saju.
  await expect(money).toContainText("로그인하면 바로 결제하고 열 수 있어요");
  await expect(money).not.toContainText("선물");
  await page.getByRole("link", { name: "로그인하고 전체 풀이 보기" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fsaju%2Fchart%3Ftopic%3Dmoney$/, { timeout: NAV });
  await page.getByRole("checkbox", { name: "만 14세 이상이에요" }).check();
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
  await expect(page).toHaveURL(/\/saju\/chart\?topic=money&login=ok$/, { timeout: NAV });

  // The 운 came back with the address; the sheet names it, says what one payment opens, and offers only paying
  // (a new account holds no signup gift: removed, owner 2026-10-14 evening).
  await expect(money).toContainText("재물운 전체 풀이 · 4,900원");
  await expect(money).toContainText("결제 한 번에 고른 풀이 하나를 열어요");
  await expect(money.getByRole("button", { name: "가입 선물로 무료로 보기" })).toHaveCount(0);
  await expect(money).not.toContainText("선물");
  expect((await (await page.request.get("/api/me")).json()).user.gift).toBeNull();
  await money.getByRole("link", { name: "4,900원 결제하고 보기" }).click();
  await expect(page).toHaveURL(/\/pay\/checkout\?/, { timeout: NAV });
  await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
  await page.getByRole("button", { name: "4,900원 결제하기" }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]+$/, { timeout: GENERATION });
  await expect(page.getByText(/^사주 재물운 · /)).toBeVisible();

  // Another 운 is a new purchase: checkout says so, and the paid reading opens as that 운 (back with ?topic=career&unlock=paid).
  await page.goto("/saju/chart");
  await page.getByRole("group", { name: "다른 운도 볼 수 있어요" }).getByRole("button", { name: "직장운" }).click();
  const career = page.getByRole("region", { name: "직장운 전체 풀이에 담긴 것" });
  await expect(career).toBeVisible({ timeout: GENERATION });
  await career.getByRole("link", { name: "4,900원 결제하고 보기" }).click();
  await expect(page).toHaveURL(/\/pay\/checkout\?/, { timeout: NAV });
  await expect(page.getByText("결제 한 번에 고른 풀이 하나를 열어요")).toBeVisible();
  await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
  await page.getByRole("button", { name: "4,900원 결제하기" }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]+$/, { timeout: GENERATION });
  await expect(page.getByText(/^사주 직장운 · /)).toBeVisible();

  const saved = await (await page.request.get("/api/readings?limit=5")).json();
  expect(saved.readings.map((r: { chapter: { topic?: string } }) => r.chapter.topic).sort()).toEqual(["career", "money"]);
});

test("owner mode, 주제별 사주: a 재물운 checkout comes back as ?topic=money&unlock=paid, only ?unlock= leaves the address, and a reload on it shows 재물운", async ({ page }, info) => {
  test.setTimeout(600_000);
  await ownAddress(page, info);
  // The helper waits out OWNER_LOGIN_LIMITER (5 a minute): the @login specs in the same dev run take the pass too.
  await ownerPass(page, info);
  await toSajuTopic(page);
  await page.getByRole("link", { name: "로그인하고 전체 풀이 보기" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fsaju%2Fchart%3Ftopic%3Dmoney$/, { timeout: NAV });
  await page.getByRole("checkbox", { name: "만 14세 이상이에요" }).check();
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
  await expect(page).toHaveURL(/\/saju\/chart\?topic=money&login=ok$/, { timeout: NAV });

  // The opening that starts by itself on the way back is held: the first reading request never leaves the
  // browser, so the purchase stays unopened while the address is read and the page is reloaded.
  const held: string[] = [];
  await page.route("**/api/saju/reading", (route) => {
    if (held.length > 0) return route.continue();
    held.push(route.request().postData() ?? "");
    return new Promise<void>(() => {});
  });
  const money = page.getByRole("region", { name: "재물운 전체 풀이에 담긴 것" });
  await money.getByRole("link", { name: "4,900원 결제하고 보기" }).click();
  await expect(page).toHaveURL(/\/pay\/checkout\?/, { timeout: NAV });
  await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
  await page.getByRole("button", { name: "4,900원 결제하기" }).click();

  // Back as ?topic=money&unlock=paid, the purchase starts opening 재물운; the address keeps the 운 and drops only ?unlock=.
  await expect.poll(() => held.length, { timeout: GENERATION }).toBe(1);
  expect(JSON.parse(held[0]!)).toMatchObject({ topic: "money", unlock: { method: "paid" } });
  await expect(page).toHaveURL(/\/saju\/chart\?topic=money$/, { timeout: NAV });

  // A reload on that address comes back to 재물운, with the paid reading waiting.
  await page.reload();
  await expect(page.getByText("재물운 · 맛보기", { exact: true })).toBeVisible({ timeout: GENERATION });
  await expect(page.getByRole("group", { name: "다른 운도 볼 수 있어요" }).getByRole("button", { name: "재물운" })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/saju\/chart\?topic=money$/);
  await expect(money.getByRole("button", { name: "결제한 풀이 열기" })).toBeVisible();

  // Opening it from there opens 재물운 (the held try spent nothing).
  await money.getByRole("button", { name: "결제한 풀이 열기" }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]+$/, { timeout: GENERATION });
  await expect(page.getByText(/^사주 재물운 · /)).toBeVisible();
  const saved = await (await page.request.get("/api/readings?limit=5")).json();
  expect(saved.readings.map((r: { chapter: { topic?: string } }) => r.chapter.topic)).toEqual(["money"]);
});

test("unanswered on 10/30, the 방문 통계 banner leaves checkout usable: a guest is sent to log in and back, and 결제하기 can be pressed", async ({ page }, info) => {
  await ownAddress(page, info);
  // The shared owner pass: it waits out the five-a-minute owner logins this file's other tests may have used up.
  await ownerPass(page, info);
  // No stored choice (the config's 거부 is dropped), a clock that runs from 10/30, and nothing sent to Google.
  await page.addInitScript(() => window.localStorage.removeItem("starlog.analytics.consent"));
  await page.clock.install({ time: new Date("2026-10-30T10:00:00+09:00") });
  await page.context().route((url) => /google|doubleclick/.test(url.hostname), (route) => route.abort());
  await page.goto("/pay/checkout?product=saju&returnTo=%2Fme");
  await expect(page).toHaveURL(/\/login\?next=%2Fpay%2Fcheckout/, { timeout: NAV });
  await expect(consentBanner(page)).toBeVisible();
  await page.getByRole("checkbox", { name: "만 14세 이상이에요" }).check();
  await usable(page.getByRole("button", { name: "카카오로 계속하기" }));
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
  await expect(page).toHaveURL(/\/pay\/checkout\?product=saju/, { timeout: NAV });
  await expect(consentBanner(page)).toBeVisible();
  await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
  await usable(page.getByRole("button", { name: "4,900원 결제하기" }));
});
