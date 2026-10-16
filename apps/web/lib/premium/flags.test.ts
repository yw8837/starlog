import { describe, expect, it } from "vitest";
import { premiumMode, premiumOpen, premiumVisible } from "./flags";

const env = (vars: Record<string, string>) => ({ NODE_ENV: "test", ...vars }) as unknown as NodeJS.ProcessEnv;
const OCT = Date.parse("2026-10-20T12:00:00+09:00");
const DEC = Date.parse("2026-12-01T12:00:00+09:00");

describe("premium sales flag", () => {
  it("defaults to off", () => {
    expect(premiumMode(env({}))).toBe("off");
    expect(premiumMode(env({ STARLOG_PREMIUM: " On " }))).toBe("on");
    expect(premiumMode(env({ STARLOG_PREMIUM: "yes" }))).toBe("off");
  });

  it("opens for everyone only when premium and payments are both on", () => {
    expect(premiumOpen("match", false, OCT, env({ STARLOG_PREMIUM: "on", STARLOG_PAYMENTS: "on" }))).toBe(true);
    expect(premiumOpen("match", false, OCT, env({ STARLOG_PREMIUM: "on", STARLOG_PAYMENTS: "owner" }))).toBe(false);
    expect(premiumOpen("match", false, OCT, env({ STARLOG_PREMIUM: "owner", STARLOG_PAYMENTS: "on" }))).toBe(false);
    expect(premiumOpen("match", false, OCT, env({ STARLOG_PREMIUM: "off", STARLOG_PAYMENTS: "on" }))).toBe(false);
  });

  it("keeps 2027 신년운세 closed before its window for everyone but the owner", () => {
    const on = env({ STARLOG_PREMIUM: "on", STARLOG_PAYMENTS: "on" });
    expect(premiumOpen("newyear-2027", false, OCT, on)).toBe(false);
    expect(premiumOpen("newyear-2027", false, DEC, on)).toBe(true);
    expect(premiumOpen("newyear-2027", true, OCT, env({ STARLOG_PREMIUM: "owner" }))).toBe(true);
  });

  it("never opens anything for the owner while the flag is off", () => {
    expect(premiumOpen("tarot-deep", true, OCT, env({ STARLOG_PAYMENTS: "on" }))).toBe(false);
  });

  it("keeps a production deploy on test keys closed to everyone but the owner", () => {
    const testKeys = { NODE_ENV: "production", STARLOG_PREMIUM: "on", STARLOG_PAYMENTS: "on", TOSS_SECRET_KEY: "test_gsk_x" };
    expect(premiumOpen("match", false, OCT, env(testKeys))).toBe(false);
    expect(premiumOpen("match", false, OCT, env({ ...testKeys, TOSS_SECRET_KEY: "live_gsk_x" }))).toBe(true);
  });

  it("shows premium screens and entries only while the flag is on (to the owner's devices while it is owner)", () => {
    // off (production today): nothing new is visible to anyone, the owner included
    expect(premiumVisible("tarot-deep", false, env({ STARLOG_PAYMENTS: "on" }))).toBe(false);
    expect(premiumVisible("tarot-deep", true, env({ STARLOG_PAYMENTS: "on" }))).toBe(false);
    expect(premiumVisible("match", false, env({ STARLOG_PREMIUM: "owner" }))).toBe(false);
    expect(premiumVisible("match", true, env({ STARLOG_PREMIUM: "owner" }))).toBe(true);
    // on: visible before its window too (the opening date is shown), and without payments (the button says so)
    expect(premiumVisible("newyear-2027", false, env({ STARLOG_PREMIUM: "on", STARLOG_PAYMENTS: "on" }))).toBe(true);
    expect(premiumVisible("match", false, env({ STARLOG_PREMIUM: "on" }))).toBe(true);
  });
});
