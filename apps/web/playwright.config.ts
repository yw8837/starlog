import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, defineConfig } from "@playwright/test";

const PORT = 3100;
/** Signs draw tokens and cookies on the e2e server (32+ characters; not a production secret). */
const E2E_SIGNING_SECRET = "e2e-only-signing-secret-0123456789abcdef";
/** E2E_BASE_URL runs the suite against an already running build (e.g. the Workers preview on :8787). */
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

function browserCache(): string {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "ms-playwright");
  if (process.platform === "darwin") return join(homedir(), "Library", "Caches", "ms-playwright");
  return join(homedir(), ".cache", "ms-playwright");
}

const CHROME_BINARIES = [
  ["chrome-win64", "chrome.exe"],
  ["chrome-win", "chrome.exe"],
  ["chrome-linux64", "chrome"],
  ["chrome-linux", "chrome"],
  ["chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
  ["chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
  ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
];

/**
 * Chromium to run: PW_CHROMIUM_PATH if set; Playwright's own build when installed
 * (`pnpm --filter @starlog/web exec playwright install chromium`); otherwise the newest
 * chromium-* build already in the Playwright cache, so `pnpm e2e` works without a download.
 */
function chromiumExecutable(): string | undefined {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  if (existsSync(chromium.executablePath())) return undefined;
  const cache = browserCache();
  if (!existsSync(cache)) return undefined;
  const builds = readdirSync(cache)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const build of builds) {
    for (const parts of CHROME_BINARIES) {
      const exe = join(cache, build, ...parts);
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}

const executablePath = chromiumExecutable();

export default defineConfig({
  testDir: "./e2e",
  // Compiles every route once before the tests (see e2e/global-setup.ts).
  globalSetup: "./e2e/global-setup.ts",
  // Playwright empties outputDir on every run; step screenshots live next to it in test-results/tarot-flow.
  outputDir: "./test-results/playwright",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "mobile", testIgnore: /fan-touch/, use: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 } },
    { name: "desktop", testIgnore: /fan-touch/, use: { viewport: { width: 1280, height: 800 } } },
    // Narrow Android width: only the screen sweep (e2e/screens.spec.ts).
    { name: "narrow", testMatch: /screens\.spec/, use: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 } },
    // Real touch input (pointerType "touch") for the card fan.
    { name: "touch", testMatch: /fan-touch/, use: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 180_000,
        // Never the real API: .env.local holds a real key. e2e/global-setup.ts also refuses a
        // reused server that is not in mock mode. Accounts and payments run in owner mode against
        // the local D1 with mock Kakao and mock Toss: only a browser with the owner pass (e2e/pay-flow
        // spec) sees sales, everyone else sees today's site. A reused dev server keeps its old env.
        env: {
          STARLOG_AI: "mock",
          STARLOG_SIGNING_SECRET: E2E_SIGNING_SECRET,
          STARLOG_CF_DEV: "1",
          STARLOG_PAYMENTS: "owner",
          STARLOG_PAY: "mock",
          STARLOG_KAKAO: "mock",
          STARLOG_OWNER_CODE: process.env.E2E_OWNER_CODE ?? "owner-code-for-e2e-0000001",
        },
      },
});
