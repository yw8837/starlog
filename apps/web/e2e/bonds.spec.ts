import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * 별자리 인연 end to end on `next dev` (memory repository): the owner starts and picks 양자리, four
 * friends join, the constellation completes, the 도감 opens the ranking, 공유하기 and 새로 채우기, a mid-way
 * switch; then the friend side (Task 9). Every friend and page uses its own client IP header, so the
 * per-IP join and code limiters (10 a minute) never trip across the suite.
 */

const SHOTS = "test-results/screens";
const SIZES = [
  { name: "375", width: 375, height: 812 },
  { name: "360", width: 360, height: 780 },
  { name: "1280", width: 1280, height: 800 },
];
const FRIENDS = [
  { nickname: "민지", birth: { calendar: "solar", year: 1991, month: 5, day: 12 } },
  { nickname: "하늘", birth: { calendar: "solar", year: 1992, month: 8, day: 3 } },
  { nickname: "도윤", birth: { calendar: "solar", year: 1988, month: 11, day: 20 } },
  { nickname: "서아", birth: { calendar: "solar", year: 1995, month: 2, day: 28 } },
];
let ipSeq = 1;
const nextIp = () => `10.77.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

async function shot(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.screenshot({ path: `${SHOTS}/bonds-${name}-${size.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 812 });
}

/** A friend on their own device (fresh cookies) and network. */
async function friendJoin(baseURL: string, code: string, friend: (typeof FRIENDS)[number], pick: number): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { "cf-connecting-ip": nextIp() } });
  const res = await ctx.post("/api/bonds/join", { data: { code, nickname: friend.nickname, birth: friend.birth, pick } });
  expect(res.status(), await res.text()).toBe(200);
  return ctx;
}

/** /bonds → nickname 용우, 1990-01-01, consent → start. */
async function startOwner(page: Page, nickname = "용우") {
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": nextIp() });
  await page.goto("/bonds", { timeout: 120_000 });
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByLabel("태어난 연도").selectOption("1990");
  await page.getByLabel("태어난 월").selectOption("1");
  await page.getByLabel("태어난 일").selectOption("1");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "별자리 인연 시작하기" }).click();
  await expect(page.getByRole("heading", { name: "채울 별자리를 골라요" })).toBeVisible();
}

async function inviteCode(page: Page): Promise<string> {
  const code = (await page.locator("p[aria-label^='초대코드']").first().textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  return code;
}

test.describe("별자리 인연 · owner", () => {
  test("start → 양자리 → 4 friends → complete → 도감 → ranking → 새로 채우기 → home badge", async ({ page, baseURL }) => {
    await startOwner(page);
    const picker = page.getByRole("list", { name: "별자리 고르기" });
    await expect(picker.getByRole("button")).toHaveCount(12);
    await expect(picker.getByRole("button", { name: /염소자리/ })).toContainText("내 별자리");
    await shot(page, "picker");
    await picker.getByRole("button", { name: /양자리/ }).click();
    await page.getByRole("button", { name: "양자리로 시작하기" }).click();

    await expect(page.getByRole("heading", { name: /양자리/ }).first()).toBeVisible();
    await expect(page.getByText("0/4 · 인연 0점")).toBeVisible();
    await expect(page.getByRole("button", { name: "초대하기" })).toBeVisible();
    const code = await inviteCode(page);
    await shot(page, "filling-empty");

    for (const [i, friend] of FRIENDS.entries()) await friendJoin(baseURL!, code, friend, i);
    await page.reload();
    await expect(page.getByText("별자리를 완성했어요")).toBeVisible();
    await expect(page.getByRole("link", { name: /양자리 완성/ })).toBeVisible();
    await expect(page.locator("section[aria-labelledby='top-title'] li")).toHaveCount(4);
    for (const friend of FRIENDS) await expect(page.getByRole("img", { name: /양자리/ }).first()).toContainText(friend.nickname);
    await shot(page, "complete");

    await page.getByRole("link", { name: /양자리 완성/ }).click();
    await expect(page).toHaveURL(/\/ranking\/aries$/, { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "공유하기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "새로 채우기" })).toBeVisible();
    await expect(page.getByRole("region", { name: "이번 주 랭킹" }).getByRole("listitem").first()).toContainText("용우");
    await shot(page, "ranking-mine");

    await page.getByRole("button", { name: "새로 채우기" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("처음부터");
    await dialog.getByRole("button", { name: "처음부터 다시 채우기" }).click();
    await expect(page).toHaveURL(/\/bonds$/, { timeout: 60_000 });
    await expect(page.getByText("0/4 · 인연 0점")).toBeVisible();

    await page.goto("/", { timeout: 120_000 });
    await expect(page.getByText("양자리 0/4 · 0점")).toBeVisible();
    await shot(page, "home-row");
  });

  test("별자리 바꾸기 mid-way clears the stars after a confirm", async ({ page, baseURL }) => {
    await startOwner(page, "별지기");
    const picker = page.getByRole("list", { name: "별자리 고르기" });
    await picker.getByRole("button", { name: /사자자리/ }).click();
    await page.getByRole("button", { name: "사자자리로 시작하기" }).click();
    const code = await inviteCode(page);
    await friendJoin(baseURL!, code, FRIENDS[0]!, 3);
    await page.reload();
    await expect(page.getByText(/^1\/6 · 인연 \d+점$/)).toBeVisible();

    await page.getByRole("button", { name: "별자리 바꾸기" }).click();
    await page.getByRole("list", { name: "별자리 고르기" }).getByRole("button", { name: /물고기자리/ }).click();
    await page.getByRole("button", { name: "물고기자리로 바꾸기" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("별 1개");
    await dialog.getByRole("button", { name: "바꾸고 처음부터 채우기" }).click();
    await expect(page.getByText("0/7 · 인연 0점")).toBeVisible();
    await expect(page.getByRole("heading", { name: /물고기자리/ }).first()).toBeVisible();
  });

  test("a ranking page for someone who has not started offers 이 별자리 채우기", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": nextIp() });
    await page.goto("/ranking/leo", { timeout: 120_000 });
    await expect(page.getByRole("heading", { level: 1, name: /사자자리/ })).toBeVisible();
    const start = page.getByRole("link", { name: "이 별자리 채우기" });
    await expect(start).toHaveAttribute("href", "/bonds?sign=leo");
    await shot(page, "ranking-visitor");
  });
});
