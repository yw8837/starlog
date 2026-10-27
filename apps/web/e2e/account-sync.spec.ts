import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { pickCard, tableCards } from "./cards";
import { OPENING_ENDS_AT, ownerPass } from "./opening";

/**
 * Account sync (owner 2026-10-23 "웹이랑 모바일에서 각각 로그인하면 내결과가 공유안됨"): two browser contexts logged in to
 * one mock Kakao account stand for the web and the phone. It starts with the privacy revision of 2026-10-31 00:00 KST
 * (lib/legal.ts SYNC_REVISION_DATE) while 오픈 기념 무료 still runs (until 12/01 00:00 KST), so the specs run from that day
 * while it runs; before it, with FAKE_NOW=2026-10-31T12:00:00+09:00 for the server and the runner (e2e/opening.ts). In owner
 * mode (playwright.config.ts) only an owner-pass browser may log in, so each context takes the pass before its login.
 * 오픈 기념 무료 opens for a logged-in account once (owner 2026-10-27), so a reading a visitor kept on the device is opened
 * with the owner pass (운영자로 무료 열기). Every test logs in (mock Kakao), which the Workers preview refuses: @login, the
 * gate's dev run (scripts/ops/gate3-lite.sh). SHOTS: where the screenshots go.
 */

const SYNC_AT = Date.parse("2026-10-31T00:00:00+09:00");
const NAV = 30_000;
const GENERATION = 120_000;

test.skip(() => Date.now() < SYNC_AT || Date.now() >= OPENING_ENDS_AT, "account sync with 오픈 기념 무료: from 2026-10-31 (KST) until it ends, or FAKE_NOW=2026-10-31T12:00:00+09:00");

/** Today as a record names it ("10월 31일"), in KST. */
const today = () => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(Date.now());

