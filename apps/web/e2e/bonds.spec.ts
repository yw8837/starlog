import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";
import { openShared } from "./shareShots";

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
/** A friend joining through the API as today's form does (it shows the score notice); `notice: false`, as an earlier form did. */
async function friendJoin(baseURL: string, code: string, friend: (typeof FRIENDS)[number], pick: number, notice = true): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { "cf-connecting-ip": nextIp() } });
  const res = await ctx.post("/api/bonds/join", { data: { code, nickname: friend.nickname, birth: friend.birth, pick, ...(notice ? { scoreNotice: true } : {}) } });
  expect(res.status(), await res.text()).toBe(200);
  return ctx;
}

/** /bonds → nickname 용우, 1990-01-01, consent → start. */
async function startOwner(page: Page, nickname = "용우") {
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": nextIp() });
  await page.goto("/bonds", { timeout: 120_000 });
  // the start screen explains the three steps before it asks for anything
  await expect(page.getByRole("region", { name: "이렇게 해요" }).getByRole("listitem")).toHaveCount(3);
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
  /**
   * owner 2026-10-23 (the 2026-10-02 decision): invites in one go. Made → 카카오톡으로 초대하기 first (the SDK mocked: the
   * feed's 별 되러 가기 opens /b/<code>) → a friend opens that link, joins with no code typed → the star is on the owner's page.
   */
  test("make → 카카오톡으로 초대하기 → a friend joins from the /b link → the owner sees the star", async ({ page, baseURL }, info) => {
    const shots = info.project.name === "mobile";
    await page.addInitScript(() => {
      const sent: unknown[] = [];
      let ready = false;
      Object.assign(window, { __kakao: sent, Kakao: { init: () => void (ready = true), isInitialized: () => ready, Share: { sendDefault: (t: unknown) => void sent.push(t) } } });
    });
    await startOwner(page, "용우");
    await page.getByRole("list", { name: "별자리 고르기" }).getByRole("button", { name: /양자리/ }).click();
    await page.getByRole("button", { name: "양자리로 시작하기" }).click();
    const panel = page.getByRole("region", { name: /양자리/ }).first();
    const kakao = panel.getByRole("button", { name: "카카오톡으로 초대하기" });
    await expect(kakao).toBeVisible();
    // Brought into view right after making it, without scrolling.
    await expect(kakao).toBeInViewport();
    // Just made: the invite is the first button, above the figure; the code waits folded under 초대코드 보기.
    await expect(panel.getByRole("button").first()).toHaveText("카카오톡으로 초대하기");
    await expect(panel.getByText("초대코드 보기")).toBeVisible();
    await expect(panel.locator("p[aria-label^='초대코드']")).toBeHidden();
    if (shots) {
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.screenshot({ path: "test-results/share-shots/bonds-made.png" });
      await page.screenshot({ path: "test-results/share-shots/bonds-kakao-invite.png", clip: { x: 0, y: Math.max(0, ((await kakao.boundingBox())?.y ?? 0) - 120), width: 375, height: 360 } });
    }
    const code = await inviteCode(page);
    await kakao.click();
    const template = (await page.evaluate(() => (window as unknown as { __kakao: unknown[] }).__kakao))[0] as {
      content: { title: string; imageUrl: string; link: { webUrl: string } };
      buttons: Array<{ title: string; link: { webUrl: string } }>;
    };
    // The invite names the site's own address (SITE.url), whatever server this run uses.
    const link = `https://starlog.yeolmaeapps.kr/b/${code}`;
    expect(template.content.title).toBe("용우님의 양자리에 별이 되어 주세요");
    expect(template.content.imageUrl).toBe(`https://starlog.yeolmaeapps.kr/api/og/invite/${code}`);
    expect(template.buttons).toEqual([{ title: "별 되러 가기", link: { mobileWebUrl: link, webUrl: link } }]);

    // The friend taps 별 되러 가기 (the same path on this server) and joins with no code to type.
    const friendContext = await page.context().browser()!.newContext({ viewport: page.viewportSize() ?? undefined });
    const friend = await friendContext.newPage();
    await friend.setExtraHTTPHeaders({ "cf-connecting-ip": nextIp() });
    await friend.goto(new URL(new URL(template.buttons[0]!.link.webUrl).pathname, baseURL).toString(), { timeout: 120_000 });
    await expect(friend.getByRole("heading", { level: 1, name: "용우님의 양자리에 별이 되어 주세요" })).toBeVisible();
    await expect(friend.getByRole("textbox", { name: /초대코드/ })).toHaveCount(0);
    // Spec §9: the link's preview is the invite card ("용우님의 양자리 0/4", lib/og/cardsImage.tsx).
    await expect(friend.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`/api/og/invite/${code}$`));
    if (shots) await friend.screenshot({ path: "test-results/share-shots/bonds-friend-join.png", fullPage: true });
    await friend.getByRole("textbox", { name: "닉네임" }).fill("하늘");
    await friend.getByLabel("태어난 연도").selectOption("1992");
    await friend.getByLabel("태어난 월").selectOption("8");
    await friend.getByLabel("태어난 일").selectOption("3");
    await friend.getByRole("checkbox").check();
    await friend.getByRole("button", { name: "카드 고르러 가기" }).click();
    await friend.getByRole("button", { name: "바로 펼치기" }).click();
    await expect(friend.locator("[data-fan-index]")).toHaveCount(21);
    await settleAnimations(friend);
    await friend.locator("[data-fan-index]").nth(10).scrollIntoViewIfNeeded();
    await settleAnimations(friend);
    await pickFanCard(friend, 10);
    // owner 2026-10-23: said right above the button that joins, so this star's score may show on 용우's share
    const notice = friend.getByText("용우님이 별자리를 공유하면 내 닉네임과 용우님과의 인연 점수가 공유 링크와 이미지에 보여요.").last();
    await expect(notice).toBeVisible();
    if (shots) await friend.screenshot({ path: "test-results/share-shots/bonds-join-notice.png", fullPage: true });
    await friend.getByRole("button", { name: "별 되기" }).click();
    await expect(friend.getByRole("heading", { level: 1, name: "양자리에 별이 됐어요" })).toBeVisible();
    const score = await friend.getByRole("meter", { name: "인연 점수" }).getAttribute("aria-valuenow");
    await expect(friend.getByRole("link", { name: "나도 내 별자리 만들기" })).toHaveAttribute("href", "/bonds");
    await friendContext.close();

    // Spec §3: straight into the next slot, no approval; reopened, the owner's page shows the new star with its sparkle.
    await page.reload();
    await expect(page.getByText("1/4", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("list").filter({ hasText: "하늘" }).first()).toBeVisible();
    await expect(page.getByText("새 별", { exact: true }).first()).toBeVisible();
    // Spec §3 홈 화면 자리: the home badge says `양자리 1/4 · N점` while filling (the owner's own screen).
    await page.goto("/", { timeout: 120_000 });
    await expect(page.getByText(`양자리 1/4 · ${score}점`)).toBeVisible();
  });

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
    await expect(page.getByRole("button", { name: "카카오톡으로 초대하기" })).toBeVisible();
    const code = await inviteCode(page);
    await shot(page, "filling-empty");

    // Q-11, spec §11: the owner on their own link reads that it is their invite link and goes to their constellation
    await page.goto(`/b/${code}`, { timeout: 120_000 });
    await expect(page.getByRole("heading", { level: 1, name: "내 초대 링크예요" })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("textbox", { name: "닉네임" })).toHaveCount(0);
    await page.getByRole("link", { name: "내 별자리로 가기" }).click();
    await expect(page).toHaveURL(/\/bonds$/, { timeout: 120_000 });

    for (const [i, friend] of FRIENDS.entries()) await friendJoin(baseURL!, code, friend, i);
    await page.reload();
    await expect(page.getByText("별자리를 완성했어요")).toBeVisible();
    // 사용법 (an owner's quiet button) opens the same three steps in a dialog
    await page.getByRole("button", { name: "사용법" }).click();
    await expect(page.getByRole("dialog", { name: "이렇게 해요" }).getByRole("listitem")).toHaveCount(3);
    await page.getByRole("dialog", { name: "이렇게 해요" }).getByRole("button", { name: "닫기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // the next sign started by itself, so the same link keeps working for friends
    await expect(page.getByRole("heading", { name: /다음은 황소자리예요/ })).toBeVisible();
    expect(await (await page.request.get(`/api/bonds/resolve?code=${code}`)).json()).toMatchObject({ sign: "taurus", filled: 0 });
    await expect(page.getByRole("link", { name: /양자리 완성/ })).toBeVisible();
    await expect(page.locator("section[aria-labelledby='top-title'] li")).toHaveCount(4);
    for (const friend of FRIENDS) await expect(page.getByRole("img", { name: /양자리/ }).first()).toContainText(friend.nickname);
    await shot(page, "complete");

    // 별자리 공유하기 (owner 2026-10-23): the constellation's own link: the figure with the friends' nicknames, the total and
    // the average, never a friend's own score.
    const ownerShare = page.getByRole("button", { name: "별자리 공유하기" });
    await ownerShare.scrollIntoViewIfNeeded();
    if (test.info().project.name === "mobile") await page.screenshot({ path: "test-results/share-shots/bonds-owner-button.png" });
    await ownerShare.click();
    const ownerSheet = page.getByRole("dialog", { name: "결과 공유하기" });
    await ownerSheet.getByRole("button", { name: "공유 링크 만들기" }).click();
    await expect(ownerSheet).toContainText(/\/s\/[a-z0-9]{12}/, { timeout: 30_000 });
    const ownerPath = (/\/s\/[a-z0-9]{12}/.exec((await ownerSheet.textContent()) ?? "") ?? [""])[0];
    await ownerSheet.getByRole("button", { name: "닫기" }).click();
    const viewer = await page.context().browser()!.newPage({ viewport: page.viewportSize() ?? undefined });
    await viewer.goto(new URL(ownerPath, page.url()).toString(), { timeout: 120_000 });
    await expect(viewer.getByRole("heading", { level: 1 })).toHaveText("용우님의 양자리");
    await expect(viewer.getByRole("meter", { name: "평균 인연 점수" })).toBeVisible();
    for (const friend of FRIENDS) await expect(viewer.locator("main")).toContainText(friend.nickname);
    await viewer.close();
    await (await openShared(page, ownerPath, "bonds-owner-shared")).close();

    // Share images: the completed constellation (feed and story) and the invite card are PNGs.
    const me = (await (await page.request.get("/api/bonds/me")).json()) as { completed: { id: string }[] };
    for (const url of [`/api/og/bonds/${me.completed[0]!.id}`, `/api/og/bonds/${me.completed[0]!.id}?size=story`, `/api/og/invite/${code}`]) {
      const image = await page.request.get(url, { timeout: 120_000 });
      expect(image.status(), url).toBe(200);
      expect(image.headers()["content-type"]).toBe("image/png");
      expect((await image.body()).byteLength).toBeGreaterThan(10_000);
    }
    // the rank on the picture can change: browsers ask again instead of keeping an old one
    expect((await page.request.get(`/api/og/bonds/${me.completed[0]!.id}`)).headers()["cache-control"]).toContain("no-cache");
    expect((await page.request.get("/api/og/bonds/not-a-real-id")).status()).toBe(404);

    await page.getByRole("link", { name: /양자리 완성/ }).click();
    await expect(page).toHaveURL(/\/ranking\/aries$/, { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "내 순위 공유하기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "새로 채우기" })).toBeVisible();
    // Other runs may already rank on this board, so find this owner by 내 순위, then in place (the list shows up to 50위).
    const board = page.getByRole("region", { name: "양자리 순위" });
    const myRank = board.getByRole("region", { name: "내 순위" });
    await expect(myRank).toContainText(/내 순위\d+위/);
    const rank = Number((await myRank.textContent())!.match(/내 순위(\d+)위/)![1]);
    if (rank <= 50) await expect(board.locator("li[data-mine]")).toContainText("용우");
    // one all-time board: no tabs, no weekly wording
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(board).not.toContainText(/이번 주|명예의 전당/);
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

  test("/ranking is the 별자리 인연 랭킹: twelve signs, each opening its full ranking", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": nextIp() });
    await page.goto("/ranking", { timeout: 120_000 });
    await expect(page.getByRole("heading", { level: 1, name: "별자리 인연 랭킹" })).toBeVisible({ timeout: 120_000 });
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
  /**
   * Spec §3 친구: someone with a constellation of their own joins a friend's from the link. The friend's constellation
   * gets the star; their own (stars, progress, invite code) does not change; their 내가 들어간 별자리 lists the friend's.
   */
  test("an owner of their own constellation joins a friend's from the link: the friend's gets the star, theirs stays as it was", async ({ page, baseURL }) => {
    const { owner: minji, code: minjiCode } = await apiOwner(baseURL!, "민지", "aries");
    await startOwner(page, "보라");
    await page.getByRole("list", { name: "별자리 고르기" }).getByRole("button", { name: /사자자리/ }).click();
    await page.getByRole("button", { name: "사자자리로 시작하기" }).click();
    await expect(page.getByText(/^0\/\d+ · 인연 0점$/)).toBeVisible();
    const myCode = await inviteCode(page);
    const myProgress = (await page.getByText(/^0\/\d+ · 인연 0점$/).textContent())?.trim();

    await page.goto(`/b/${minjiCode}`, { timeout: 120_000 });
    await expect(page.getByRole("heading", { level: 1, name: "민지님의 양자리에 별이 되어 주세요" })).toBeVisible();
    // the nickname this device already uses, filled in
    await expect(page.getByRole("textbox", { name: "닉네임" })).toHaveValue("보라");
    await page.getByLabel("태어난 연도").selectOption("1990");
    await page.getByLabel("태어난 월").selectOption("1");
    await page.getByLabel("태어난 일").selectOption("1");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "카드 고르러 가기" }).click();
    await page.getByRole("button", { name: "바로 펼치기" }).click();
    await expect(page.locator("[data-fan-index]")).toHaveCount(21);
    await settleAnimations(page);
    await page.locator("[data-fan-index]").nth(5).scrollIntoViewIfNeeded();
    await settleAnimations(page);
    await pickFanCard(page, 5);
    await page.getByRole("button", { name: "별 되기" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "양자리에 별이 됐어요" })).toBeVisible();

    // 민지's constellation has the star.
    const minjiMe = (await (await minji.get("/api/bonds/me")).json()) as { filling: { stars: Array<{ nickname: string }> } };
    expect(minjiMe.filling.stars.map((s) => s.nickname)).toEqual(["보라"]);
    // 보라's own constellation, progress and code are as they were, and 민지's shows under 내가 들어간 별자리.
    await page.goto("/bonds", { timeout: 120_000 });
    await expect(page.getByRole("heading", { level: 1, name: "보라님의 별자리" })).toBeVisible();
    await expect(page.getByRole("region", { name: /사자자리/ }).first()).toBeVisible();
    await expect(page.getByText(myProgress!, { exact: true })).toBeVisible();
    expect(await inviteCode(page)).toBe(myCode);
    const joined = page.getByRole("region", { name: "내가 들어간 별자리" });
    await expect(joined).toContainText("민지님의 양자리");
    await expect(joined.getByText("나", { exact: true })).toBeVisible();
    await minji.dispose();
  });

  /**
   * owner 2026-10-23: the owner's public link shows each friend's score once that friend saw the notice, filling or not.
   * Review 2026-10-23: once an earlier friend comes in, the constellation shows nicknames only, for good, and the form
   * tells the next friend their score will not show.
   */
  test("the owner's public link, while filling: friends with their scores; after an earlier friend, nicknames only", async ({ page, baseURL }, info) => {
    const shots = info.project.name === "mobile";
    await startOwner(page, "용우");
    await page.getByRole("list", { name: "별자리 고르기" }).getByRole("button", { name: /사자자리/ }).click();
    await page.getByRole("button", { name: "사자자리로 시작하기" }).click();
    const code = await inviteCode(page);
    const a = await friendJoin(baseURL!, code, FRIENDS[0]!, 0, true);
    const b = await friendJoin(baseURL!, code, FRIENDS[1]!, 1, true);
    await page.reload();
    const share = async () => {
      await page.getByRole("button", { name: "별자리 공유하기" }).click();
      const sheet = page.getByRole("dialog", { name: "결과 공유하기" });
      await sheet.getByRole("button", { name: "공유 링크 만들기" }).click();
      await expect(sheet).toContainText(/\/s\/[a-z0-9]{12}/, { timeout: 30_000 });
      const path = (/\/s\/[a-z0-9]{12}/.exec((await sheet.textContent()) ?? "") ?? [""])[0];
      await sheet.getByRole("button", { name: "닫기" }).click();
      return path;
    };
    const path = await share();
    const viewer = await page.context().browser()!.newPage({ viewport: page.viewportSize() ?? undefined });
    await viewer.goto(new URL(path, page.url()).toString(), { timeout: 120_000 });
    const list = viewer.getByRole("list", { name: "별이 된 친구" }).getByRole("listitem");
    await expect(list).toHaveText([new RegExp(`^${FRIENDS[0]!.nickname} · 인연 \\d+점$`), new RegExp(`^${FRIENDS[1]!.nickname} · 인연 \\d+점$`)]);
    await expect(viewer.getByRole("meter", { name: "평균 인연 점수" })).toBeVisible();
    if (shots) await viewer.screenshot({ path: "test-results/share-shots/bonds-shared-filling-scores.png", fullPage: true });

    // An earlier friend joins (an earlier form, no notice): the same live link shows every friend by nickname only.
    const c = await friendJoin(baseURL!, code, FRIENDS[2]!, 2, false);
    await viewer.reload();
    await expect(list).toHaveText([FRIENDS[0]!.nickname, FRIENDS[1]!.nickname, FRIENDS[2]!.nickname]);
    await expect(viewer.getByRole("meter")).toHaveCount(0);
    await expect(viewer.locator("main")).toContainText("이 별자리는 친구마다의 점수를 공유하지 않아요.");
    await expect(viewer.locator("main")).not.toContainText(/합계|\d+점/);
    if (shots) await viewer.screenshot({ path: "test-results/share-shots/bonds-shared-filling-mixed.png", fullPage: true });
    // the next friend's form says so, and the checkbox agrees only to the nickname showing
    await viewer.context().clearCookies();
    await viewer.goto(new URL(`/b/${code}`, page.url()).toString(), { timeout: 120_000 });
    await expect(viewer.getByText("용우님이 별자리를 공유하면 내 닉네임이 공유 링크와 이미지에 보여요. 인연 점수는 보이지 않아요.").first()).toBeVisible();
    await expect(viewer.getByRole("checkbox")).toHaveAccessibleName(/공유하면 닉네임이 보이는 데 동의해요/);
    if (shots) await viewer.screenshot({ path: "test-results/share-shots/bonds-join-private.png", fullPage: true });
    await viewer.close();
    for (const ctx of [a, b, c]) await ctx.dispose();
  });

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
    await expect(page.getByText("용우님이 별자리를 공유하면 내 닉네임과 용우님과의 인연 점수가 공유 링크와 이미지에 보여요.").first()).toBeVisible();
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
    // 인연 점수 한눈에 (owner 2026-10-23): the number on its 55–99 gauge and the table of what made it.
    const meter = page.getByRole("meter", { name: "인연 점수" });
    await expect(meter).toBeVisible();
    const score = Number(await meter.getAttribute("aria-valuenow"));
    expect(score).toBeGreaterThanOrEqual(55);
    await expect(page.getByRole("table", { name: "점수를 만든 항목" }).getByRole("row")).toHaveCount(7);
    await expect(page.getByText(/요즘 두 사람 사이/)).toBeVisible();
    await expect(page.getByText(/인연 카드 · /)).toBeVisible();
    await expect(page.getByRole("link", { name: "오늘의 한 장 받기" })).toHaveAttribute("href", "/today");
    // the birth date and message are not shown back
    await expect(page.locator("main")).not.toContainText("1992");
    await shot(page, "friend-result");
    // 내 인연 공유하기 (owner 2026-10-23): the friend's own result, whose link opens it, never the home.
    if (test.info().project.name === "mobile") await page.screenshot({ path: "test-results/share-shots/bond-friend-button.png", fullPage: true });
    await page.getByRole("button", { name: "내 인연 공유하기" }).click();
    const sheet = page.getByRole("dialog", { name: "결과 공유하기" });
    await sheet.getByRole("button", { name: "공유 링크 만들기" }).click();
    await expect(sheet).toContainText(/\/s\/[a-z0-9]{12}/, { timeout: 30_000 });
    const sharePath = (/\/s\/[a-z0-9]{12}/.exec((await sheet.textContent()) ?? "") ?? [""])[0];
    await sheet.getByRole("button", { name: "닫기" }).click();
    const visitor = await page.context().browser()!.newPage({ viewport: page.viewportSize() ?? undefined });
    await visitor.goto(new URL(sharePath, page.url()).toString(), { timeout: 120_000 });
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("하늘님과 용우님의 인연");
    await expect(visitor.getByRole("meter", { name: "인연 점수" })).toHaveAttribute("aria-valuenow", String(score));
    await expect(visitor.locator("main")).not.toContainText("늘 고마워");
    await expect(visitor.locator("main")).not.toContainText("1992");
    await visitor.close();
    await (await openShared(page, sharePath, "bond-friend-shared")).close();
    // Q-05: a reload shows this device's result again, not the empty form
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "이미 양자리에 별이 되어 있어요" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "닉네임" })).toHaveCount(0);
    await page.getByRole("link", { name: "나도 내 별자리 만들기" }).click();
    await expect(page).toHaveURL(/\/bonds$/, { timeout: 120_000 });
    // 내가 들어간 별자리 (owner 2026-10-14): the joined constellation with 나 among its members
    const joined = page.getByRole("region", { name: "내가 들어간 별자리" });
    await expect(joined).toContainText("용우님의 양자리");
    await expect(joined).toContainText(" · 나");
    await expect(joined).not.toContainText("늘 고마워");
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
