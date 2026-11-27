import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { pickCard, tableCards } from "./cards";
import { fakeBrowserClock, loginForOpening, openingOn } from "./opening";
import { makeLink, openShared } from "./shareShots";

/**
 * 유행 다음 세 가지 end to end with mock AI (spec 2026-11-26 beyond trend §7): 이어 읽기 (/now → 이 카드로 이어 읽기 → the
 * question → the draw with that card first → the result and the opened reading starting with it, its 골라 읽기 row on top),
 * and 별명 이어뽑기 (a nicknamed share → 나도 한 장 뽑기 → 둘의 별명). On the 375px project each step leaves a screenshot in
 * BEYOND_SHOTS (default test-results/beyond-shots).
 */

const NAV = 30_000;
const GENERATION = 120_000;
const SHOTS = process.env.BEYOND_SHOTS ?? "test-results/beyond-shots";
const WORRY = "먼저 연락해도 될까?";

async function ownAddress(page: Page, info: TestInfo) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.8.${info.workerIndex}.${Math.floor(Math.random() * 250)}` });
}

async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}

/** /now with the worry typed: the shuffle skipped, one card picked, the answer turned. */
async function drawNow(page: Page, worry: string) {
  await page.getByLabel("고민 한 줄").fill(worry);
  await page.getByRole("button", { name: "바로 펼치기" }).click();
  await expect(tableCards(page)).toHaveCount(78);
  await settleAnimations(page);
  await pickCard(page);
  // The answer (h2) takes focus once turned; the share sheet's own h2 sits in the same region.
  await expect(page.getByRole("region", { name: "지금의 한 장 결과" }).locator("h2[tabindex='-1']")).toBeFocused({ timeout: 10_000 });
}

async function shot(page: Page, name: string, fullPage = false) {
  if (test.info().project.name !== "mobile") return;
  mkdirSync(SHOTS, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

test.beforeEach(async ({ page }) => fakeBrowserClock(page));

test("이어 읽기: /now's card lies first in the three-card draw, the reading starts with it, and its jump row reaches every part", { tag: "@login" }, async ({ page }, info) => {
  test.setTimeout(300_000);
  await ownAddress(page, info);
  // The 맛보기 and 오픈 기념 무료 need a login (owner 2026-11-04, 2026-10-27).
  await loginForOpening(page, info, `carry-${info.project.name}-${Date.now()}`);

  await page.goto("/now");
  await drawNow(page, WORRY);
  const carry = page.getByRole("link", { name: /이 카드로 이어 읽기 · 타로 3장/ });
  await expect(carry).toHaveAttribute("href", "/tarot/new");
  await carry.click();
  await expect(page).toHaveURL(/\/tarot\/new$/, { timeout: NAV });
  const kept = await page.evaluate(() => JSON.parse(sessionStorage.getItem("starlog.tarot-flow") ?? "{}").keep as { cardId: string; orientation: string; worry?: string });
  expect(kept.worry).toBe(WORRY);
  // What the draw sends and deals: the card and its side only (the worry stays in the builder).
  const keep = { cardId: kept.cardId, orientation: kept.orientation };
  expect(keep.cardId).toMatch(/^[a-z]+-\d\d/);

  // The builder says the card goes first; the worry fills 무엇 직접 쓰기 once 누구 is picked.
  const notice = page.getByRole("region", { name: "이어 읽기" });
  await expect(notice).toContainText("아까 뽑은 카드가 첫 자리에 놓여요");
  await expect(notice).toContainText("나머지 두 장만 더 뽑으면 돼요.");
  await page.getByRole("button", { name: "나", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" })).toHaveValue(WORRY);
  await page.getByRole("button", { name: "이번 주" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "builder-kept");
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
  await expect(page.getByRole("region", { name: "이어 읽기" })).toBeVisible();
  await page.getByRole("button", { name: "카드 뽑기" }).click();
  await expect(page).toHaveURL(/\/tarot\/draw$/, { timeout: NAV });

  // The draw: the kept card face up in the first position, two to pick from the other 77; nothing in the address.
  await page.goto("/tarot/draw?instant=1");
  await expect(tableCards(page)).toHaveCount(77);
  await settleAnimations(page);
  await expect(page.locator(`img[src*="/cards/starlog/${keep.cardId}"]`).first()).toBeVisible();
  await expect(page.getByText("마음이 가는 카드를 2장 골라 주세요")).toBeVisible();
  await shot(page, "draw-kept");
  for (let i = 0; i < 2; i++) await pickCard(page);
  const dealt = page.waitForResponse((r) => r.url().endsWith("/api/tarot/draw") && r.request().method() === "POST");
  await page.getByRole("button", { name: "결과 보기" }).click();
  const response = await dealt;
  expect(JSON.parse(response.request().postData() ?? "{}").keep).toEqual(keep);
  const { cards } = (await response.json()) as { cards: Array<{ cardId: string; orientation: string; position: string }> };
  expect(cards).toHaveLength(3);
  expect(cards[0]).toMatchObject(keep);

  // The result's first card is the same card, then the 맛보기 as for any draw.
  await expect(page).toHaveURL(/\/tarot\/result\?instant=1$/, { timeout: NAV });
  const spread = page.getByRole("complementary", { name: "뽑은 카드" });
  // The first position's card (each slot holds its back and its face; the face is the kept card's).
  await expect(spread.locator("li").first().locator(`img[src*="/cards/starlog/${keep.cardId}"]`)).toHaveCount(1);
  await expect(page.getByRole("region", { name: "이어지는 풀이" })).toBeVisible({ timeout: GENERATION });
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  const unlock = openingOn() ? sheet.getByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ }) : sheet.getByRole("button", { name: "운영자로 무료 열기" });
  await unlock.click();

  // The opened reading: its first card is the kept one; 골라 읽기 lists the positions, 앞으로 and 할 일, each reaching its part.
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]{6,32}$/, { timeout: GENERATION });
  await expect(page.getByText("한 줄 결론")).toBeVisible({ timeout: GENERATION });
  const jump = page.getByRole("navigation", { name: "풀이 바로 가기" });
  await expect(jump.getByRole("link")).toHaveText([...cards.map((card) => card.position), "앞으로", "할 일"]);
  await expect(page.locator("#card-1")).toContainText(cards[0]!.position);
  await jump.scrollIntoViewIfNeeded();
  await shot(page, "reading-jump");
  await jump.getByRole("link", { name: "할 일" }).click();
  const target = await page.evaluate(() => document.activeElement?.id ?? "");
  expect(target).toMatch(/^part-\d+$/);
  await expect(page.locator(`#${target}`)).toBeInViewport();
  // The part's heading is not under anything at the top of the screen.
  const top = await page.locator(`#${target}`).evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  await shot(page, "reading-jumped");
  // Keyboard: Enter on a link jumps and moves focus there too.
  await jump.getByRole("link", { name: cards[1]!.position }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#card-2")).toBeFocused();
});

