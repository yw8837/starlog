import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * Accounts and payments in owner mode (STARLOG_PAYMENTS=owner, mock Kakao and mock Toss, local D1):
 * the owner pass opens sales on this browser; everyone else keeps today's 오픈 기념 sheet, which the
 * other specs cover. A mock Kakao login without mockUser is a fresh account each time, so every run
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

test("owner mode: log in for the gift, open with 별조각, pay for the next, see it in 내 정보 and refund an unopened one", async ({ page }, info) => {
  test.setTimeout(600_000);
  await ownAddress(page, info);
  expect((await page.request.post("/api/owner", { data: { code: OWNER_CODE } })).ok()).toBe(true);

  // 1. A guest is asked to log in, with the gift explained.
  await toResult(page);
  await expect(page.getByText("처음 가입하면 별조각 10개를 드려요 · 전체 풀이 한 번을 무료로 열 수 있어요")).toBeVisible();
  await page.getByRole("link", { name: "로그인하고 전체 풀이 보기" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Ftarot%2Fresult$/, { timeout: NAV });
  await page.getByRole("checkbox", { name: "만 14세 이상이에요" }).check();
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
  await expect(page).toHaveURL(/\/tarot\/result\?login=ok$/, { timeout: NAV });

  // 2. The gift opens the reading; it is saved on this device and in the account.
  await page.getByRole("button", { name: "별조각 10개로 보기" }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]+$/, { timeout: GENERATION });
  const me = await (await page.request.get("/api/me")).json();
  expect(me.user.stardust).toBe(0);
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
  await page.getByRole("button", { name: "2,900원 결제하기" }).click();
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
  await expect(sheet).toContainText(/오픈 기념으로 하루 .+ 무료예요/);
  await expect(sheet.getByRole("link")).toHaveCount(0);
});
