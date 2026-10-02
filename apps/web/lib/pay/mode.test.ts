import { describe, expect, it } from "vitest";
import { loginOpen, openingOffer, payConfigProblems, payProvider, paymentsMode, salesOpen, tossClientKey } from "./mode";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const KEYS = { NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm", TOSS_SECRET_KEY: "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6" };

describe("payment modes", () => {
  it("defaults to off and reads owner, on and paused", () => {
    expect(paymentsMode(env({}))).toBe("off");
    expect(paymentsMode(env({ STARLOG_PAYMENTS: " ON " }))).toBe("on");
    expect(paymentsMode(env({ STARLOG_PAYMENTS: "owner" }))).toBe("owner");
    expect(paymentsMode(env({ STARLOG_PAYMENTS: "paused" }))).toBe("paused");
    expect(paymentsMode(env({ STARLOG_PAYMENTS: "yes" }))).toBe("off");
  });

  it("opens sales for everyone when on, for owner-pass devices when owner, for nobody when off or paused", () => {
    expect([salesOpen("on", false), salesOpen("owner", false), salesOpen("owner", true), salesOpen("off", true), salesOpen("paused", true)]).toEqual([true, false, true, false, false]);
  });

  it("keeps login open for existing accounts while paused, so a rollback never locks buyers out", () => {
    expect([loginOpen("paused", false), loginOpen("on", false), loginOpen("owner", false), loginOpen("owner", true), loginOpen("off", true)]).toEqual([true, true, false, true, false]);
  });

  it("ends the 오픈 기념 free full reading only while sales are on for everyone", () => {
    expect([openingOffer("off"), openingOffer("owner"), openingOffer("on"), openingOffer("paused")]).toEqual([true, true, false, true]);
  });

  it("accepts a matching test or live key pair and reads the client key at run time", () => {
    expect(payConfigProblems(env(KEYS))).toEqual([]);
    expect(payConfigProblems(env({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "live_gck_a", TOSS_SECRET_KEY: "live_gsk_b" }))).toEqual([]);
    expect(tossClientKey(env(KEYS))).toBe(KEYS.NEXT_PUBLIC_TOSS_CLIENT_KEY);
  });

  it("names missing, malformed and mixed keys, never their values", () => {
    expect(payConfigProblems(env({}))).toEqual(["NEXT_PUBLIC_TOSS_CLIENT_KEY", "TOSS_SECRET_KEY"]);
    expect(payConfigProblems(env({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_ck_x", TOSS_SECRET_KEY: "test_sk_y" }))).toEqual(["NEXT_PUBLIC_TOSS_CLIENT_KEY", "TOSS_SECRET_KEY"]);
    const mixed = payConfigProblems(env({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_abc", TOSS_SECRET_KEY: "live_gsk_secretvalue" }));
    expect(mixed).toEqual(["TOSS keys mix test and live"]);
    expect(mixed.join(" ")).not.toContain("secretvalue");
  });

  it("allows the mock Toss outside production only", () => {
    expect(payProvider(env({ STARLOG_PAY: "mock" }))).toBe("mock");
    expect(payConfigProblems(env({ STARLOG_PAY: "mock", NODE_ENV: "development" }))).toEqual([]);
    expect(payConfigProblems(env({ STARLOG_PAY: "mock", NODE_ENV: "production" }))).toEqual(["STARLOG_PAY=mock in production"]);
  });
});
