import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * 별자리 인연 end to end on `next dev` (memory repository): the owner starts and picks 양자리, four
 * friends join, the constellation completes, the 도감 opens the ranking, 공유하기 and 새로 채우기, a mid-way
 * switch; then the friend side (Task 9). Every friend and page uses its own client IP header, so the
 * per-IP join and code limiters (10 a minute) never trip across the suite.
 */

// Long flows (four friends, three widths of screenshots, share images) on a dev server that compiles routes on first use.
test.describe.configure({ timeout: 600_000 });

const SHOTS = "test-results/screens/bonds";
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
    await page.screenshot({ path: `${SHOTS}/${name}-${size.name}.png`, fullPage: true });
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
  await page.getByRole("textbox", { name: "닉네임" }).fill(nickname);
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

/** Waits until every finite CSS animation (the fan's deal-out) has finished. */
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

/** An owner made through the API (its own device and network), optionally with a chosen sign. */
async function apiOwner(baseURL: string, nickname: string, sign: string | null): Promise<{ owner: APIRequestContext; code: string }> {
  const owner = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { "cf-connecting-ip": nextIp() } });
  const res = await owner.post("/api/bonds/owner", { data: { nickname, birth: { calendar: "solar", year: 1990, month: 1, day: 1 } } });
  expect(res.status(), await res.text()).toBe(200);
  const { code } = (await res.json()) as { code: string };
  if (sign) expect((await owner.post("/api/bonds/choose", { data: { sign } })).status()).toBe(200);
  return { owner, code };
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

    // Q-11: the owner on their own link gets the code to send, not the form
    await page.goto(`/b/${code}`, { timeout: 120_000 });
    await expect(page.getByRole("heading", { level: 1, name: "내 초대코드예요" })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("textbox", { name: "닉네임" })).toHaveCount(0);
    await page.goto("/bonds");

    for (const [i, friend] of FRIENDS.entries()) await friendJoin(baseURL!, code, friend, i);
    await page.reload();
    await expect(page.getByText("별자리를 완성했어요")).toBeVisible();
    // the next sign started by itself, so the same link keeps working for friends
    await expect(page.getByRole("heading", { name: /다음은 황소자리예요/ })).toBeVisible();
    expect(await (await page.request.get(`/api/bonds/resolve?code=${code}`)).json()).toMatchObject({ sign: "taurus", filled: 0 });
    await expect(page.getByRole("link", { name: /양자리 완성/ })).toBeVisible();
    await expect(page.locator("section[aria-labelledby='top-title'] li")).toHaveCount(4);
    for (const friend of FRIENDS) await expect(page.getByRole("img", { name: /양자리/ }).first()).toContainText(friend.nickname);
    await shot(page, "complete");

    // Share images: the completed constellation (feed and story) and the invite card are PNGs.
    const me = (await (await page.request.get("/api/bonds/me")).json()) as { completed: { id: string }[] };
    for (const url of [`/api/og/bonds/${me.completed[0]!.id}`, `/api/og/bonds/${me.completed[0]!.id}?size=story`, `/api/og/invite/${code}`]) {
      const image = await page.request.get(url, { timeout: 120_000 });
      expect(image.status(), url).toBe(200);
      expect(image.headers()["content-type"]).toBe("image/png");
      expect((await image.body()).byteLength).toBeGreaterThan(10_000);
    }
    expect((await page.request.get("/api/og/bonds/not-a-real-id")).status()).toBe(404);

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

  test("/ranking is the 별자리 리더보드: twelve signs, each opening its full ranking", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": nextIp() });
    await page.goto("/ranking", { timeout: 120_000 });
    await expect(page.getByRole("heading", { level: 1, name: "별자리 리더보드" })).toBeVisible({ timeout: 120_000 });
    const all = page.getByRole("link", { name: /전체 순위$/ });
    await expect(all).toHaveCount(12);
    await expect(all.first()).toHaveAttribute("href", "/ranking/aries");
    await shot(page, "leaderboard");
  });

  test("a ranking page for someone who has not started offers 이 별자리 채우기", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": nextIp() });
    await page.goto("/ranking/leo", { timeout: 120_000 });
    await expect(page.getByRole("heading", { level: 1, name: /사자자리/ })).toBeVisible();
    const start = page.getByRole("link", { name: "이 별자리 채우기" });
    await expect(start).toHaveAttribute("href", "/bonds?sign=leo", { timeout: 120_000 });
    await shot(page, "ranking-visitor");
  });
});