test("별명 이어뽑기: a nicknamed share shows the nickname, 나도 한 장 뽑기 carries it to /now, and 둘의 별명 shows both", async ({ page }, info) => {
  test.setTimeout(240_000);
  await ownAddress(page, info);
  await page.goto("/now");
  await drawNow(page, "오늘 먼저 연락해도 될까?");
  const nickname = (await page.getByRole("region", { name: "타로로 판정" }).locator("[class*=typeName]").textContent()) ?? "";
  expect(nickname.length).toBeGreaterThan(0);
  const path = await makeLink(page, page.getByRole("button", { name: "공유하기" }));

  // The friend opens it: the nickname large, the way to their own draw, nothing typed by the sender.
  const friend = await openShared(page, path, "now-nick-shared");
  const box = friend.getByRole("region", { name: "친구가 받은 별명" });
  await expect(box).toContainText(nickname);
  await expect(box).toContainText("로그인 없이 무료. 친구한테 내 결과가 가지는 않아요.");
  await expect(friend.locator("main")).not.toContainText("오늘 먼저 연락해도 될까?");
  const own = box.getByRole("link", { name: /나도 한 장 뽑기/ });
  const href = (await own.getAttribute("href")) ?? "";
  expect(href).toMatch(/^\/now\?with=now-(fire|water|air|earth)-(go|wait|rethink)$/);
  if (info.project.name === "mobile") {
    mkdirSync(SHOTS, { recursive: true });
    await friend.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await friend.screenshot({ path: `${SHOTS}/shared-now-nick.png` });
    const og = await friend.request.get(new URL(`/api/og/share/${path.slice(3)}`, page.url()).toString(), { timeout: 120_000 });
    expect(og.status()).toBe(200);
    writeFileSync(`${SHOTS}/og-now-nick.png`, await og.body());
  }
  await own.click();
  await expect(friend).toHaveURL(new RegExp(`${href.replace("?", "\\?")}$`), { timeout: NAV });

  // Their own draw: 둘의 별명 with the sender's nickname on the left and theirs on the right, one fixed line, 내 별명 보내기.
  await drawNow(friend, "이번 주말에 고백해도 될까?");
  const pair = friend.getByRole("region", { name: "둘의 별명" });
  await expect(pair).toBeVisible();
  await expect(pair.locator("[class*=pairSide]").first()).toContainText(`친구${nickname}`);
  await expect(pair).toContainText(/원소도 방향도 같네\. 카드끼리 짰어\?|같은 원소인데 화살표가 딴 데 보네\.|다른 원소로 와서 같은 쪽에 섰네\.|원소도 방향도 제각각\. 판 좀 넓힐까\?/);
  await expect(pair.getByRole("button", { name: "내 별명 보내기" })).toBeVisible();
  await pair.scrollIntoViewIfNeeded();
  if (info.project.name === "mobile") {
    await friend.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await friend.screenshot({ path: `${SHOTS}/now-with-pair.png` });
  }
  expect(await friend.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await friend.close();
});
