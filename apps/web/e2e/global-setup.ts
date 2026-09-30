import type { FullConfig } from "@playwright/test";

/**
 * `next dev` compiles a route on its first request. On this repo's disk that takes longer than an
 * expect timeout, so a test's first client-side navigation to a route (e.g. result → /login)
 * measured the compiler instead of the app. Request every route once, after Playwright's webServer
 * is up and before any test runs, so navigations in tests hit compiled routes.
 */
const ROUTES = [
  "/",
  "/?visit=first",
  "/tarot/new",
  "/tarot/new/situation",
  "/tarot/draw",
  "/tarot/result",
  "/login",
  "/chapter/sample",
  "/chapter/prologue",
  "/saju/new",
  "/saju/chart",
  "/story",
  "/me",
  "/invite/abc123",
  "/guide",
  "/guide/the-hermit",
  "/guide/five-elements",
  "/dev/characters",
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("global-setup: no baseURL in playwright.config.ts");
  for (const route of ROUTES) {
    const response = await fetch(new URL(route, baseURL));
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`global-setup: ${route} answered ${response.status}`);
  }
}
