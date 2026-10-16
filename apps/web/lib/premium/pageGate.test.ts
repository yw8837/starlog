import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { ownerCookie, OWNER_COOKIE } from "@/lib/security/owner";
import { signingSecret } from "@/lib/security/sign";
import { setTestDb } from "@/lib/db";
import { browser, buy, loginAs, useTestDb } from "@/lib/testing/p4";
import { premiumPageOpen, premiumVisibleHere } from "./pageGate";

/** The request's cookies as a server page reads them (next/headers). */
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(request.cookie ? { cookie: request.cookie } : {}) }));

const CODE = "owner-code-for-tests-0001";
const NOW = Date.parse("2026-10-20T03:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  for (const [k, v] of Object.entries({ STARLOG_AI: "mock", STARLOG_PAYMENTS: "on", STARLOG_KAKAO: "mock", STARLOG_PAY: "mock", STARLOG_OWNER_CODE: CODE })) vi.stubEnv(k, v);
  resetMemoryLimiter();
  request.cookie = "";
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("premium screens and entries on the server", () => {
  it("show nowhere while STARLOG_PREMIUM is off (unset), for everyone while it is on, and for the owner pass alone under owner", async () => {
    vi.stubEnv("STARLOG_PREMIUM", "");
    expect(await premiumVisibleHere("tarot-deep")).toBe(false);
    vi.stubEnv("STARLOG_PREMIUM", "on");
    expect(await premiumVisibleHere("tarot-deep")).toBe(true);
    vi.stubEnv("STARLOG_PREMIUM", "owner");
    expect(await premiumVisibleHere("match")).toBe(false);
    request.cookie = `${OWNER_COOKIE}=${await ownerCookie(signingSecret()!, NOW, CODE)}`;
    expect(await premiumVisibleHere("match")).toBe(true);
  });

  it("open a flow page while off only for a logged-in buyer of that very product (a reading already paid for always opens)", async () => {
    useTestDb();
    vi.stubEnv("STARLOG_PREMIUM", "on");
    const b = browser("198.51.100.77");
    await loginAs(b, "buyer");
    await buy(b, "match");
    vi.stubEnv("STARLOG_PREMIUM", "");
    expect(await premiumPageOpen("match")).toBe(false); // no cookies: a visitor
    request.cookie = [...b.jar].map(([name, value]) => `${name}=${value}`).join("; ");
    expect(await premiumPageOpen("match")).toBe(true);
    expect(await premiumPageOpen("tarot-deep")).toBe(false);
    expect(await premiumPageOpen("newyear-2027")).toBe(false);
  });
});
