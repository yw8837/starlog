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
  "/now",
  "/login",
  "/chapter/sample",
  "/chapter/prologue",
  "/saju/new",
  "/saju/chart",
  "/today",
  "/story",
  "/me",
  "/invite/abc123",
  "/guide/tarot",
  "/guide/saju",
  "/guide/the-hermit",
  "/guide/five-elements",
  "/dev/characters",
];

/**
 * The flows open real readings. apps/web/.env.local holds a real API key, so a dev server started
 * without STARLOG_AI=mock (e.g. one reused from another session) would spend money: refuse it.
 * Dev servers send X-Starlog-Dev-Provider (next.config.ts). A production build sends nothing; set
 * E2E_ALLOW_LIVE=1 only for a deliberate run against a deployed preview.
 */
async function assertMockProvider(baseURL: string) {
  if (process.env.E2E_ALLOW_LIVE === "1") return;
  const response = await fetch(new URL("/", baseURL));
  await response.arrayBuffer();
  const provider = response.headers.get("x-starlog-dev-provider");
  if (provider !== "mock") {
    throw new Error(
      `global-setup: the server at ${baseURL} is not in mock mode (X-Starlog-Dev-Provider: ${provider ?? "missing"}). ` +
        "Start it with STARLOG_AI=mock and a 32+ character STARLOG_SIGNING_SECRET, or set E2E_ALLOW_LIVE=1 on purpose.",
    );
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("global-setup: no baseURL in playwright.config.ts");
  await assertMockProvider(baseURL);
  for (const route of ROUTES) {
    const response = await fetch(new URL(route, baseURL));
    await response.arrayBuffer();
    // Warm-up only: a production build answers 404 for dev-only routes (/dev/characters); only a
    // server error means the server is unusable.
    if (response.status >= 500) throw new Error(`global-setup: ${route} answered ${response.status}`);
  }
}
