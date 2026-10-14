import type { Page, TestInfo } from "@playwright/test";

/**
 * 오픈 기념 무료 (a device's first tarot full reading free) ends here: SITE.beta.openingEndsAt, kept equal by
 * lib/testing/clock.test.ts. e2e runs against the server's real clock, so the specs about the event run while it
 * is on and check what replaced it from 11월 1일; specs that only need a reading open it with the owner pass.
 *
 * FAKE_NOW (an ISO time) rehearses another day: the server and the test runner take it from
 * NODE_OPTIONS="--require <scratch>/fake-now.cjs", and `fakeBrowserClock` fixes the page's Date to it.
 */
export const OPENING_ENDS_AT = Date.parse("2026-11-01T00:00:00+09:00");

/** 오픈 기념 무료 is on for this run. */
export const openingOn = (): boolean => Date.now() < OPENING_ENDS_AT;

export const OWNER_CODE = process.env.E2E_OWNER_CODE ?? "owner-code-for-e2e-0000001";

/** The test server's owner pass for this browser context (never a production code). */
export async function ownerPass(page: Page, info: TestInfo): Promise<void> {
  const res = await page.request.post("/api/owner", { data: { code: OWNER_CODE }, headers: { origin: new URL(info.project.use.baseURL!).origin } });
  if (!res.ok()) throw new Error(`owner pass refused: ${res.status()}`);
}

/** With FAKE_NOW, the page's Date is fixed to it (timers still run), so the screens decide as the server does. */
export async function fakeBrowserClock(page: Page): Promise<void> {
  if (process.env.FAKE_NOW) await page.clock.setFixedTime(new Date(process.env.FAKE_NOW));
}
