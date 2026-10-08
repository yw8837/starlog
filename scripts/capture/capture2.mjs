// Real readings through the app's own screens (local dev server, owner pass), saved for sharing:
// <out>/<nick>/<n 풀이>/<k>.png — at most 6 phone-width images per reading (the head with the chart or the cards,
// then the reading's cards in up to 5 balanced groups). No teaser images. The tab bar and the dev badge are hidden.
// usage: node capture2.mjs <out_dir> <testers.json> [nick,nick] [saju,topic,tarot]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("D:/Money/apps/saju-tarot/package.json");
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE ?? "http://localhost:3100";
const [outDir, testersPath, onlyNicks, onlyKinds] = process.argv.slice(2);
const testers = JSON.parse(readFileSync(testersPath, "utf8")).filter((t) => !onlyNicks || onlyNicks.split(",").includes(t.nick));
const kinds = new Set((onlyKinds ?? "saju,topic,tarot").split(","));
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const textDir = here("./text2/");
const stateDir = here("./state/");
mkdirSync(textDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });

const envLine = readFileSync("D:/Money/apps/saju-tarot/apps/web/.env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("STARLOG_OWNER_CODE="));
if (!envLine) throw new Error("STARLOG_OWNER_CODE missing in .env.local");
const OWNER_CODE = envLine.slice("STARLOG_OWNER_CODE=".length).trim().replace(/^["']|["']$/g, "");
const HIDE = `nextjs-portal{display:none!important} nav[aria-label="주요 메뉴"]{display:none!important}`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function ownerPage(browser, n) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul",
    extraHTTPHeaders: { "x-forwarded-for": `10.78.${n}.${10 + Math.floor(Math.random() * 200)}` },
  });
  const res = await context.request.post(`${BASE}/api/owner`, { data: { code: OWNER_CODE }, timeout: 180_000 });
  if (!res.ok()) throw new Error(`owner pass: HTTP ${res.status()}`);
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  page.setDefaultNavigationTimeout(180_000);
  return { context, page };
}

/** The device's own count of today's free full readings (the owner pass skips the server's): cleared before each opening. */
async function freshDay(page) {
  await page.evaluate(() => localStorage.removeItem("starlog.beta-usage"));
  await page.reload();
}

/** Waits until the text under `selector` stops changing for 4 polls 3 s apart. */
async function settled(page, selector, maxMs = 300_000) {
  const t0 = Date.now();
  let last = -1, same = 0;
  while (Date.now() - t0 < maxMs) {
    const len = await page.locator(selector).evaluateAll((els) => els.reduce((n, e) => n + e.innerText.length, 0)).catch(() => 0);
    same = len > 0 && len === last ? same + 1 : 0;
    last = len;
    if (same >= 4) return len;
    await page.waitForTimeout(3000);
  }
  throw new Error(`not settled: ${selector}`);
}

/** Consecutive blocks into at most k groups, minimising the tallest group (linear partition). */
function partition(heights, k) {
  const n = heights.length;
  k = Math.min(k, n);
  const pre = [0];
  for (const h of heights) pre.push(pre.at(-1) + h);
  const cost = Array.from({ length: k + 1 }, () => Array(n + 1).fill(Infinity));
  const cut = Array.from({ length: k + 1 }, () => Array(n + 1).fill(0));
  cost[0][0] = 0;
  for (let g = 1; g <= k; g++)
    for (let i = 1; i <= n; i++)
      for (let j = g - 1; j < i; j++) {
        const c = Math.max(cost[g - 1][j], pre[i] - pre[j]);
        if (c < cost[g][i]) { cost[g][i] = c; cut[g][i] = j; }
      }
  const groups = [];
  for (let g = k, i = n; g > 0; g--) { const j = cut[g][i]; groups.unshift([j, i]); i = j; }
  return groups;
}

const safeName = (s) => s.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);