test.describe("별자리 인연 · friend", () => {
  test("/b with a lower-case code → join → score, reasons, 인연 카드 → 나도 내 별자리 만들기", async ({ page, baseURL }) => {
    const { code } = await apiOwner(baseURL!, "용우", "aries");
    await friendJoin(baseURL!, code, FRIENDS[0]!, 0);

    await page.setExtraHTTPHeaders({ "cf-connecting-ip": nextIp() });
    await page.goto("/b", { timeout: 120_000 });
    await page.getByLabel("초대코드").fill(code.toLowerCase());
    await page.getByRole("button", { name: "참여하기" }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${code}$`), { timeout: 120_000 });
    await expect(page.getByRole("heading", { level: 1, name: "용우님의 양자리에 별이 되어 주세요" })).toBeVisible();
    await expect(page.getByText("1/4", { exact: true })).toBeVisible();
    await expect(page.getByText("용우님이 별자리를 공유하면 이 닉네임이 이미지에 보여요")).toBeVisible();
    await shot(page, "friend-form");

    await page.getByRole("textbox", { name: "닉네임" }).fill("하늘");
    await page.getByLabel("태어난 연도").selectOption("1992");
    await page.getByLabel("태어난 월").selectOption("8");
    await page.getByLabel("태어난 일").selectOption("3");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "카드 고르러 가기" }).click();
    await page.getByRole("button", { name: "바로 펼치기" }).click();
    await expect(page.locator("[data-fan-index]")).toHaveCount(21);
    // The fan sits below the friend's header: once it is dealt, scroll the card into view and find a free spot.
    await settleAnimations(page);
    await page.locator("[data-fan-index]").nth(10).scrollIntoViewIfNeeded();
    await settleAnimations(page);
    await pickFanCard(page, 10);
    await page.getByRole("textbox", { name: "한 줄 남기기 (선택)" }).fill("늘 고마워");
    await page.getByRole("button", { name: "별 되기" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "양자리에 별이 됐어요" })).toBeVisible();
    await expect(page.getByText(/^인연 \d+점$/)).toBeVisible();
    expect(await page.getByRole("list", { name: "점수 근거" }).getByRole("listitem").count()).toBeGreaterThan(0);
    await expect(page.getByText(/요즘 두 사람 사이/)).toBeVisible();
    await expect(page.getByText(/인연 카드 · /)).toBeVisible();
    await expect(page.getByRole("link", { name: "오늘의 한 장 받기" })).toHaveAttribute("href", "/today");
    // the birth date and message are not shown back
    await expect(page.locator("main")).not.toContainText("1992");
    await shot(page, "friend-result");
    // Q-05: a reload shows this device's result again, not the empty form
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "이미 양자리에 별이 되어 있어요" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "닉네임" })).toHaveCount(0);
    await page.getByRole("link", { name: "나도 내 별자리 만들기" }).click();
    await expect(page).toHaveURL(/\/bonds$/, { timeout: 120_000 });
  });

  test("a revoked code and an unknown code get the same answer", async ({ page, baseURL }) => {
    const { owner, code } = await apiOwner(baseURL!, "용우", "aries");
    expect((await owner.post("/api/bonds/invite", { data: {} })).status()).toBe(200);
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": nextIp() });
    await page.goto(`/b/${code}`, { timeout: 120_000 });
    await expect(page.getByRole("heading", { level: 1, name: "코드를 다시 확인해 주세요" })).toBeVisible();
    await page.goto("/b/ZZZZZZ");
    await expect(page.getByRole("heading", { level: 1, name: "코드를 다시 확인해 주세요" })).toBeVisible();
    await shot(page, "friend-bad-code");
  });

  test("an owner choosing the next sign asks the friend to come back", async ({ page, baseURL }) => {
    const { code } = await apiOwner(baseURL!, "용우", null);
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": nextIp() });
    await page.goto(`/b/${code}`, { timeout: 120_000 });
    await expect(page.getByRole("heading", { level: 1, name: "용우님이 다음 별자리를 고르는 중이에요. 조금 뒤에 다시 와 주세요" })).toBeVisible();
  });
});

test.describe("이번 주 행운 번호", () => {
  test("a birth date gives 6 numbers with the notice, and a reload shows the same ones", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": nextIp() });
    await page.goto("/lucky", { timeout: 120_000 });
    await expect(page.getByText("재미로 보는 번호예요. 추첨에서는 모든 번호의 확률이 같아요.")).toBeVisible();
    await page.getByLabel("태어난 연도").selectOption("1993");
    await page.getByLabel("태어난 월").selectOption("7");
    await page.getByLabel("태어난 일").selectOption("14");
    await page.getByRole("button", { name: "이번 주 번호 받기" }).click();
    const balls = page.getByRole("list", { name: "이번 주 행운 번호" }).getByRole("listitem");
    await expect(balls).toHaveCount(6);
    const first = await balls.allTextContents();
    await expect(page.locator("main")).not.toContainText("로또");
    await shot(page, "lucky");
    await page.reload();
    await expect(balls).toHaveCount(6);
    expect(await balls.allTextContents()).toEqual(first);
    const image = await page.request.get(`/api/og/lucky?n=${first.map((n) => n.trim()).join("-")}&w=2026-09-28`, { timeout: 120_000 });
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
  });
});
