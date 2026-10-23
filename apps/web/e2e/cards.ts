import { expect, type Page } from "@playwright/test";

/** The draw table (CardTable): all the deck's cards, face down. */
export const cardTable = (page: Page) => page.getByRole("group", { name: /장 고르기$/ });

/** The cards left on the table, by role and name (a picked card flies to its slot and leaves the table). */
export const tableCards = (page: Page) => cardTable(page).getByRole("button", { name: /^카드 \d+$/ });

/** Slots holding a picked card, still face down. */
export const filledSlots = (page: Page) => page.getByRole("img", { name: /자리, 아직 뒤집지 않은 카드$/ });

/**
 * Clicks a card left on the table, as a person would: cards overlap, so it taps the middle of one that is on top there
 * (any card will do, they are all face down) and checks that the card left the table.
 */
export async function pickCard(page: Page): Promise<void> {
  await cardTable(page).scrollIntoViewIfNeeded();
  const left = await tableCards(page).count();
  // The table can still be settling, so the card on top at a point can change between finding it and a locator's click
  // (gate 2026-10-23: card 26 kept landing over card 6). Tap the point found a moment ago instead, and if no card left
  // the table, look again.
  for (let attempt = 1; ; attempt++) {
    const point = await page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>("button[data-card]:not([hidden])")) {
        if (el.getAttribute("aria-disabled") === "true") continue;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        if (document.elementFromPoint(x, y)?.closest("button") === el) return { x, y };
      }
      return null;
    });
    expect(point, "a card on the table shows its middle").not.toBeNull();
    await page.mouse.click(point!.x, point!.y);
    try {
      // fewer cards on the table (after the last pick the table may go altogether)
      await expect.poll(() => tableCards(page).count(), { timeout: 2_000 }).toBeLessThan(left);
      break;
    } catch (error) {
      if (attempt >= 5) throw error;
      // A tap within 300 ms on the same spot counts as the same tap (a double tap).
      await page.waitForTimeout(320);
    }
  }
  // A tap within 300 ms on the spot of the card just picked counts as the same tap (a double tap), so the next pick waits that out.
  await page.waitForTimeout(320);
}
