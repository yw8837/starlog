import { expect, type Locator, type Page } from "@playwright/test";

/** The 방문 통계 consent banner (components/seo/ConsentBanner.tsx). */
export const consentBanner = (page: Page) => page.getByRole("region", { name: "방문 통계를 켜도 될까요?" });

/**
 * The page's key control can be used while the banner is up: brought to the middle of the window, nothing lies over
 * its centre (the banner included), and a click would land on it.
 */
export async function usable(control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  await control.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const onTop = await control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && el.contains(hit);
  });
  expect(onTop, "nothing covers the control").toBe(true);
  await control.click({ trial: true });
}
