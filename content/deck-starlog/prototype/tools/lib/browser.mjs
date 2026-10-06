// Playwright (system Chrome) via the app's own dependency tree.
import { createRequire } from "node:module";

const require = createRequire("D:/Money/apps/saju-tarot/apps/web/package.json");
const { chromium } = require("playwright");
export const sharp = require("sharp");

export async function launch() {
  return chromium.launch({ channel: "chrome" });
}

/** Screenshot an SVG file (or any URL) to a PNG at the given device scale factor. */
export async function shotSvg(browser, svgPath, outPng, { width = 600, height = 1040, scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  const url = `file:///${svgPath.replace(/\\/g, "/")}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(150);
  await page.screenshot({ path: outPng, clip: { x: 0, y: 0, width, height }, omitBackground: false });
  await ctx.close();
}
