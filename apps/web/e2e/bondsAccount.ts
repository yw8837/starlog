import { execSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";
import { OWNER_CODE } from "./opening";

/**
 * 별자리 인연 owners belong to accounts (owner 2026-10-27): helpers that log a browser or a request context into a mock
 * Kakao account, and that plant an owner made on a device before accounts (an sl_uid cookie, no account).
 */

/** Signs the e2e server's cookies (playwright.config.ts E2E_SIGNING_SECRET). */
const SIGNING_SECRET = process.env.E2E_SIGNING_SECRET ?? "e2e-only-signing-secret-0123456789abcdef";

let seq = Math.floor(Math.random() * 200);
/** An address of its own: the owner pass (5 a minute) and the login count per address. */
export const ownIp = () => `10.88.${seq++ % 250}.${Math.floor(Math.random() * 250) + 1}`;

/** A mock Kakao account name nobody else in the run uses. */
export const newUser = () => `bonds-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;

/**
 * Logs this browser into the mock Kakao account `user` as /login does (the owner pass first: e2e runs payments in owner
 * mode, where only owner-pass devices log in), landing on `returnTo`.
 */
export async function logInPage(page: Page, user: string, returnTo = "/bonds"): Promise<void> {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await page.context().setExtraHTTPHeaders({ "cf-connecting-ip": ownIp() });
  expect((await page.request.post("/api/owner", { data: { code: OWNER_CODE }, headers: { origin } })).ok()).toBe(true);
  const res = await page.request.post("/api/auth/age", { data: { ageConfirmed: true, returnTo }, headers: { origin } });
  expect(res.ok(), await res.text()).toBe(true);
  const { url } = (await res.json()) as { url: string };
  await page.goto(`${url}&mockUser=${encodeURIComponent(user)}`, { timeout: 120_000 });
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace(/[/?]/g, "\\$&")}([?#].*)?$`), { timeout: 120_000 });
}

/** A request context of its own address, logged into the mock Kakao account `user`. */
export async function logInRequest(baseURL: string, user: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { "cf-connecting-ip": ownIp() } });
  const origin = new URL(baseURL).origin;
  expect((await ctx.post("/api/owner", { data: { code: OWNER_CODE }, headers: { origin } })).ok()).toBe(true);
  const res = await ctx.post("/api/auth/age", { data: { ageConfirmed: true, returnTo: "/bonds" }, headers: { origin } });
  expect(res.ok(), await res.text()).toBe(true);
  const { url } = (await res.json()) as { url: string };
  expect((await ctx.get(`${url}&mockUser=${encodeURIComponent(user)}`)).ok()).toBe(true);
  return ctx;
}

/** Another browser (the phone next to the web), with the project's address, size and stored 방문 통계 answer. */
export async function otherBrowser(page: Page): Promise<Page> {
  const { baseURL, viewport, deviceScaleFactor, storageState } = test.info().project.use;
  const context = await page.context().browser()!.newContext({ baseURL, viewport, deviceScaleFactor, storageState });
  return context.newPage();
}

/** The sl_uid cookie value naming `id` this device's owner, signed as lib/security/sign.ts signs it. */
export function deviceOwnerCookie(id: string): string {
  const body = Buffer.from(JSON.stringify({ k: "uid", id })).toString("base64url");
  return `${body}.${createHmac("sha256", SIGNING_SECRET).update(body).digest("base64url")}`;
}

/**
 * An owner made on a device before accounts, `sign` being filled, in the local D1 the e2e server reads (wrangler, as
 * `pnpm e2e` migrates it); its sl_uid goes on the browser that "made" it. Returns the owner id.
 */
export function seedDeviceOwner(nickname: string, sign: string): string {
  const id = randomBytes(16).toString("base64url");
  const now = Date.now();
  const basis = JSON.stringify({ dayStem: "丙", yearBranch: "巳", dayBranch: "寅", elements: { 목: 1, 화: 3, 토: 1, 금: 0, 수: 1 }, uncertain: false });
  const dir = mkdtempSync(join(tmpdir(), "bonds-seed-"));
  const file = join(dir, "seed.sql");
  writeFileSync(
    file,
    `INSERT INTO owners (id, nickname, ranking_public, basis_json, created_at) VALUES ('${id}', '${nickname}', 1, '${basis}', ${now});
INSERT INTO constellations (id, owner_id, sign, status, total, started_at) VALUES ('${id}-c', '${id}', '${sign}', 'filling', 0, ${now});
`,
    "utf8",
  );
  try {
    execSync(`npx wrangler d1 execute starlog --local --file "${file}"`, { cwd: process.cwd(), stdio: "pipe" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return id;
}
