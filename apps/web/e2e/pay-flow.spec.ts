import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * Accounts and payments in owner mode (STARLOG_PAYMENTS=owner, mock Kakao and mock Toss, local D1):
 * the owner pass opens sales on this browser; everyone else keeps the sheet of 첫 이용 무료 (tarot; saju
 * offers no free reading), which the other specs cover. A mock Kakao login without mockUser is a fresh account each time, so every run
 * starts with the gift. The question steps are the ones tarot-flow.spec.ts uses (chips toggle, the
 * situation step comes after 다음).
 */

const NAV = 30_000;
const GENERATION = 120_000;
const OWNER_CODE = process.env.E2E_OWNER_CODE ?? "owner-code-for-e2e-0000001";

async function ownAddress(page: Page, info: TestInfo) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.9.${info.workerIndex}.${Math.floor(Math.random() * 250)}` });
}

async function settleAnimations(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
}

async function pickFanCard(page: Page, n: number) {
  const point = await page.evaluate((index) => {
    const el = document.querySelectorAll("[data-fan-index]")[index];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let y = r.top + 6; y < r.bottom; y += 6)
      for (let x = r.left + 2; x < r.right; x += 3) if (document.elementFromPoint(x, y)?.closest("[data-fan-index]") === el) return { x, y };
    return null;
  }, n);
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
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
  await expect(page.locator("[data-fan-index]")).toHaveCount(21);
  await settleAnimations(page);
  for (const n of [2, 9, 16]) await pickFanCard(page, n);
  await expect(page.getByText("모두 골랐어요")).toBeVisible();
  await page.getByRole("button", { name: "결과 보기" }).click();
  await expect(page).toHaveURL(/\/tarot\/result/, { timeout: NAV });
  await expect(page.getByRole("region", { name: "전체 풀이에 담긴 것" })).toBeVisible({ timeout: GENERATION });
}

test("owner mode: log in for the gift, open a tarot reading with it, pay for the next, see it in 내 정보 and refund an unopened one", async ({ page }, info) => {
  test.setTimeout(600_000);
  await ownAddress(page, info);
  expect((await page.request.post("/api/owner", { data: { code: OWNER_CODE }, headers: { origin: new URL(info.project.use.baseURL!).origin } })).ok()).toBe(true);

  // 1. A guest is asked to log in, with the free first tarot reading named on the sheet and the login page.
  await toResult(page);
  await expect(page.getByText("처음 가입하면 타로 전체 풀이 1번을 무료로 드려요")).toBeVisible();
  await page.getByRole("link", { name: "로그인하고 전체 풀이 보기" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Ftarot%2Fresult$/, { timeout: NAV });
  await expect(page.getByText("처음 가입하면 타로 전체 풀이 1번을 무료로 드려요")).toBeVisible();
  await page.getByRole("checkbox", { name: "만 14세 이상이에요" }).check();
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
  await expect(page).toHaveURL(/\/tarot\/result\?login=ok$/, { timeout: NAV });

  // 2. The gift opens the reading; it is saved on this device and in the account, and the gift reads as used.
  await expect(page.getByText(/^가입 선물은 \d+월 \d+일까지 쓸 수 있어요$/)).toBeVisible();
  await page.getByRole("button", { name: "가입 선물로 무료로 보기" }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]+$/, { timeout: GENERATION });
  const me = await (await page.request.get("/api/me")).json();
  expect(me.user.gift).toEqual({ status: "used" });
  const saved = await (await page.request.get("/api/readings?limit=5")).json();
  expect(saved.readings).toHaveLength(1);

  // 3. The next reading is paid: checkout with the 청약철회 and minor notices, mock Toss, back, opened automatically.
  await toResult(page);
  await page.getByRole("link", { name: "2,900원 결제하고 보기" }).click();
  await expect(page).toHaveURL(/\/pay\/checkout\?/, { timeout: NAV });
  await expect(page.getByText(/청약철회가 제한돼요/)).toBeVisible();
  await expect(page.getByText(/법정대리인의 동의 없이/)).toBeVisible();
  await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
  await page.getByRole("button", { name: "2,900원 결제하기" }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]+$/, { timeout: GENERATION });

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
  await expect(sheet).toContainText("처음 한 번은 타로 전체 풀이를 무료로 열 수 있어요");
  await expect(sheet.getByRole("link")).toHaveCount(0);
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

test("owner mode, 주제별 사주: the 운 survives the login, the gift never opens it, 재물운 and 직장운 are each paid and open as themselves", async ({ page }, info) => {
  test.setTimeout(600_000);
  await ownAddress(page, info);
  expect((await page.request.post("/api/owner", { data: { code: OWNER_CODE }, headers: { origin: new URL(info.project.use.baseURL!).origin } })).ok()).toBe(true);
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

  // The 운 came back with the address; the sheet names it, says what one payment opens, and offers only paying,
  // though the fresh account holds an unused gift (tarot only).
  await expect(money).toContainText("재물운 전체 풀이 · 4,900원");
  await expect(money).toContainText("결제 한 번에 고른 풀이 하나를 열어요");
  await expect(money.getByRole("button", { name: "가입 선물로 무료로 보기" })).toHaveCount(0);
  await expect(money).not.toContainText("선물");
  expect((await (await page.request.get("/api/me")).json()).user.gift).toMatchObject({ status: "unused" });
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
  expect((await page.request.post("/api/owner", { data: { code: OWNER_CODE }, headers: { origin: new URL(info.project.use.baseURL!).origin } })).ok()).toBe(true);
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
