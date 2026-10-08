// Instagram 4:5 slides of readings already saved on a device (state/<nick>-*.json): no AI call.
// Renders the chapter at 540 css px wide (DPR 2 = 1080 px), cuts it at card boundaries into slides whose
// height keeps the text readable, and writes the raw clips; compose4x5.py then sets each on a 1080x1350 canvas.
// usage: node insta.mjs <raw_out_dir> <state.json> <chapterId> <label> [<state> <id> <label> ...]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire("D:/Money/apps/saju-tarot/package.json");
const { chromium } = require("@playwright/test");
const BASE = "http://localhost:3100";
const [out, ...rest] = process.argv.slice(2);
const HIDE = `nextjs-portal{display:none!important} nav[aria-label="주요 메뉴"]{display:none!important}`;
const MAX_GROUP = 950; // css px per slide at 540 wide: the 4:5 frame then shrinks text to no less than ~0.65x

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

const browser = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe` });
for (let r = 0; r < rest.length; r += 3) {
  const [state, id, label] = rest.slice(r, r + 3);
  const context = await browser.newContext({ storageState: state, viewport: { width: 540, height: 675 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await context.route(/\/api\/(saju|tarot)\//, (route) => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  await page.goto(`${BASE}/chapter/${id}`);
  await page.locator("#chapter-reading").waitFor();
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(2000);
  const blocks = await page.evaluate(() => {
    let el = document.querySelector("#chapter-reading");
    while (el && el.children.length === 1) el = el.children[0];
    return [...(el?.children ?? [])].map((c) => { const b = c.getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY, tag: c.tagName }; }).filter((b) => b.bottom - b.top > 12);
  });
  // greedy: consecutive cards while they fit one 4:5 frame at full size (635 css px tall; 660 allows a 0.96x shrink)
  const LIMIT = 660;
  const groups = [];
  let start = 0;
  for (let i = 1; i <= blocks.length; i++) {
    if (i === blocks.length || blocks[i].bottom - blocks[start].top > LIMIT) { groups.push([start, i]); start = i; }
  }
  const total = blocks.at(-1).bottom - blocks[0].top;
  const dir = join(out, label); mkdirSync(dir, { recursive: true });
  // margins stay inside the gap to the neighbouring cards, so no sliver of the next card shows
  const above = (a) => (a === 0 ? 16 : Math.min(16, (blocks[a].top - blocks[a - 1].bottom) / 2 - 1));
  const below = (b) => (b === blocks.length ? 16 : Math.min(16, (blocks[b].top - blocks[b - 1].bottom) / 2 - 1));
  const clips = [[0, blocks[0].top - 10], ...groups.map(([a, b]) => [blocks[a].top - above(a), blocks[b - 1].bottom + below(b)])];
  let n = 0;
  for (const [y0, y1] of clips) {
    n += 1;
    await page.screenshot({ path: join(dir, `${String(n).padStart(2, "0")}.png`), fullPage: true, clip: { x: 0, y: Math.max(0, y0), width: 540, height: Math.ceil(y1 - Math.max(0, y0)) } });
  }
  console.log("saved", label, n, "clips; reading", Math.round(total), "css px in", groups.length, "groups");
  await context.close();
}
await browser.close();
