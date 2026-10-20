import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { ownerCookie, OWNER_COOKIE } from "@/lib/security/owner";
import { signingSecret } from "@/lib/security/sign";
import { setTestDb } from "@/lib/db";
import { browser, buy, loginAs, useTestDb } from "@/lib/testing/p4";
import { premiumPageOpen, premiumStateHere, premiumVisibleHere } from "./pageGate";

/** The request's cookies as a server page reads them (next/headers). */
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(request.cookie ? { cookie: request.cookie } : {}) }));
// Outside a request, the real connection() throws; the gate calls it to keep its pages off the build.
const connection = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection }));

const CODE = "owner-code-for-tests-0001";
const NOW = Date.parse("2026-10-25T03:00:00Z"); // after everything went on sale (owner 2026-10-20)

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
  it("always read the request, even with no signing secret (the build has none): a page that skipped it was prerendered off and stayed a 404 once the switch was on (2026-10-17)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_SIGNING_SECRET", "");
    expect(signingSecret()).toBeNull();
    connection.mockClear();
    await premiumVisibleHere("tarot-deep");
    expect(connection).toHaveBeenCalledTimes(1);
    await premiumStateHere("match");
    expect(connection).toHaveBeenCalledTimes(2);
  });

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
