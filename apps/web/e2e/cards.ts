import { expect, type Page } from "@playwright/test";

/** The draw table (CardTable): all the deck's cards, face down. */
export const cardTable = (page: Page) => page.getByRole("group", { name: /장 고르기$/ });

/** The cards left on the table, by role and name (a picked card flies to its slot and leaves the table). */
export const tableCards = (page: Page) => cardTable(page).getByRole("button", { name: /^카드 \d+$/ });

/** Slots holding a picked card, still face down. */
export const filledSlots = (page: Page) => page.getByRole("img", { name: /자리, 아직 뒤집지 않은 카드$/ });

/**
 * Clicks a card left on the table, as a person would: cards overlap, so it takes one whose middle is on top
 * (any card will do, they are all face down) and clicks it there by its role and name.
 */
export async function pickCard(page: Page): Promise<void> {
  await cardTable(page).scrollIntoViewIfNeeded();
  const name = await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>("button[data-card]:not([hidden])")) {
      if (el.getAttribute("aria-disabled") === "true") continue;
      const r = el.getBoundingClientRect();
      if (document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("button") === el) return el.getAttribute("aria-label");
    }
    return null;
  });
  expect(name, "a card on the table shows its middle").not.toBeNull();
  await page.getByRole("button", { name: name!, exact: true }).click();
  // A tap within 300 ms on the spot of the card just picked counts as the same tap (a double tap), so the next pick waits that out.
  await page.waitForTimeout(320);
}
