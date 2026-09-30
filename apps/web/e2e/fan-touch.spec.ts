import { expect, test, type Page } from "@playwright/test";

/**
 * The card fan under real touch input (project "touch": hasTouch + isMobile, pointerType "touch").
 * Taps use Playwright's touchscreen; the slide uses raw CDP touch events, the same stream a finger sends.
 */

async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}

/** A point on fan card `n` (by position in the arc) where that card is the top-most element. */
async function spotOn(page: Page, n: number) {
  const point = await page.evaluate((index) => {
    const el = document.querySelectorAll("[data-fan-index]")[index];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // Prefer the middle band of the card: a 12px lift then keeps the point on the same card.
    for (let y = r.top + r.height * 0.45; y < r.bottom; y += 4)
      for (let x = r.left + 2; x < r.right; x += 2)
        if (document.elementFromPoint(x, y)?.closest("[data-fan-index]") === el) return { x, y };
    return null;
  }, n);
  expect(point, `fan card ${n} has a visible spot`).not.toBeNull();
  return point!;
}

const pickedFan = (page: Page) => page.locator('[data-fan-index][aria-pressed="true"]');
const fanIndexAt = (page: Page, n: number) => page.locator("[data-fan-index]").nth(n).getAttribute("data-fan-index");

test.beforeEach(async ({ page }) => {
  await page.goto("/tarot/draw?instant=1");
  await expect(page.locator("[data-fan-index]")).toHaveCount(21);
  await settleAnimations(page);
});

test("a single tap picks a card, and a second tap on it keeps it picked", async ({ page }) => {
  const spot = await spotOn(page, 6);
  await page.touchscreen.tap(spot.x, spot.y);
  await expect(pickedFan(page)).toHaveCount(1);
  await expect(pickedFan(page)).toHaveAttribute("data-fan-index", (await fanIndexAt(page, 6))!);
  await expect(page.getByText("마음이 가는 카드를 2장 더 골라 주세요")).toBeVisible();

  // The picked card is now lifted; tapping it again must not drop it.
  const lifted = await spotOn(page, 6);
  await page.touchscreen.tap(lifted.x, lifted.y);
  await expect(pickedFan(page)).toHaveCount(1);

  // Taking it back is the explicit undo.
  await page.getByRole("button", { name: "방금 고른 카드 빼기" }).tap();
  await expect(pickedFan(page)).toHaveCount(0);
  await expect(page.getByText("마음이 가는 카드를 3장 골라 주세요")).toBeVisible();
});

test("sliding along the arc and lifting the finger picks the card under it", async ({ page }) => {
  const end = await spotOn(page, 14);
  const start = { x: end.x - 90, y: end.y };
  const startIndex = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-fan-index]")?.dataset.fanIndex ?? null,
    start,
  );
  expect(startIndex, "the slide starts on a fan card").not.toBeNull();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + ((end.x - start.x) * i) / 12, y: end.y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await expect(pickedFan(page)).toHaveCount(1);
  const picked = await pickedFan(page).getAttribute("data-fan-index");
  expect(picked).toBe(await fanIndexAt(page, 14));
  expect(picked).not.toBe(startIndex);
  // No browser gesture took over: the page did not scroll sideways.
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
});
