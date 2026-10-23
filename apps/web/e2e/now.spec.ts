import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { pickCard, tableCards } from "./cards";
import { openShared } from "./shareShots";

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

/** Waits until every finite CSS animation and transition (the table's spread, the page opening) has finished. */
async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}

/** Skips the shuffle and waits for the 78 cards to be spread on the table. */
async function openTable(page: Page) {
  await page.getByRole("button", { name: "바로 펼치기" }).click();
  await expect(tableCards(page)).toHaveCount(78);
  await settleAnimations(page);
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // dev-only overlay badge
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

test("지금의 한 장: how-to, a question, a short shuffle, one card, an answer from the DB and the upsell", async ({ page }) => {
  await page.goto("/now");
  await expect(page.getByRole("heading", { level: 1, name: "지금의 한 장" })).toBeVisible();
  await expect(page.getByText("무료 원카드 타로가 건네는 한 문장")).toBeVisible();

  // First visit: the three steps are open; 알겠어요 folds them behind 사용법 보기.
  const howto = page.getByRole("region", { name: "지금의 한 장 사용법" });
  const toggle = howto.getByRole("button", { name: "사용법 보기" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(howto.getByRole("listitem")).toHaveCount(3);
  await howto.getByRole("button", { name: "알겠어요" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(howto.getByRole("listitem")).toHaveCount(0);
  await expect(toggle).toBeFocused();

  // The shuffle is one riffle: the table is out well within 2 seconds without skipping it.
  await page.getByLabel("고민 한 줄").fill("오늘 먼저 연락해도 될까?");
  await expect(tableCards(page)).toHaveCount(78, { timeout: 2500 });
  await settleAnimations(page);
  await pickCard(page);

  const answer = page.locator("h2:not(#now-guide):not(#share-result-title)");
  await expect(answer).toBeVisible();
  const text = (await answer.textContent()) ?? "";
  expect(ALL_ANSWERS.has(text), `"${text}" is a line from decision.ko.json`).toBe(true);
  await expect(answer).toBeFocused();
  await expect(page.getByText("오늘 먼저 연락해도 될까?")).toBeVisible();
  // 오늘 해 볼 일 belongs to 오늘의 한 장; the answer here is the card's reading only.
  await expect(page.getByText("오늘 해 볼 일")).toHaveCount(0);

  const upsell = page.getByRole("link", { name: /타로 전체 풀이 보기/ });
  await expect(upsell).toBeVisible();
  await expect(upsell).toHaveAttribute("href", "/tarot/new?new=1");

  // How answers are made: folded until asked, with the two guide links.
  const about = page.getByRole("button", { name: "어떻게 답이 나오나요?" });
  await expect(about).toHaveAttribute("aria-expanded", "false");
  await about.click();
  const panel = page.getByRole("region", { name: "어떻게 답이 나오나요?" });
  await expect(panel).toContainText("카드 지식으로 미리 준비한 답");
  await expect(panel.getByRole("link", { name: "같은 질문으로 다시 뽑아도 될까요?" })).toHaveAttribute("href", "/guide/redrawing-same-question");
  await expect(panel.getByRole("link", { name: /더 자세히: 지금의 한 장 사용법/ })).toHaveAttribute("href", "/guide/now-card-how-to");

  // 한 번 더 뽑기: the deck shuffles again, the question stays, the steps stay folded.
  await page.getByRole("button", { name: "한 번 더 뽑기" }).click();
  await expect(page.getByText("카드를 섞고 있어요")).toBeVisible();
  await expect(page.getByLabel("고민 한 줄")).toHaveValue("오늘 먼저 연락해도 될까?");
  await expect(page.getByRole("button", { name: "사용법 보기" })).toHaveAttribute("aria-expanded", "false");
  await openTable(page);
  // 다시 섞기 before picking shuffles the cards on the table again (input waits until they are down).
  const reshuffle = page.getByRole("button", { name: "다시 섞기" });
  await reshuffle.click();
  await expect(reshuffle).toHaveAttribute("aria-disabled", "true");
  await expect(reshuffle).toHaveAttribute("aria-disabled", "false", { timeout: 10_000 });
  await settleAnimations(page);
  await pickCard(page);
  await expect(page.locator("h2:not(#now-guide):not(#share-result-title)")).toBeVisible();

  // A later visit keeps the steps folded.
  await page.reload();
  await expect(page.getByRole("button", { name: "사용법 보기" })).toHaveAttribute("aria-expanded", "false");
});

test("지금의 한 장 screens at 375, 360 and 1280 wide @screens", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "one sweep sets its own viewports");
  // Every size is shot as a first visit, with the how-to open.
  await page.addInitScript(() => window.localStorage.removeItem("starlog.now.howto"));
  for (const size of SIZES) {
    const tag = `${size.width}x${size.height}`;
    await page.setViewportSize(size);
    await page.goto("/now");
    await page.getByLabel("고민 한 줄").fill("오늘 먼저 연락해도 될까?");
    await openTable(page);
    await shot(page, `${tag}-01-pick`);
    await pickCard(page);
    await expect(page.locator("h2:not(#now-guide):not(#share-result-title)")).toBeVisible();
    await settleAnimations(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `${tag}-02-result`);
    await page.getByRole("button", { name: "어떻게 답이 나오나요?" }).click();
    await shot(page, `${tag}-03-result-full`, true);
  }
});

test("지금의 한 장 → 공유하기 → the link shows that card, its line and why, and 나도 한 장 뽑아 보기 (owner 2026-10-23)", async ({ page }, info) => {
  await page.goto("/now");
  await page.getByLabel("고민 한 줄").fill("이직해도 될까?");
  await openTable(page);
  await pickCard(page);
  const answer = page.locator("h2:not(#now-guide):not(#share-result-title)");
  await expect(answer).toBeVisible();
  const line = (await answer.innerText()).trim();
  const share = page.getByRole("button", { name: "공유하기" });
  await expect(share).toBeVisible();
  if (info.project.name === "mobile") {
    await share.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/share-shots/now-button.png" });
  }
  await share.click();
  const sheet = page.getByRole("dialog", { name: "결과 공유하기" });
  await sheet.getByRole("button", { name: "공유 링크 만들기" }).click();
  await expect(sheet).toContainText(/\/s\/[a-z0-9]{12}/, { timeout: 30_000 });
  await expect(sheet.getByRole("button", { name: "공유 그만하기" })).toHaveCount(0);
  const path = (/\/s\/[a-z0-9]{12}/.exec((await sheet.textContent()) ?? "") ?? [""])[0];

  const visitor = await page.context().browser()!.newPage({ viewport: page.viewportSize() ?? undefined });
  await visitor.goto(new URL(path, page.url()).toString());
  await expect(visitor).toHaveURL(new RegExp(`${path}$`));
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(line);
  await expect(visitor.locator("main")).not.toContainText("이직해도");
  const cta = visitor.getByRole("link", { name: /나도 한 장 뽑아 보기/ });
  await expect(cta).toBeVisible();
  if (info.project.name === "mobile") await visitor.screenshot({ path: "test-results/share-shots/now-shared.png", fullPage: true });
  await (await openShared(page, path, "now-shared")).close();
  await cta.click();
  await expect(visitor).toHaveURL(/\/now$/);
  await visitor.close();
});
