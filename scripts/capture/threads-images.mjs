// Images for the Threads post, from the LIVE site at phone width (no AI calls): main, evidence numbers, sources.
// usage: node threads-images.mjs <out_dir>
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire("D:/Money/apps/saju-tarot/package.json");
const { chromium } = require("@playwright/test");
const SITE = "https://starlog.yeolmaeapps.kr";
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const HIDE = `nav[aria-label="주요 메뉴"]{display:none!important}`;

const browser = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe` });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
const page = await context.newPage();
page.setDefaultTimeout(60_000);

// 1. main: the first phone screen, as a visitor sees it
await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, "1 메인 화면.png") });

// 2-3. evidence: the four numbers, then the sources list
await page.goto(`${SITE}/evidence`, { waitUntil: "networkidle" });
await page.addStyleTag({ content: HIDE });
await page.waitForTimeout(1000);
const box = async (sel) => {
  const b = await page.locator(sel).first().boundingBox();
  const y = await page.evaluate(() => window.scrollY);
  return { top: b.y + y, bottom: b.y + y + b.height };
};
const glance = await box('section[aria-labelledby="glance-title"]');
await page.screenshot({ path: join(out, "2 근거 숫자.png"), fullPage: true, clip: { x: 0, y: 0, width: 390, height: Math.ceil(glance.bottom + 20) } });
const sources = await box('section[aria-labelledby="sources-title"]');
await page.screenshot({ path: join(out, "3 주요 원전·자료.png"), fullPage: true, clip: { x: 0, y: Math.max(0, sources.top - 20), width: 390, height: Math.ceil(sources.bottom - sources.top + 40) } });

await browser.close();
console.log("saved 3 images");
