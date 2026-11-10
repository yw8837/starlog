import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { pickCard, tableCards } from "./cards";
import { mockLogin, ownerPass } from "./opening";

/**
 * What a device keeps of AI readings shows only with a session (owner 2026-11-05: "애초에 로그인한 적이 없는데 계속 보이게
 * 남았다"): hidden, never deleted, whether it never logged in or logged out, and shown again after the login. Each test makes
 * the reading logged in, loses the session, looks, and logs in again. The friend's side is in e2e/bonds.spec.ts.
 * Tagged @login: the Workers preview refuses the mock login.
 */

const NAV = 30_000;
const GENERATION = 120_000;

async function ownAddress(page: Page, info: TestInfo) {
  const ip = `10.45.${info.workerIndex}.${Math.floor(Math.random() * 250)}`;
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": ip, "x-forwarded-for": ip });
}

async function member(page: Page, info: TestInfo, name: string) {
  await ownAddress(page, info);
  await ownerPass(page, info);
  await mockLogin(page, info, name);
}

/** The session gone, all else on this device as it was: the same for a device that never logged in. */
const loseSession = (page: Page) => page.context().clearCookies({ name: /sl_sid/ });

const kept = (page: Page, area: "sessionStorage" | "localStorage", key: string) => page.evaluate(([a, k]) => window[a as "localStorage"].getItem(k!), [area, key]);

