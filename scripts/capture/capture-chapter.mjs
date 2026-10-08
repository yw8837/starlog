// Captures one chapter already stored on a device (storage state) as ≤6 phone-width images, like capture2's
// captureChapter. No AI call: the reading APIs are blocked.
// usage: node capture-chapter.mjs <state.json> <chapterId> <out_dir> <label> [<bold_text_out>]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire("D:/Money/apps/saju-tarot/package.json");
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3100";
const [state, id, dir, label, boldOut] = process.argv.slice(2);
const HIDE = `nextjs-portal{display:none!important} nav[aria-label="주요 메뉴"]{display:none!important}`;

function partition(heights, k) {
  const n = heights.length; k = Math.min(k, n);
  const pre = [0]; for (const h of heights) pre.push(pre.at(-1) + h);
  const cost = Array.from({ length: k + 1 }, () => Array(n + 1).fill(Infinity));
  const cut = Array.from({ length: k + 1 }, () => Array(n + 1).fill(0));
  cost[0][0] = 0;
  for (let g = 1; g <= k; g++) for (let i = 1; i <= n; i++) for (let j = g - 1; j < i; j++) {
    const c = Math.max(cost[g - 1][j], pre[i] - pre[j]);
    if (c < cost[g][i]) { cost[g][i] = c; cut[g][i] = j; }
  }
  const groups = []; for (let g = k, i = n; g > 0; g--) { const j = cut[g][i]; groups.unshift([j, i]); i = j; }
  return groups;
}
const safeName = (s) => s.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);

const browser = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe` });
const context = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
await context.route(/\/api\/(saju|tarot)\//, (route) => route.abort());
const page = await context.newPage();
page.setDefaultTimeout(180_000);
await page.goto(`${BASE}/chapter/${id}`);
await page.locator("#chapter-reading").waitFor();
await page.addStyleTag({ content: HIDE });
await page.waitForTimeout(2500);
await page.evaluate(() => window.scrollTo(0, 0));
const blocks = await page.evaluate(() => {
  let el = document.querySelector("#chapter-reading");
  while (el && el.children.length === 1) el = el.children[0];
  return [...(el?.children ?? [])].map((c) => {
    const r = c.getBoundingClientRect();
    const head = c.querySelector("h2,h3,h4")?.innerText ?? (/^H[2-4]$/.test(c.tagName) ? c.innerText : "");
    return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, tag: c.tagName, head: head.split("\n")[0] };
  }).filter((b) => b.bottom - b.top > 12);
});
if (!blocks.length) throw new Error("no reading blocks");
const groups = partition(blocks.map((b) => b.bottom - b.top), 5).map(([a, b]) => {
  while (b - a > 1 && /^H[2-4]$/.test(blocks[b - 1].tag)) b -= 1;
  return [a, b];
});
for (let g = 0; g < groups.length - 1; g++) groups[g + 1][0] = groups[g][1];
mkdirSync(dir, { recursive: true });
const shots = [{ name: `1 ${label}`, y0: 0, y1: blocks[0].top - 10 }];
groups.forEach(([a, b], i) => {
  const heads = blocks.slice(a, b).map((x) => x.head.split(" · ")[0].trim()).filter(Boolean);
  shots.push({ name: `${i + 2} ${safeName([...new Set(heads)].slice(0, 2).join("·") || "풀이")}`, y0: blocks[a].top - 14, y1: blocks[b - 1].bottom + 14 });
});
for (const s of shots) {
  await page.screenshot({ path: join(dir, `${s.name}.png`), fullPage: true, clip: { x: 0, y: Math.max(0, s.y0), width: 390, height: Math.ceil(s.y1 - Math.max(0, s.y0)) } });
}
const strongCount = await page.locator("#chapter-reading strong").count();
const literalStars = await page.evaluate(() => (document.querySelector("#chapter-reading")?.innerText.match(/\*\*/g) ?? []).length);
if (boldOut) {
  await page.evaluate(() => document.querySelectorAll("#chapter-reading strong").forEach((s) => { s.textContent = `**${s.textContent}**`; }));
  writeFileSync(boldOut, await page.locator("main").innerText());
}
console.log("saved", shots.length, "images · <strong>", strongCount, "· literal ** on screen", literalStars);
await browser.close();
