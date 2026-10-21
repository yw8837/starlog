import { expect, test, type Page } from "@playwright/test";
import { cardTable, filledSlots, tableCards } from "./cards";

/**
 * The draw table under real touch input (project "touch": hasTouch + isMobile, pointerType "touch").
 * Taps use Playwright's touchscreen; drags use raw CDP touch events, the same stream a finger sends.
 */

async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}

/**
 * The draw page deals only for a question (a visit without one goes back to the builder), so each test
 * starts with one saved just now, as screens.spec.ts does (a 30-minute-old flow starts clean).
 */
const FLOW = { who: "us", topicId: "contact", when: "month", conditions: { relation: "알아가는 중", "recent-contact": "뜸해짐" }, note: "" };

const modeButton = (page: Page, name: "흩뿌리기" | "돌리기") => page.getByRole("group", { name: "카드 펼치는 방식" }).getByRole("button", { name });

/** The card on top at a point, as the page's own hit test sees it. */
const cardAt = (page: Page, x: number, y: number) =>
  page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-card]")?.dataset.card ?? null, { x, y });

const transforms = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-card]")].map((el) => el.style.transform));

/** The table in view, and its box. */
async function tableBox(page: Page) {
  await cardTable(page).scrollIntoViewIfNeeded();
  const box = await cardTable(page).boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => window.sessionStorage.setItem("starlog.tarot-flow", value), JSON.stringify({ savedAt: Date.now(), ...FLOW }));
  await page.goto("/tarot/draw?instant=1");
  await expect(tableCards(page)).toHaveCount(78);
  await settleAnimations(page);
});

test("흩뿌리기: a tap picks the card on top under the finger; the undo puts it back", async ({ page }) => {
  await expect(modeButton(page, "흩뿌리기")).toHaveAttribute("aria-pressed", "true");
  const box = await tableBox(page);
  const spot = { x: box.x + box.width / 2, y: box.y + box.height * 0.45 };
  const under = await cardAt(page, spot.x, spot.y);
  expect(under, "a card lies under the middle of the table").not.toBeNull();

  await page.touchscreen.tap(spot.x, spot.y);
  await expect(filledSlots(page)).toHaveCount(1);
  await expect(page.locator(`[data-card="${under}"]`)).toBeHidden();
  await expect(tableCards(page)).toHaveCount(77);
  await expect(page.getByText("마음이 가는 카드를 2장 더 골라 주세요")).toBeVisible();

  await page.getByRole("button", { name: "방금 고른 카드 빼기" }).tap();
  await expect(filledSlots(page)).toHaveCount(0);
  await expect(tableCards(page)).toHaveCount(78);
});

test("돌리기: a sideways drag turns the ring without picking or scrolling the page; a tap then picks", async ({ page }) => {
  await modeButton(page, "돌리기").tap();
  await settleAnimations(page);
  const box = await tableBox(page);
  // The ring's top band, where a card lies all the way across.
  const y = box.y + 80;
  const before = await transforms(page);
  await touchDrag(page, { x: box.x + box.width * 0.75, y }, { x: box.x + box.width * 0.25, y });
  const after = await transforms(page);
  expect(after.filter((t, i) => t !== before[i]).length).toBeGreaterThan(70);
  await expect(filledSlots(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);

  // Once it comes to rest, a tap picks the card under the finger.
  await expect(cardTable(page)).not.toHaveAttribute("data-drag", { timeout: 5_000 });
  const spot = { x: box.x + box.width / 2, y: box.y + 70 };
  const under = await cardAt(page, spot.x, spot.y);
  expect(under, "a card lies at the top of the ring").not.toBeNull();
  await page.touchscreen.tap(spot.x, spot.y);
  await expect(filledSlots(page)).toHaveCount(1);
  await expect(page.locator(`[data-card="${under}"]`)).toBeHidden();
});

test.describe("on a short screen", () => {
  test.use({ viewport: { width: 375, height: 600 } });

  test("a vertical swipe over the table still scrolls the page, and picks nothing", async ({ page }) => {
    const box = await tableBox(page);
    const startY = await page.evaluate(() => window.scrollY);
    expect(startY, "the table sits below the first screen").toBeGreaterThan(0);
    await touchDrag(page, { x: box.x + box.width / 2, y: box.y + 40 }, { x: box.x + box.width / 2, y: box.y + 240 });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(startY);
    await expect(filledSlots(page)).toHaveCount(0);
  });
});

test("다시 섞기 keeps the picks", async ({ page }) => {
  const box = await tableBox(page);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.45);
  await expect(filledSlots(page)).toHaveCount(1);
  await page.getByRole("button", { name: "다시 섞기" }).tap();
  await expect(page.getByRole("status").filter({ hasText: "카드를 다시 섞었어요. 2장 더 골라 주세요" })).toBeVisible();
  await expect(filledSlots(page)).toHaveCount(1);
  await expect(tableCards(page)).toHaveCount(77);
});

for (const width of [375, 360]) {
  test.describe(`${width}px wide`, () => {
    test.use({ viewport: { width, height: width === 360 ? 780 : 812 } });

    test("no sideways page scroll in either mode; the toggle and 다시 섞기 share one row; the ring shows about 16 cards", async ({ page }) => {
      for (const mode of ["흩뿌리기", "돌리기"] as const) {
        await modeButton(page, mode).tap();
        await settleAnimations(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${mode}: sideways overflow`).toBeLessThanOrEqual(0);
      }
      const modes = (await page.getByRole("group", { name: "카드 펼치는 방식" }).boundingBox())!;
      const reshuffle = (await page.getByRole("button", { name: "다시 섞기" }).boundingBox())!;
      expect(Math.abs(modes.y + modes.height / 2 - (reshuffle.y + reshuffle.height / 2))).toBeLessThan(4);
      expect(reshuffle.x + reshuffle.width).toBeLessThanOrEqual(width);

      const box = await tableBox(page);
      const shown = await page.evaluate(
        ({ left, right, top, bottom }) =>
          [...document.querySelectorAll<HTMLElement>("[data-card]")].filter((el) => {
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            return x >= left && x <= right && y >= top && y <= bottom;
          }).length,
        { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height },
      );
      expect(shown).toBeGreaterThanOrEqual(13);
      expect(shown).toBeLessThanOrEqual(19);
    });
  });
}
