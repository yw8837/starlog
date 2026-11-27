import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { pickCard, tableCards } from "./cards";
import { fakeBrowserClock, mockLogin, ownerPass } from "./opening";

/**
 * 고민 진열 end to end with mock AI (spec 2026-11-26 worry catalog §11): a worry card on the home → its page → the start →
 * the situation step with the worry's values filled in → the draw → the result with its 맛보기; a saju worry → the chart
 * opened on its topic. Tests that read a 맛보기 log in (mock Kakao, after the owner pass, as tarot-flow.spec.ts does) and are
 * tagged @login: the Workers preview refuses that login.
 */

/** Client navigations wait for `next dev` to compile the next route, which is slow on this disk. */
const NAV = 30_000;
const GENERATION = 120_000;

async function ownAddress(page: Page, info: TestInfo) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.9.${info.workerIndex}.${Math.floor(Math.random() * 250)}` });
}

/** Waits until every finite CSS animation and transition (the table's spread) has finished. */
async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}

test.beforeEach(async ({ page }) => fakeBrowserClock(page));

test("a worry from /worries opens the situation step with its chips chosen, and 질문 만들기로 keeps them", async ({ page }, info) => {
  await ownAddress(page, info);
  await page.goto("/worries");
  await page.getByRole("group", { name: "고민 분류" }).getByRole("button", { name: "일" }).click();
  await page.getByRole("link", { name: /일보다 사람이 힘들어/ }).click();
  await expect(page).toHaveURL(/\/w\/coworker$/, { timeout: NAV });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("일보다 사람이 힘들어");
  await expect(page.getByRole("region", { name: "이 풀이가 보는 것" })).toContainText("이번 달 그 사람과의 갈등, 어떻게 풀면 좋을까?");
  await page.getByRole("button", { name: /상황 고르기/ }).click();

  // The values travel in the flow, never in the address.
  await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
  await expect(page.getByText("이번 달 그 사람과의 갈등, 어떻게 풀면 좋을까?")).toBeVisible();
  await expect(page.getByRole("button", { name: "직장 동료" })).toHaveAttribute("aria-pressed", "true");
  // Every value can still be changed: the chip toggles, and the builder is one step back.
  await page.getByRole("link", { name: "질문 만들기로" }).click();
  await expect(page).toHaveURL(/\/tarot\/new$/, { timeout: NAV });
  await expect(page.getByRole("button", { name: "갈등·화해" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "이번 달" })).toHaveAttribute("aria-pressed", "true");
});

test("a worry card on the home → its page → 상황 고르기 → the draw → the result with its 맛보기 (mock AI)", { tag: "@login" }, async ({ page }, info) => {
  test.setTimeout(300_000);
  await ownAddress(page, info);
  // The 맛보기 needs a login (owner 2026-11-04): the pass, then the mock Kakao login.
  await ownerPass(page, info);
  await mockLogin(page, info, `worry-${info.project.name}-${Date.now()}`);

  await page.goto("/");
  const board = page.getByRole("main").getByRole("region", { name: "지금 무슨 고민이야?" });
  await board.getByRole("link", { name: /이거 썸 맞아\?/ }).click();
  await expect(page).toHaveURL(/\/w\/some$/, { timeout: NAV });
  await expect(page.getByRole("region", { name: "가격과 무료로 보는 부분" })).toContainText("타로 3장 전체 풀이 2,900원");
  await page.getByRole("button", { name: /상황 고르기/ }).click();

  await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
  await expect(page.getByText("이번 달 그 사람과 나 사이는 어떻게 될까?")).toBeVisible();
  await page.getByRole("button", { name: "연락이 뜸함" }).click();
  await page.getByRole("button", { name: "카드 뽑기" }).click();
  await expect(page).toHaveURL(/\/tarot\/draw$/, { timeout: NAV });

  await page.goto("/tarot/draw?instant=1");
  await expect(tableCards(page)).toHaveCount(78);
  await settleAnimations(page);
  for (let i = 0; i < 3; i++) await pickCard(page);
  await page.getByRole("button", { name: "결과 보기" }).click();
  await expect(page).toHaveURL(/\/tarot\/result\?instant=1$/, { timeout: NAV });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("이번 달 그 사람과 나 사이는 어떻게 될까?");
  await expect(page.getByRole("region", { name: "이어지는 풀이" })).toBeVisible({ timeout: GENERATION });
});

test("a saju worry → 생년월일 넣기 → the chart opens on its topic (mock AI)", { tag: "@login" }, async ({ page }, info) => {
  test.setTimeout(300_000);
  await ownAddress(page, info);
  await ownerPass(page, info);
  await mockLogin(page, info, `worry-saju-${info.project.name}-${Date.now()}`);

  await page.goto("/w/solo");
  await expect(page.getByRole("region", { name: "이 풀이가 보는 것" })).toContainText("사랑할 때의 나 · 가장 가까운 자리와 마음");
  await page.getByRole("link", { name: /생년월일 넣기/ }).click();
  await expect(page).toHaveURL(/\/saju\/new\?topic=love$/, { timeout: NAV });
  await page.getByLabel("태어난 연도").selectOption("1994");
  await page.getByLabel("태어난 월").selectOption("4");
  await page.getByLabel("태어난 일").selectOption("12");
  await page.getByRole("button", { name: "여성", exact: true }).click();
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page).toHaveURL(/\/saju\/chart\?topic=love$/, { timeout: NAV });
  await expect(page.getByText("연애운 · 맛보기", { exact: true })).toBeVisible({ timeout: GENERATION });
});

test("a worry's page at a phone's width: no side scroll, the start in reach, the other questions folded", async ({ page }, info) => {
  await ownAddress(page, info);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/w/job");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("어떤 일이 나랑 맞지?");
  await expect(page.getByText("일하는 방식과 잘 맞는 일의 결을 봐요. 합격 여부나 날짜는 예측하지 않아요.")).toBeVisible();
  await expect(page.getByRole("link", { name: /생년월일 넣기/ })).toHaveAttribute("href", "/saju/new?topic=career");
  await expect(page.getByText("시간 가는 줄 몰랐던 일은 뭐였지?")).toBeVisible();
  await expect(page.getByText("다음 자리에서 꼭 피하고 싶은 환경은 뭐지?")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
