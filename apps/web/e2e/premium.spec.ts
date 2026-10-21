import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { pickCard, tableCards } from "./cards";
import { fakeBrowserClock, ownerPass } from "./opening";

/**
 * Premium readings (stage 4, plan Task 26) against a server whose STARLOG_PREMIUM this run is told in E2E_PREMIUM:
 * - `off` (the default, today's production and `pnpm e2e`'s dev server): a visitor sees no premium entry at all.
 * - `owner` or `on` (a preview with STARLOG_PREMIUM set, mock AI): the visitor check above still holds for `owner`, and
 *   with the owner pass the entries lead through the flows: the tarot bridge → 켈틱 크로스 10장 → the builder's chip →
 *   ten cards → the free preview → the open panel; saju step 1's premium rows → the 프리미엄 궁합 form → its preview; and
 *   the 2027 신년운세 row leads to its form (everything on sale since 2026-10-20, owner: no opening dates).
 * Which tests exist follows E2E_PREMIUM, so the default run (premium off) only declares what off must show.
 * run: E2E_PREMIUM=owner E2E_BASE_URL=<preview> E2E_OWNER_CODE=<its pass> pnpm e2e --grep premium
 */

const MODE = (process.env.E2E_PREMIUM ?? "off").trim().toLowerCase() as "off" | "owner" | "on";
const NAV = 30_000;
const GENERATION = 120_000;
/** Never on a premium screen: another spelling of the spread's name, beta framing, a model or vendor name. */
const BANS = /셀틱|celtic|베타|claude|anthropic|gpt|opus|sonnet/i;

test.beforeEach(async ({ page }) => fakeBrowserClock(page));