/** The chapter page as up to 6 images: the head (chart or cards, up to the reading), then the reading in ≤5 groups. */
async function captureChapter(page, dir, label) {
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  const { blocks } = await page.evaluate(() => {
    let el = document.querySelector("#chapter-reading");
    while (el && el.children.length === 1) el = el.children[0];
    const blocks = [...(el?.children ?? [])]
      .map((c) => {
        const r = c.getBoundingClientRect();
        const head = c.querySelector("h2,h3,h4")?.innerText ?? (/^H[2-4]$/.test(c.tagName) ? c.innerText : "");
        return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, tag: c.tagName, head: head.split("\n")[0] };
      })
      .filter((b) => b.bottom - b.top > 12);
    return { blocks };
  });
  if (!blocks.length) throw new Error("no reading blocks");
  // never end a group on a bare heading
  const groups = partition(blocks.map((b) => b.bottom - b.top), 5).map(([a, b]) => {
    while (b - a > 1 && /^H[2-4]$/.test(blocks[b - 1].tag)) b -= 1;
    return [a, b];
  });
  for (let g = 0; g < groups.length - 1; g++) groups[g + 1][0] = groups[g][1];
  mkdirSync(dir, { recursive: true });
  const shots = [{ name: `1 ${label}`, y0: 0, y1: blocks[0].top - 10 }];
  groups.forEach(([a, b], i) => {
    // short names: each heading up to its " · " (the card or section name), at most two per image
    const heads = blocks.slice(a, b).map((x) => x.head.split(" · ")[0].trim()).filter(Boolean);
    shots.push({ name: `${i + 2} ${safeName([...new Set(heads)].slice(0, 2).join("·") || "풀이")}`, y0: blocks[a].top - 14, y1: blocks[b - 1].bottom + 14 });
  });
  for (const s of shots) {
    await page.screenshot({ path: join(dir, `${s.name}.png`), fullPage: true, clip: { x: 0, y: Math.max(0, s.y0), width: 390, height: Math.ceil(s.y1 - Math.max(0, s.y0)) } });
  }
  log("saved", dir.split(/[\\/]/).slice(-2).join("/"), shots.length, "images");
}

async function toChart(page, t) {
  await page.goto(`${BASE}/saju/new`);
  if (t.calendar === "lunar") await page.getByRole("button", { name: "음력", exact: true }).click();
  await page.getByLabel("태어난 연도").selectOption(String(t.year));
  await page.getByLabel("태어난 월").selectOption(String(t.month));
  await page.getByLabel("태어난 일").selectOption(String(t.day));
  await page.getByRole("button", { name: t.gender, exact: true }).click();
  await page.getByRole("button", { name: "알아요" }).click();
  await page.getByLabel("태어난 시", { exact: true }).selectOption(String(t.hour));
  await page.getByLabel("태어난 분").selectOption(String(t.minute));
  await page.getByLabel("태어난 곳").selectOption(t.place);
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
  await page.getByRole("button", { name: "명식 보기" }).click();
  await page.waitForURL(/\/saju\/chart$/);
  await page.getByRole("region", { name: "전체 풀이에 담긴 것" }).waitFor();
}

async function openChapter(page, sheetName) {
  const sheet = page.getByRole("region", { name: sheetName });
  await sheet.waitFor();
  await sheet.getByRole("button", { name: /^전체 풀이 보기/ }).click();
  await page.waitForURL(/\/chapter\/[a-z0-9]{6,32}$/, { timeout: 300_000 });
  await page.locator("#chapter-reading").waitFor();
  return settled(page, "#chapter-reading");
}