async function shot(page: Page, info: TestInfo, name: string) {
  const dir = process.env.SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${info.project.name}-${name}.png`, fullPage: true });
}

async function ownAddress(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.31.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
}

/** A browser of its own (the web, the phone), with the project's address, size and stored 방문 통계 answer. */
async function newPage(browser: Browser, info: TestInfo): Promise<Page> {
  const { baseURL, viewport, deviceScaleFactor, storageState } = info.project.use;
  const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor, storageState });
  const page = await context.newPage();
  // The day of FAKE_NOW, running on (a fixed clock reads every tap on the draw table as a double tap of the one before).
  if (process.env.FAKE_NOW) await page.clock.install({ time: new Date(process.env.FAKE_NOW) });
  await ownAddress(page);
  return page;
}

/** The mock Kakao account `name` on this browser (the 만 14세 check as /login does it), landing on 내 기록. */
async function loginAs(page: Page, info: TestInfo, name: string) {
  await ownerPass(page, info);
  const origin = new URL(info.project.use.baseURL!).origin;
  const res = await page.request.post("/api/auth/age", { data: { ageConfirmed: true, returnTo: "/story" }, headers: { origin } });
  expect(res.ok()).toBe(true);
  const { url } = (await res.json()) as { url: string };
  await page.goto(`${url}&mockUser=${encodeURIComponent(name)}`);
  await expect(page).toHaveURL(/\/story(\?|$)/, { timeout: NAV });
}

async function settleAnimations(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
}

/** 나 · 재물운 · 이번 주 → one situation chip → three cards → 오픈 기념 무료 (logged in), or `owner`: 운영자로 무료 열기 → the record. */
async function openFree(page: Page, { owner = false } = {}) {
  await page.goto("/tarot/new");
  await page.getByRole("button", { name: "나", exact: true }).click();
  await page.getByRole("button", { name: "재물운" }).click();
  await page.getByRole("button", { name: "이번 주" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
  await page.getByRole("button", { name: "지금은 수입이 없음" }).click();
  await page.getByRole("button", { name: "카드 뽑기" }).click();
  await expect(page).toHaveURL(/\/tarot\/draw$/, { timeout: NAV });
  await page.goto("/tarot/draw?instant=1");
  await expect(tableCards(page)).toHaveCount(78);
  await settleAnimations(page);
  for (let i = 0; i < 3; i++) await pickCard(page);
  await expect(page.getByText("모두 골랐어요")).toBeVisible();
  await page.getByRole("button", { name: "결과 보기" }).click();
  await expect(page).toHaveURL(/\/tarot\/result/, { timeout: NAV });
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  await expect(sheet).toBeVisible({ timeout: GENERATION });
  await sheet.getByRole("button", { name: owner ? "운영자로 무료 열기" : /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]{6,32}$/, { timeout: GENERATION });
  return (await page.getByRole("heading", { level: 1 }).innerText()).trim();
}

const records = (page: Page) => page.getByRole("list", { name: "기록 목록" }).getByRole("link");

test("a 오픈 기념 무료 reading opened logged in on the web shows in 내 기록 on the phone logged in to the same account", { tag: "@login" }, async ({ browser }, info) => {
  test.setTimeout(300_000);
  const name = `sync-a-${info.project.name}-${Date.now()}`;
  const web = await newPage(browser, info);
  await loginAs(web, info, name);
  const title = await openFree(web);
  // Kept in the account: the record opens by its account id.
  const saved = (await (await web.request.get("/api/readings?limit=5")).json()) as { readings: Array<{ id: string }> };
  expect(saved.readings).toHaveLength(1);
  await expect(web).toHaveURL(new RegExp(`/chapter/${saved.readings[0]!.id}$`));
  await shot(web, info, "a1-web-record");

  const phone = await newPage(browser, info);
  await loginAs(phone, info, name);
  await expect(records(phone)).toHaveCount(1, { timeout: NAV });
  await expect(records(phone).first()).toContainText(title);
  await expect(records(phone).first()).not.toContainText("이 기기에만");
  await shot(phone, info, "a2-phone-story");
  await records(phone).first().click();
  await expect(phone).toHaveURL(new RegExp(`/chapter/${saved.readings[0]!.id}$`), { timeout: NAV });
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText(title);
  // 오픈 기념 무료 on the other device too: no follow-up box.
  await expect(phone.getByRole("region", { name: /이어서 물어보기/ })).toHaveCount(0);
  await shot(phone, info, "a3-phone-record");
  await web.context().close();
  await phone.context().close();
});

test("a reading opened before logging in: the login offers to move it, 옮기기 moves it, and the phone sees it", { tag: "@login" }, async ({ browser }, info) => {
  test.setTimeout(300_000);
  const name = `sync-b-${info.project.name}-${Date.now()}`;
  const web = await newPage(browser, info);
  await ownerPass(web, info);
  const title = await openFree(web, { owner: true });
  expect((await web.request.get("/api/readings")).status()).toBe(401);
  await web.goto("/story");
  await expect(records(web).first()).toContainText(title);
  await expect(records(web).first()).not.toContainText("이 기기에만");

  await loginAs(web, info, name);
  const offer = web.getByRole("region", { name: "이 기기에서 본 풀이 1개를 내 계정에 옮길까요?" });
  await expect(offer).toBeVisible({ timeout: NAV });
  await expect(offer).toContainText("옮기면 다른 기기에서도 보여요.");
  await expect(offer).toContainText("암호화");
  // Each record is listed to pick (a shared device's other readings can be taken off), picked at first.
  await expect(offer.getByRole("checkbox", { name: `${today()} · 타로 · ${title}` })).toBeChecked();
  await expect(records(web).first()).toContainText("이 기기에만");
  // Nothing went before the click.
  expect(((await (await web.request.get("/api/readings")).json()) as { readings: unknown[] }).readings).toHaveLength(0);
  await shot(web, info, "b1-web-offer");

  const moved = web.waitForResponse((r) => r.url().endsWith("/api/readings/move"));
  await offer.getByRole("button", { name: "옮기기" }).click();
  expect((await moved).status()).toBe(200);
  await expect(web.getByRole("status").filter({ hasText: "풀이 1개를 내 계정으로 옮겼어요" })).toBeVisible({ timeout: NAV });
  await expect(offer).toHaveCount(0);
  await expect(records(web).first()).not.toContainText("이 기기에만");
  await shot(web, info, "b2-web-moved");

  const phone = await newPage(browser, info);
  await loginAs(phone, info, name);
  await expect(records(phone)).toHaveCount(1, { timeout: NAV });
  await expect(records(phone).first()).toContainText(title);
  await shot(phone, info, "b3-phone-story");
  await web.context().close();
  await phone.context().close();
});

test("나중에 folds the offer into one line in 내 정보, which leads back to it", { tag: "@login" }, async ({ browser }, info) => {
  test.setTimeout(300_000);
  const name = `sync-c-${info.project.name}-${Date.now()}`;
  const web = await newPage(browser, info);
  await ownerPass(web, info);
  await openFree(web, { owner: true });
  await loginAs(web, info, name);
  await web.getByRole("region", { name: /내 계정에 옮길까요/ }).getByRole("button", { name: "나중에" }).click();
  await web.goto("/me");
  await expect(web.getByText("이 기기에만 있는 풀이 1개")).toBeVisible({ timeout: NAV });
  await expect(web.getByRole("region", { name: /내 계정에 옮길까요/ })).toHaveCount(0);
  await shot(web, info, "c1-me-later");
  await web.getByRole("button", { name: "계정으로 옮기기" }).click();
  await expect(web.getByRole("region", { name: "이 기기에서 본 풀이 1개를 내 계정에 옮길까요?" })).toBeVisible();
  await shot(web, info, "c2-me-offer");
  await web.context().close();
});
