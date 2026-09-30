import { expect, test, type Page } from "@playwright/test";

/**
 * Phone widths: the page never scrolls sideways, and no text sits past the screen edge. The second
 * check matters because .page-shell clips horizontal overflow (overflow-x: clip): a too-wide footer
 * is cut off at the right edge without ever raising document.scrollWidth.
 */
const WIDTHS = [360, 375];
const PATHS = ["/"];

async function measure(page: Page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const outside: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest('[aria-hidden="true"], svg, script, style, nextjs-portal')) continue;
      const ownText = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!ownText) continue;
      const style = getComputedStyle(el);
      if (style.clipPath === "inset(50%)" || style.display === "none" || style.visibility === "hidden") continue;
      for (const rect of el.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;
        if (rect.right > width + 0.5 || rect.left < -0.5) {
          outside.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(rect.left)}–${Math.round(rect.right)}`);
          break;
        }
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, width, outside };
  });
}

for (const width of WIDTHS) {
  for (const path of PATHS) {
    test(`${path} fits a ${width}px screen`, async ({ page }, info) => {
      test.skip(info.project.name !== "mobile", "sets its own phone viewport; one run is enough");
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      const { scrollWidth, outside } = await measure(page);
      expect(scrollWidth, "document scroll width").toBeLessThanOrEqual(width);
      expect(outside, "text past the screen edge").toEqual([]);
    });
  }
}
