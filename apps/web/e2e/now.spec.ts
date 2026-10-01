import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Side = { answers: string[]; why: string; tip: string };
const DB: Record<string, Record<"upright" | "reversed", Side>> = JSON.parse(
  readFileSync(new URL("../lib/decision.generated.json", import.meta.url), "utf8"),
);
const ALL_ANSWERS = new Set(Object.values(DB).flatMap((card) => [...card.upright.answers, ...card.reversed.answers]));

const SHOTS = "test-results/screens/now";
const SIZES = [
  { width: 375, height: 812 },
  { width: 360, height: 780 },
  { width: 1280, height: 800 },
];

/** Waits until every finite CSS animation (the fan's deal-out, the page opening) has finished. */
async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}

/** Fan cards overlap, so click the card on a point where it is the top-most element. */
async function pickFanCard(page: Page, n: number) {
  const point = await page.evaluate((index) => {
    const el = document.querySelectorAll("[data-fan-index]")[index];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let y = r.top + 6; y < r.bottom; y += 6)
      for (let x = r.left + 2; x < r.right; x += 3)
        if (document.elementFromPoint(x, y)?.closest("[data-fan-index]") === el) return { x, y };
    return null;
  }, n);
  expect(point, `fan card ${n} has a visible spot`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

/** Skips the shuffle and waits for the 21-card fan to be dealt. */
async function openFan(page: Page) {
  await page.getByRole("button", { name: "바로 펼치기" }).click();
  await expect(page.locator("[data-fan-index]")).toHaveCount(21);
  await settleAnimations(page);
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // dev-only overlay badge
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

test("지금의 한 장: a question, one card, an answer from the DB and the upsell", async ({ page }) => {
  await page.goto("/now");
  await expect(page.getByRole("heading", { level: 1, name: "지금의 한 장" })).toBeVisible();
  await expect(page.getByText("타로가 건네는 한 문장")).toBeVisible();
  await expect(page.getByRole("list", { name: "뽑는 순서" }).getByRole("listitem")).toHaveCount(3);

  await page.getByLabel("고민 한 줄").fill("오늘 먼저 연락해도 될까?");
  await openFan(page);
  await pickFanCard(page, 10);

  const answer = page.getByRole("heading", { level: 2 });
  await expect(answer).toBeVisible();
  const text = (await answer.textContent()) ?? "";
  expect(ALL_ANSWERS.has(text), `"${text}" is a line from decision.ko.json`).toBe(true);
  await expect(answer).toBeFocused();
  await expect(page.getByText("오늘 먼저 연락해도 될까?")).toBeVisible();
  await expect(page.getByText("오늘 해 볼 일")).toBeVisible();

  const upsell = page.getByRole("link", { name: /기본 타로 3장으로 자세히 보기/ });
  await expect(upsell).toBeVisible();
  await expect(upsell).toHaveAttribute("href", "/tarot/new?new=1");

  // 한 번 더 뽑기: a new shuffle, the question kept, the ritual steps skipped.
  await page.getByRole("button", { name: "한 번 더 뽑기" }).click();
  await expect(page.getByLabel("고민 한 줄")).toHaveValue("오늘 먼저 연락해도 될까?");
  await expect(page.getByRole("list", { name: "뽑는 순서" })).toHaveCount(0);
  await openFan(page);
  await pickFanCard(page, 4);
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
});

test("지금의 한 장 screens at 375, 360 and 1280 wide @screens", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "one sweep sets its own viewports");
  for (const size of SIZES) {
    const tag = `${size.width}x${size.height}`;
    await page.setViewportSize(size);
    await page.goto("/now");
    await page.getByLabel("고민 한 줄").fill("오늘 먼저 연락해도 될까?");
    await openFan(page);
    await shot(page, `${tag}-01-pick`);
    await pickFanCard(page, 10);
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
    await settleAnimations(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `${tag}-02-result`);
    await shot(page, `${tag}-03-result-full`, true);
  }
});
