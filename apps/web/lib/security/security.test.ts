import { describe, expect, it } from "vitest";
import { DRAW_TOKEN_TTL_MS, dailyCard, issueDraw, openDraw } from "./drawToken";
import {
  hasQuota, isOwner, kstDay, nextKstMidnight, ownerCookie, quotaLimits, rateLimit, readQuota, resetMemoryLimiter, spendQuota,
  LIMITS_PER_MINUTE,
} from "./quota";
import { canonicalJson, safeEqual, sha256, signToken, signingSecret, verifyToken } from "./sign";

const SECRET = "test-secret-0123456789-0123456789-abcdef";
// 2026-09-30 23:59 KST and one minute later (2026-10-01 00:00 KST)
const BEFORE_MIDNIGHT = Date.parse("2026-09-30T14:59:00Z");
const AFTER_MIDNIGHT = Date.parse("2026-09-30T15:00:00Z");

/** Flips one character in the MAC part of a token. */
const tamper = (token: string) => token.slice(0, -2) + (token.at(-2) === "A" ? "B" : "A") + token.at(-1);

describe("signed tokens", () => {
  it("round-trips a payload and rejects tampering, another kind, expiry and garbage", async () => {
    const token = await signToken({ k: "t", exp: 2_000, n: 1 } as never, SECRET);
    expect(await verifyToken(token, "t", SECRET, 1_000)).toMatchObject({ n: 1 });
    expect(await verifyToken(tamper(token), "t", SECRET, 1_000)).toBeNull();
    const [body, mac] = token.split(".");
    const forgedBody = btoa(JSON.stringify({ k: "t", exp: 2_000, n: 99 })).replace(/=+$/, "");
    expect(await verifyToken(`${forgedBody}.${mac}`, "t", SECRET, 1_000)).toBeNull();
    expect(await verifyToken(`${body}.${mac}`, "other", SECRET, 1_000)).toBeNull();
    expect(await verifyToken(token, "t", SECRET, 2_000)).toBeNull();
    expect(await verifyToken(token, "t", "another-secret-0123456789-0123456789", 1_000)).toBeNull();
    for (const junk of [undefined, 42, "", "a.b.c", "!!.??"]) expect(await verifyToken(junk, "t", SECRET, 1_000)).toBeNull();
  });

  it("compares secrets in constant time and hashes canonical JSON independent of key order", async () => {
    expect(await safeEqual("owner-code", "owner-code", SECRET)).toBe(true);
    expect(await safeEqual("owner-code", "owner-codf", SECRET)).toBe(false);
    expect(await safeEqual("short", "a much longer value", SECRET)).toBe(false);
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    expect(await sha256(canonicalJson({ x: 1, y: 2 }))).toBe(await sha256(canonicalJson({ y: 2, x: 1 })));
  });

  it("needs a real secret in production and falls back to a dev secret elsewhere", () => {
    expect(signingSecret({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBeNull();
    expect(signingSecret({ NODE_ENV: "production", STARLOG_SIGNING_SECRET: "too-short" } as NodeJS.ProcessEnv)).toBeNull();
    expect(signingSecret({ NODE_ENV: "production", STARLOG_SIGNING_SECRET: SECRET } as NodeJS.ProcessEnv)).toBe(SECRET);
    expect(signingSecret({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toMatch(/dev-only/);
  });
});

describe("draw tokens", () => {
  it("recomputes the same cards from the token and rejects tampered or expired tokens", async () => {
    const now = BEFORE_MIDNIGHT;
    const { cards, drawToken } = await issueDraw("self-flow", [4, 40, 70], SECRET, now);
    expect(cards.map((c) => c.position)).toEqual(["지금의 나", "필요한 것", "이 시기의 흐름"]);
    expect(await openDraw(drawToken, SECRET, now + 1000)).toEqual({ templateId: "self-flow", cards });
    expect(await openDraw(tamper(drawToken), SECRET, now)).toBeNull();
    expect(await openDraw(drawToken, SECRET, now + DRAW_TOKEN_TTL_MS + 1)).toBeNull();
  });

  it("refuses picks the template cannot take", async () => {
    await expect(issueDraw("self-flow", [1, 1, 2], SECRET, 0)).rejects.toThrow();
    await expect(issueDraw("self-flow", [1, 2], SECRET, 0)).rejects.toThrow();
    await expect(issueDraw("self-flow", [1, 2, 78], SECRET, 0)).rejects.toThrow();
    await expect(issueDraw("self-flow", [1, 2, 3.5], SECRET, 0)).rejects.toThrow();
  });

  it("fixes the daily card per device and day", () => {
    expect(dailyCard("device-a", "2026-09-30")).toEqual(dailyCard("device-a", "2026-09-30"));
    expect(dailyCard("device-a", "2026-09-30")).not.toEqual(dailyCard("device-a", "2026-10-01"));
  });
});

describe("quota", () => {
  it("uses the KST calendar day", () => {
    expect(kstDay(BEFORE_MIDNIGHT)).toBe("2026-09-30");
    expect(kstDay(AFTER_MIDNIGHT)).toBe("2026-10-01");
    expect(nextKstMidnight(BEFORE_MIDNIGHT)).toBe("2026-09-30T15:00:00.000Z");
    expect(nextKstMidnight(AFTER_MIDNIGHT)).toBe("2026-10-01T15:00:00.000Z");
  });

  it("spends within a day and resets across KST midnight", async () => {
    const limits = { ...quotaLimits({} as NodeJS.ProcessEnv), full: 2 };
    let state = await readQuota(undefined, SECRET, BEFORE_MIDNIGHT);
    for (let i = 0; i < 2; i++) {
      expect(hasQuota(state, "full", limits)).toBe(true);
      state = await readQuota(await spendQuota(state, "full", SECRET), SECRET, BEFORE_MIDNIGHT);
    }
    expect(state.full).toBe(2);
    expect(hasQuota(state, "full", limits)).toBe(false);
    const cookie = await spendQuota(state, "teaser", SECRET);
    expect((await readQuota(cookie, SECRET, BEFORE_MIDNIGHT)).teaser).toBe(1);
    const tomorrow = await readQuota(cookie, SECRET, AFTER_MIDNIGHT);
    expect(tomorrow).toEqual({ day: "2026-10-01", full: 0, teaser: 0, followup: 0 });
    expect(hasQuota(tomorrow, "full", limits)).toBe(true);
    expect(await readQuota(tamper(cookie), SECRET, BEFORE_MIDNIGHT)).toMatchObject({ full: 0, teaser: 0 });
  });

  it("reads limits from the environment, ignoring junk", () => {
    expect(quotaLimits({} as NodeJS.ProcessEnv)).toEqual({ full: 3, teaser: 20, followup: 15, daily: 2, followupsPerChapter: 3 });
    expect(quotaLimits({ BETA_FULL_PER_DAY: "5", BETA_TEASER_PER_DAY: "x", BETA_FOLLOWUPS_PER_CHAPTER: "-1" } as unknown as NodeJS.ProcessEnv))
      .toMatchObject({ full: 5, teaser: 20, followupsPerChapter: 3 });
  });

  it("issues an owner pass that expires after a year", async () => {
    const cookie = await ownerCookie(SECRET, BEFORE_MIDNIGHT);
    expect(await isOwner(cookie, SECRET, BEFORE_MIDNIGHT)).toBe(true);
    expect(await isOwner(cookie, SECRET, BEFORE_MIDNIGHT + 366 * 24 * 3600 * 1000)).toBe(false);
    expect(await isOwner(tamper(cookie), SECRET, BEFORE_MIDNIGHT)).toBe(false);
    expect(await isOwner(undefined, SECRET, BEFORE_MIDNIGHT)).toBe(false);
  });
});

describe("rate limiter (in-memory fallback)", () => {
  it("allows the configured requests per minute per key, then recovers", async () => {
    resetMemoryLimiter();
    const limit = LIMITS_PER_MINUTE.GEN_LIMITER;
    for (let i = 0; i < limit; i++) expect(await rateLimit("GEN_LIMITER", "1.2.3.4", 1_000)).toBe(true);
    expect(await rateLimit("GEN_LIMITER", "1.2.3.4", 1_000)).toBe(false);
    expect(await rateLimit("GEN_LIMITER", "5.6.7.8", 1_000)).toBe(true);
    expect(await rateLimit("OWNER_GEN_LIMITER", "1.2.3.4", 1_000)).toBe(true);
    expect(await rateLimit("GEN_LIMITER", "1.2.3.4", 61_001)).toBe(true);
  });
});