async function saju(browser, t, n) {
  const { context, page } = await ownerPage(browser, n);
  try {
    await toChart(page, t);
    let k = 1;
    if (kinds.has("saju")) {
      await freshDay(page);
      const len = await openChapter(page, "전체 풀이에 담긴 것");
      log(t.nick, "정통 사주", len, "chars");
      writeFileSync(join(textDir, `${t.nick}-정통 사주.txt`), await page.locator("main").innerText());
      await captureChapter(page, join(outDir, t.nick, `${k++} 정통 사주`), "명식");
      // after the screenshots: the same text with **bold** kept, for scripts/reading-voice-metrics.mjs
      await page.evaluate(() => document.querySelectorAll("#chapter-reading strong").forEach((s) => { s.textContent = `**${s.textContent}**`; }));
      writeFileSync(join(textDir, `${t.nick}-정통 사주.bold.txt`), await page.locator("main").innerText());
    }
    if (kinds.has("topic")) {
      for (const topic of t.topics) {
        await page.goto(`${BASE}/saju/chart`);
        await freshDay(page);
        await page.getByRole("group", { name: "다른 운도 볼 수 있어요" }).getByRole("button", { name: topic }).click();
        await page.getByText(`${topic} · 맛보기`, { exact: true }).waitFor();
        const len = await openChapter(page, `${topic} 전체 풀이에 담긴 것`);
        log(t.nick, topic, len, "chars");
        writeFileSync(join(textDir, `${t.nick}-${topic}.txt`), await page.locator("main").innerText());
        await captureChapter(page, join(outDir, t.nick, `${k++} ${topic}`), "명식");
      }
    }
    await context.storageState({ path: join(stateDir, `${t.nick}-saju.json`) });
  } finally {
    await context.close();
  }
}

async function pickFanCard(page, index) {
  const point = await page.evaluate((i) => {
    const el = document.querySelectorAll("[data-fan-index]")[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let y = r.top + 6; y < r.bottom; y += 6)
      for (let x = r.left + 2; x < r.right; x += 3)
        if (document.elementFromPoint(x, y)?.closest("[data-fan-index]") === el) return { x, y };
    return null;
  }, index);
  if (!point) throw new Error(`fan card ${index} not visible`);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(700);
}

async function tarot(browser, t, n) {
  const q = t.tarot;
  const { context, page } = await ownerPage(browser, n + 50);
  try {
    await page.goto(`${BASE}/tarot/new`);
    await page.getByRole("button", { name: "나", exact: true }).click();
    // a chip, or the tester's own words when the form answer has no matching chip (e.g. two topics at once)
    if (q.topicText) await page.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" }).fill(q.topicText);
    else await page.getByRole("button", { name: q.topic }).click();
    if (q.whenText) await page.getByRole("textbox", { name: "언제인지 직접 쓰기" }).fill(q.whenText);
    else await page.getByRole("button", { name: q.when }).click();
    await page.getByRole("button", { name: "다음" }).click();
    await page.waitForURL(/\/tarot\/new\/situation$/);
    for (const chip of q.chips ?? []) await page.getByRole("button", { name: chip, exact: true }).click();
    await page.getByLabel("한 줄 메모").fill(q.memo);
    await page.getByRole("button", { name: "카드 뽑기" }).click();
    await page.waitForURL(/\/tarot\/draw$/);
    await page.goto(`${BASE}/tarot/draw?instant=1`);
    await page.locator("[data-fan-index]").first().waitFor();
    await page.waitForTimeout(1500);
    const fan = await page.locator("[data-fan-index]").count();
    for (let i = 2; i < fan && !(await page.getByText("모두 골랐어요").isVisible()); i += 5) await pickFanCard(page, i);
    await page.getByText("모두 골랐어요").waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "결과 보기" }).click();
    await page.waitForURL(/\/tarot\/result/);
    const len = await openChapter(page, "전체 풀이에 담긴 것");
    log(t.nick, "타로", len, "chars");
    writeFileSync(join(textDir, `${t.nick}-타로.txt`), await page.locator("main").innerText());
    const k = t.year ? 2 + (t.topics?.length ?? 0) : 1; // after "1 정통 사주" and the topics; a tarot-only tester starts at 1
    await captureChapter(page, join(outDir, t.nick, `${k} 타로`), "질문과 카드");
    await context.storageState({ path: join(stateDir, `${t.nick}-tarot.json`) });
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe` });
let n = 0;
const failures = [];
for (const t of testers) {
  n += 1;
  try {
    if (kinds.has("saju") || kinds.has("topic")) await saju(browser, t, n);
    if (kinds.has("tarot") && t.tarot) await tarot(browser, t, n);
  } catch (error) {
    failures.push(`${t.nick}: ${error.message.split("\n")[0]}`);
    log("FAILED", t.nick, error.message.split("\n")[0]);
  }
}
await browser.close();
log("done", failures.length ? `failures: ${failures.join(" | ")}` : "no failures");
