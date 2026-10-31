import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { pickCard, tableCards } from "./cards";
import { fakeBrowserClock } from "./opening";

/**
 * 단계별 위기 대응 (owner 2026-10-31) on the real API (STARLOG_AI=mock): a stated thought of dying gets the care screen in
 * place of the reading, 109 by call or by text first and the other lines folded; a passive wish gets its reading with
 * the helplines over it until closed (lib/crisis.ts, lib/ai/care.ts, components/ui/CareBanner.tsx).
 */

const NAV = 30_000;
const SHOTS = "test-results/care";

/** Each test gets its own client address, so the per-IP generation limiter never spans tests. */
async function ownAddress(page: Page, info: TestInfo) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.7.${info.workerIndex}.${(info.repeatEachIndex * 50 + info.retry * 7 + Math.floor(Math.random() * 200)) % 250}` });
}

/** 나 · 재물운 · 이번 주, one situation chip and the note. */
async function questionWithNote(page: Page, note: string) {
  await page.goto("/tarot/new");
  await page.getByRole("button", { name: "나", exact: true }).click();
  await page.getByRole("button", { name: "재물운" }).click();
  await page.getByRole("button", { name: "이번 주" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
  await page.getByRole("button", { name: "지금은 수입이 없음" }).click();
  await page.getByLabel("한 줄 메모").fill(note);
  await page.getByRole("button", { name: "카드 뽑기" }).click();
  await expect(page).toHaveURL(/\/tarot\/draw$/, { timeout: NAV });
}

async function drawThree(page: Page) {
  await page.goto("/tarot/draw?instant=1");
  await expect(tableCards(page)).toHaveCount(78);
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
  for (let i = 0; i < 3; i++) await pickCard(page);
  await expect(page.getByText("모두 골랐어요")).toBeVisible();
  await page.getByRole("button", { name: "결과 보기" }).click();
  await expect(page).toHaveURL(/\/tarot\/result/, { timeout: NAV });
}

test.beforeEach(async ({ page }) => fakeBrowserClock(page));

test("a stated thought of dying: no reading, the care screen with 109 by call or by text, the rest folded, the way back open", async ({ page }, info) => {
  await ownAddress(page, info);
  await questionWithNote(page, "요즘 죽고 싶다는 생각이 들어요");
  await drawThree(page);
  await expect(page.getByRole("heading", { name: "마음이 많이 무거웠군요" })).toBeVisible({ timeout: NAV });
  await expect(page.getByText("이 일로 줄어든 횟수나 결제는 없어요", { exact: false })).toBeVisible();
  const shown = page.getByRole("list", { name: "상담 전화와 문자" });
  await expect(shown.locator('a[href="tel:109"]')).toBeVisible();
  await expect(shown.locator('a[href="sms:109"]')).toBeVisible();
  await expect(shown.getByText("SNS 상담 마들랜")).toBeVisible();
  await expect(page.getByText("다른 상담 창구")).toBeVisible();
  await expect(page.locator('a[href="tel:1577-0199"]')).toBeHidden();
  await expect(page.getByRole("link", { name: "질문 고치기" })).toBeVisible();
  await expect(page.getByText(/잠시 멈춰도 괜찮아요|극단적/)).toHaveCount(0);
  await page.getByRole("heading", { name: "마음이 많이 무거웠군요" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-active.png` });
});

test("a passive wish: the reading comes, with the helplines over it until closed", async ({ page }, info) => {
  await ownAddress(page, info);
  await questionWithNote(page, "요즘 너무 지쳐서 사라지고 싶어요");
  await drawThree(page);
  const banner = page.getByRole("complementary", { name: "마음 돌봄 안내" });
  await expect(banner).toBeVisible({ timeout: NAV });
  await expect(banner.getByText("마음이 많이 지쳐 보여요", { exact: false })).toBeVisible();
  await expect(banner.locator('a[href="tel:109"]')).toBeVisible();
  // The reading is there, not refused: the free part and what the full reading holds.
  await expect(page.getByRole("region", { name: "전체 풀이에 담긴 것" })).toBeVisible({ timeout: NAV });
  await expect(page.getByRole("heading", { name: "마음이 많이 무거웠군요" })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-passive.png` });
  await banner.getByRole("button", { name: "닫기" }).click();
  await expect(banner).toHaveCount(0);
});
