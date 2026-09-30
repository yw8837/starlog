import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, defineConfig } from "@playwright/test";

const PORT = 3100;

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
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "pnpm dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