/** From the question to the three cards drawn and the 맛보기 written on /tarot/result; returns the part only the 맛보기 shows. */
async function tarotTeaser(page: Page) {
  await page.goto("/tarot/new");
  await page.getByRole("button", { name: "나", exact: true }).click();
  await page.getByRole("button", { name: "재물운" }).click();
  await page.getByRole("button", { name: "이번 주" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
  await page.getByRole("button", { name: "카드 뽑기" }).click();
  await expect(page).toHaveURL(/\/tarot\/draw$/, { timeout: NAV });
  await page.goto("/tarot/draw?instant=1");
  await expect(tableCards(page)).toHaveCount(78);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
  for (let i = 0; i < 3; i++) await pickCard(page);
  await page.getByRole("button", { name: "결과 보기" }).click();
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  await expect(sheet).toBeVisible({ timeout: GENERATION });
  return sheet;
}

test.describe("what a device keeps needs a session", { tag: "@login" }, () => {
  test.beforeEach(() => test.setTimeout(300_000));

  test("/tarot/result: the 맛보기 kept in this tab is hidden and kept without a session, and the same one shows after the login", async ({ page }, info) => {
    const name = `kept-tarot-${info.project.name}-${Date.now()}`;
    await member(page, info, name);
    const sheet = await tarotTeaser(page);
    const stored = await kept(page, "sessionStorage", "starlog.teaser.tarot");
    expect(stored).toBeTruthy();

    await loseSession(page);
    await page.reload();
    const panel = page.getByRole("region", { name: "맛보기 풀이는 로그인하고 볼 수 있어요" });
    await expect(panel).toBeVisible({ timeout: NAV });
    await expect(sheet).toHaveCount(0);
    expect(await kept(page, "sessionStorage", "starlog.teaser.tarot")).toBe(stored);

    await mockLogin(page, info, name);
    let asked = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/tarot/teaser")) asked += 1;
    });
    await page.goto("/tarot/result?instant=1");
    await expect(sheet).toBeVisible({ timeout: NAV });
    expect(asked).toBe(0);
  });

  test("/tarot/result: a logout in another tab, seen on return, hides the 맛보기 just written here; nothing is asked again", async ({ page, context }, info) => {
    await member(page, info, `kept-tab-${info.project.name}-${Date.now()}`);
    const sheet = await tarotTeaser(page);
    let asked = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/tarot/teaser") asked++;
    });
    const other = await context.newPage();
    await other.goto("/me");
    await other.getByRole("button", { name: "로그아웃" }).click();
    await expect(other.getByText(/^로그아웃했어요/)).toBeVisible({ timeout: NAV });
    await other.close();
    await expect(sheet).toBeVisible();
    // Coming back to this tab: the browser restoring the page asks at once (lib/account/client.ts onPageShown).
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect(page.getByRole("region", { name: "맛보기 풀이는 로그인하고 볼 수 있어요" })).toBeVisible({ timeout: NAV });
    await expect(sheet).toHaveCount(0);
    expect(asked).toBe(0);
  });

  test("/saju/chart: the 명식 stays without a session, the 맛보기 kept on this device is hidden and kept, and shows after the login", async ({ page }, info) => {
    const name = `kept-saju-${info.project.name}-${Date.now()}`;
    await member(page, info, name);
    await page.goto("/saju/new");
    await page.getByLabel("태어난 연도").selectOption("1990");
    await page.getByLabel("태어난 월").selectOption("1");
    await page.getByLabel("태어난 일").selectOption("1");
    await page.getByRole("button", { name: "여성", exact: true }).click();
    await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
    await page.getByRole("button", { name: "명식 보기" }).click();
    await expect(page).toHaveURL(/\/saju\/chart/, { timeout: NAV });
    const sheet = page.getByRole("region", { name: /전체 풀이에 담긴 것$/ });
    await expect(sheet).toBeVisible({ timeout: GENERATION });
    const stored = await kept(page, "localStorage", "starlog.teaser.saju.v2");
    expect(stored).toBeTruthy();

    await loseSession(page);
    await page.reload();
    await expect(page.getByRole("region", { name: "맛보기 풀이는 로그인하고 볼 수 있어요" })).toBeVisible({ timeout: NAV });
    await expect(sheet).toHaveCount(0);
    // The 명식 needs no login.
    await expect(page.locator("main")).toContainText("丙");
    expect(await kept(page, "localStorage", "starlog.teaser.saju.v2")).toBe(stored);

    await mockLogin(page, info, name);
    await page.goto("/saju/chart");
    await expect(sheet).toBeVisible({ timeout: NAV });
  });

  test("/story and a saved reading: the login in their place without a session, nothing deleted; the record and the reading after it", async ({ page }, info) => {
    await ownAddress(page, info);
    await ownerPass(page, info);
    const origin = new URL(info.project.use.baseURL!).origin;
    const input = { topicId: "contact", whoId: "us", whenId: "month", question: "이번 달 그 사람에게 먼저 연락해도 될까?", conditions: [], note: "" };
    const draw = await (await page.request.post("/api/tarot/draw", { data: { templateId: "relationship-contact", picks: [2, 9, 15] }, headers: { origin } })).json();
    const res = await (await page.request.post("/api/tarot/reading", { data: { drawToken: draw.drawToken, input, unlock: { method: "owner" } }, headers: { origin } })).json();
    const chapter = { id: "keptlogin01", kind: "tarot", createdAt: Date.now(), chapterToken: res.chapterToken, turns: [], followUpsLeft: 3, question: input.question, conditions: [], note: "", cards: draw.cards, reading: res.reading };
    const record = JSON.stringify({ v: 1, chapters: [chapter] });

    // This device never logged in: it only keeps the reading.
    await page.goto("/story");
    await page.evaluate((value) => window.localStorage.setItem("starlog.chapters", value), record);
    await page.reload();
    await expect(page.getByRole("region", { name: "내 기록은 로그인하고 볼 수 있어요" })).toBeVisible({ timeout: NAV });
    await expect(page.locator("main")).not.toContainText(input.question);
    await page.goto("/chapter/keptlogin01");
    await expect(page.getByRole("region", { name: "이 기록은 로그인하고 볼 수 있어요" })).toBeVisible({ timeout: NAV });
    await expect(page.locator("main")).not.toContainText(input.question);
    await expect(page.locator("main")).not.toContainText(res.reading.verdict);
    await expect(page.getByRole("button", { name: "공유하기" })).toHaveCount(0);
    expect(await kept(page, "localStorage", "starlog.chapters")).toBe(record);

    await mockLogin(page, info, `kept-story-${info.project.name}-${Date.now()}`);
    await page.goto("/story");
    const records = page.getByRole("list", { name: "기록 목록" }).getByRole("listitem");
    await expect(records.first()).toContainText(input.question, { timeout: NAV });
    await page.goto("/chapter/keptlogin01");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(input.question, { timeout: NAV });
    await expect(page.locator("main")).toContainText(res.reading.verdict);
  });
});
