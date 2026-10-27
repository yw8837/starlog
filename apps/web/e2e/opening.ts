import type { Page, TestInfo } from "@playwright/test";

/**
 * 오픈 기념 무료 (one tarot full reading free per logged-in account and per device, owner 2026-10-27) ends here:
 * SITE.beta.openingEndsAt, kept equal by lib/testing/clock.test.ts. e2e runs against the server's real clock, so the specs
 * about the event run while it is on and check what replaced it from 12월 1일; specs that only need a reading open it with
 * the owner pass (운영자로 무료 열기).
 *
 * FAKE_NOW (an ISO time) rehearses another day: the server and the test runner take it from
 * NODE_OPTIONS="--require <scratch>/fake-now.cjs", and `fakeBrowserClock` fixes the page's Date to it.
 */
export const OPENING_ENDS_AT = Date.parse("2026-12-01T00:00:00+09:00");

/** 오픈 기념 무료 is on for this run. */
export const openingOn = (): boolean => Date.now() < OPENING_ENDS_AT;

export const OWNER_CODE = process.env.E2E_OWNER_CODE ?? "owner-code-for-e2e-0000001";

/** The test server's owner pass for this browser context (never a production code). */
export async function ownerPass(page: Page, info: TestInfo): Promise<void> {
  const post = () => page.request.post("/api/owner", { data: { code: OWNER_CODE }, headers: { origin: new URL(info.project.use.baseURL!).origin } });
  let res = await post();
  // OWNER_LOGIN_LIMITER lets five owner logins a minute through: a run with more owner tests than that met a 429 and
  // failed now and then (@screens story-records, premium.spec). Wait the minute out once, then try again.
  if (res.status() === 429) {
    info.setTimeout(info.timeout + 75_000);
    await page.waitForTimeout(61_000);
    res = await post();
  }
  if (!res.ok()) throw new Error(`owner pass refused: ${res.status()}`);
}

/**
 * 오픈 기념 무료 opens for a logged-in account only, once per account (owner 2026-10-27). In owner mode (playwright.config.ts)
 * only an owner-pass browser may log in, so this takes the pass, then logs this browser in to the mock Kakao account `name`
 * (the 만 14세 check as /login does it), landing on 내 기록. The pass skips the device's count, never the account's: give
 * each test an account of its own.
 */
export async function loginForOpening(page: Page, info: TestInfo, name: string): Promise<void> {
  await ownerPass(page, info);
  const res = await page.request.post("/api/auth/age", { data: { ageConfirmed: true, returnTo: "/story" }, headers: { origin: new URL(info.project.use.baseURL!).origin } });
  if (!res.ok()) throw new Error(`age check refused: ${res.status()}`);
  const { url } = (await res.json()) as { url: string };
  await page.goto(`${url}&mockUser=${encodeURIComponent(name)}`);
  await page.waitForURL(/\/story(\?|$)/, { timeout: 30_000 });
}

/** With FAKE_NOW, the page's Date is fixed to it (timers still run), so the screens decide as the server does. */
export async function fakeBrowserClock(page: Page): Promise<void> {
  if (process.env.FAKE_NOW) await page.clock.setFixedTime(new Date(process.env.FAKE_NOW));
}
