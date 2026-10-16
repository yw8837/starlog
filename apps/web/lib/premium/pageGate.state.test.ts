import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ownerCookie, OWNER_COOKIE } from "@/lib/security/owner";
import { signingSecret } from "@/lib/security/sign";
import { premiumStateHere } from "./pageGate";

const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(request.cookie ? { cookie: request.cookie } : {}) }));
// Outside a request, the real connection() throws; the gate calls it to keep its pages off the build.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));

const CODE = "owner-code-for-tests-0001";
const OCT = Date.parse("2026-10-25T03:00:00Z"); // after 10/24 (켈틱·궁합 on sale), before 11/15

beforeEach(() => {
  for (const [k, v] of Object.entries({ STARLOG_PAYMENTS: "on", STARLOG_PAY: "mock", STARLOG_OWNER_CODE: CODE })) vi.stubEnv(k, v);
  request.cookie = "";
});
afterEach(() => vi.unstubAllEnvs());

describe("a product page's state on the server (stage 3)", () => {
  it("is hidden and closed while STARLOG_PREMIUM is off, even for the owner pass", async () => {
    vi.stubEnv("STARLOG_PREMIUM", "");
    request.cookie = `${OWNER_COOKIE}=${await ownerCookie(signingSecret()!, OCT, CODE)}`;
    expect(await premiumStateHere("match", OCT)).toEqual({ visible: false, open: false });
  });

  it("shows 2027 신년운세 before its window without starting it; the owner pass may start it for QA", async () => {
    vi.stubEnv("STARLOG_PREMIUM", "on");
    expect(await premiumStateHere("newyear-2027", OCT)).toEqual({ visible: true, open: false });
    expect(await premiumStateHere("match", OCT)).toEqual({ visible: true, open: true });
    request.cookie = `${OWNER_COOKIE}=${await ownerCookie(signingSecret()!, OCT, CODE)}`;
    expect(await premiumStateHere("newyear-2027", OCT)).toEqual({ visible: true, open: true });
  });
});