async function ownAddress(page: Page, info: TestInfo) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.11.${info.workerIndex}.${Math.floor(Math.random() * 250)}` });
}

async function settleAnimations(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
}

/** Picks `n` cards from the table (each click finds a card whose middle is on top). */
async function pickCards(page: Page, n: number) {
  await expect(tableCards(page).first()).toBeVisible({ timeout: NAV });
  await settleAnimations(page);
  for (let i = 0; i < n; i++) await pickCard(page);
  await expect(page.getByText("모두 골랐어요")).toBeVisible();
  await page.getByRole("button", { name: "결과 보기" }).click();
}

async function fillBirth(page: Page, year: number, month: number, day: number, gender: "여성" | "남성", consent: boolean) {
  await page.getByLabel("태어난 연도").selectOption(String(year));
  await page.getByLabel("태어난 월").selectOption(String(month));
  await page.getByLabel("태어난 일").selectOption(String(day));
  await page.getByRole("button", { name: gender, exact: true }).click();
  if (consent) await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

/** What the server answers this browser (owner pass or not): whether each premium product is visible here. */
async function visibleHere(page: Page): Promise<boolean> {
  const res = await page.request.get("/api/premium/status");
  const body = (await res.json()) as { products: Array<{ visible: boolean }> };
  return body.products.some((p) => p.visible);
}

if (MODE !== "on") {
  test("premium off for this visitor: no entry, no bridge, no row, no page, no footer link", async ({ page }, info) => {
    await ownAddress(page, info);
    expect(await visibleHere(page)).toBe(false);

    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: /타로 보기/ })).toHaveAttribute("href", "/tarot/new?new=1");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("region", { name: "더 깊게 보기" })).toHaveCount(0);
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "프리미엄 풀이" })).toHaveCount(0);
    await expect(main).not.toContainText("켈틱 크로스 10장");

    // The server sends /tarot/start on to /tarot/new?new=1; the builder then takes `new=1` off the address (takeFlag).
    await page.goto("/tarot/start");
    await expect(page).toHaveURL(/\/tarot\/new(\?new=1)?$/, { timeout: NAV });

    await page.goto("/saju/start");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("main")).not.toContainText("프리미엄");

    for (const path of ["/premium/deep-tarot", "/premium/match", "/premium/newyear-2027", "/premium/match/new"]) {
      expect((await page.request.get(path)).status(), path).toBe(404);
    }
    // The share image route follows the switch itself (owner mode keeps it for the owner's QA).
    if (MODE === "off") expect((await page.request.post("/api/og/premium", { data: { product: "newyear-2027", title: "차근차근 쌓아 가는 해" } })).status()).toBe(404);
  });
}

if (MODE !== "off") {
  test.describe("premium with the owner pass", () => {
    test.beforeEach(async ({ page }, info) => {
      await ownAddress(page, info);
      await ownerPass(page, info);
      expect(await visibleHere(page)).toBe(true);
    });

    test("the tarot bridge → 켈틱 크로스 10장 → the builder's chip → ten cards → the free preview → the open panel", async ({ page }) => {
      test.setTimeout(300_000);
      await page.goto("/");
      const tarot = page.getByRole("main").getByRole("link", { name: /타로 보기/ });
      await expect(tarot).toHaveAttribute("href", "/tarot/start", { timeout: NAV });
      await tarot.click();
      await expect(page.getByRole("heading", { level: 1, name: "어떤 타로를 볼까요?" })).toBeVisible({ timeout: NAV });
      await noSideScroll(page);
      await page.getByRole("list", { name: "타로 고르기" }).getByRole("link", { name: /켈틱 크로스 10장/ }).click();
      // The bridge links to ?new=1&spread=deep; the builder then takes `new=1` off the address (takeFlag).
      await expect(page).toHaveURL(/\/tarot\/new\?(new=1&)?spread=deep$/, { timeout: NAV });

      // The same builder, with the chip saying which spread was chosen (not a button).
      await expect(page.getByText("켈틱 크로스 10장", { exact: true }).first()).toBeVisible({ timeout: NAV });
      await expect(page.getByRole("button", { name: "켈틱 크로스 10장" })).toHaveCount(0);
      await page.getByRole("button", { name: "나", exact: true }).click();
      await page.getByRole("button", { name: "재물운" }).click();
      await page.getByRole("button", { name: "이번 주" }).click();
      await page.getByRole("button", { name: "다음" }).click();
      await expect(page).toHaveURL(/\/tarot\/new\/situation/, { timeout: NAV });
      await expect(page.getByText("켈틱 크로스 10장", { exact: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "지금은 수입이 없음" }).click();
      await page.getByRole("button", { name: "카드 뽑기" }).click();
      await expect(page).toHaveURL(/\/tarot\/draw/, { timeout: NAV });

      await page.goto("/tarot/draw?instant=1");
      await pickCards(page, 10);
      await expect(page).toHaveURL(/\/premium\/deep-tarot\/result/, { timeout: NAV });

      // The free preview: the ten cards laid out and listed, then the panel that leads to checkout.
      await expect(page.getByRole("list", { name: "카드 10장 배치", exact: true }).getByRole("listitem")).toHaveCount(10, { timeout: GENERATION });
      await expect(page.getByRole("list", { name: "카드 10장", exact: true }).getByRole("listitem")).toHaveCount(10);
      const panel = page.getByRole("heading", { name: "켈틱 크로스 10장에 담긴 것" });
      await expect(panel).toBeVisible({ timeout: GENERATION });
      await expect(page.getByRole("main")).toContainText("7,900원");
      await expect(page.getByRole("button", { name: "운영자로 무료 열기" }).or(page.getByRole("link", { name: "로그인하고 결제하기" })).first()).toBeVisible();
      await expect(page.getByRole("main")).not.toContainText(BANS);
      await noSideScroll(page);
    });

    test("saju step 1's premium rows → the 프리미엄 궁합 form → its preview (saju only, no cards)", async ({ page }) => {
      test.setTimeout(300_000);
      await page.goto("/saju/start");
      const match = page.getByRole("link", { name: /프리미엄 궁합/ });
      await expect(match).toBeVisible({ timeout: NAV });
      await expect(match).toContainText("7,900원");
      await noSideScroll(page);
      await match.click();
      await expect(page).toHaveURL(/\/premium\/match\/new$/, { timeout: NAV });

      // A fresh browser has no saved profile: my birth first (with the consent), then the other person's (none asked for them).
      await expect(page.getByRole("heading", { level: 1, name: "나의 태어난 날을 알려 주세요" })).toBeVisible({ timeout: NAV });
      await fillBirth(page, 1990, 1, 1, "여성", true);
      await page.getByRole("button", { name: "다음" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "그 사람의 태어난 날을 알려 주세요" })).toBeVisible({ timeout: NAV });
      await expect(page.getByLabel("태어난 곳")).toHaveCount(0);
      await page.getByLabel(/부르는 말/).fill("민지");
      await fillBirth(page, 1992, 2, 26, "남성", false);
      await page.getByRole("button", { name: "다음" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "어떤 사이인지 알려 주세요" })).toBeVisible({ timeout: NAV });
      await page.getByRole("button", { name: "친구" }).click();
      await page.getByRole("checkbox", { name: "상대에게 알리거나 동의를 받을 수 있는 사이에서만 입력할게요" }).check();
      await page.getByRole("button", { name: "두 사람 미리 보기" }).click();
      await expect(page).toHaveURL(/\/premium\/match\/preview$/, { timeout: NAV });
      // The partner's birth stays out of the address all the way.
      expect(page.url()).not.toMatch(/1992|partner/);

      await expect(page.getByRole("heading", { level: 1, name: "프리미엄 궁합 · 친구" })).toBeVisible({ timeout: NAV });
      await expect(page.getByRole("heading", { level: 3, name: "민지" })).toBeVisible({ timeout: GENERATION });
      await expect(page.getByRole("list", { name: "카드 5장", exact: true })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "프리미엄 궁합에 담긴 것" })).toBeVisible({ timeout: GENERATION });
      await expect(page.getByRole("main")).not.toContainText(BANS);
      expect(page.url()).not.toMatch(/1992|partner/);
      await noSideScroll(page);
    });

    test("the 2027 신년운세 row leads to its form, with no opening date (owner 2026-10-20)", async ({ page }) => {
      await page.goto("/saju/start");
      const row = page.getByRole("link", { name: /2027 신년운세/ });
      await expect(row).toBeVisible({ timeout: NAV });
      await expect(row).toContainText("14,900원");
      await expect(row).not.toContainText("열려요");
      await expect(row).toHaveAttribute("href", "/premium/newyear-2027/new");
    });
  });
}
