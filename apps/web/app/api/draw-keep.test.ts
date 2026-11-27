import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { setTestDb } from "@/lib/db";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { openerCookies, useTestDb } from "@/lib/testing/p4";
import { POST as draw } from "./tarot/draw/route";
import { POST as reading } from "./tarot/reading/route";
import { POST as teaser } from "./tarot/teaser/route";

/**
 * 이어 읽기 through the routes (spec 2026-11-26 beyond trend §3, §7): /api/tarot/draw takes an optional `keep`, and what it
 * deals opens the teaser and the reading as any draw (everything after the draw unchanged). app/api/routes.test.ts and
 * app/api/premium-draw.test.ts keep the draws without it.
 */

type Handler = (request: Request) => Promise<Response>;

/** A logged-in device (오픈 기념 무료 opens once per account), as app/api/routes.test.ts's member(). */
async function member(ip = "203.0.113.70") {
  const jar = new Map<string, string>(await openerCookies());
  const call = async (handler: Handler, body: unknown) => {
    const response = await handler(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": ip, origin: "http://localhost", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
        body: JSON.stringify(body),
      }),
    );
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair!.indexOf("=");
      jar.set(pair!.slice(0, index), pair!.slice(index + 1));
    }
    return { status: response.status, data: (await response.json()) as Record<string, any> };
  };
  return { call };
}

const KEEP = { cardId: "major-17-star", orientation: "reversed" };
const MONEY_INPUT = {
  topicId: "money", whoId: "me", whenId: "week",
  question: "이번 주, 나의 재물 흐름은 어떨까",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-09-30T03:00:00Z"));
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  useTestDb();
  resetMemoryLimiter();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/api/tarot/draw with keep", () => {
  it("lays the kept card first, deals two more, and the teaser and the reading read the same three cards", async () => {
    const d = await member();
    const dealt = await d.call(draw, { templateId: "self-flow", picks: [3, 30], keep: KEEP });
    expect(dealt.status).toBe(200);
    const cards = dealt.data.cards as Array<{ position: string; cardId: string; orientation: string }>;
    expect(cards).toHaveLength(3);
    expect(cards[0]).toEqual({ position: "지금의 나", ...KEEP });
    expect(cards.slice(1).map((c) => c.position)).toEqual(["필요한 것", "이 시기의 흐름"]);
    expect(cards.slice(1).some((c) => c.cardId === KEEP.cardId)).toBe(false);

    const t = await d.call(teaser, { drawToken: dealt.data.drawToken, input: MONEY_INPUT });
    expect(t.status).toBe(200);
    expect(t.data.cards.map((c: { cardId: string }) => c.cardId)).toEqual(cards.map((c) => c.cardId));
    const r = await d.call(reading, { drawToken: dealt.data.drawToken, input: MONEY_INPUT });
    expect(r.status).toBe(200);
    expect(r.data.reading.cards.map((c: { cardId: string }) => c.cardId)).toEqual(cards.map((c) => c.cardId));
  });

  it("answers 400 for a bad card id, a bad orientation, a pick count that does not fit, and a spread that is not a standard three", async () => {
    const d = await member();
    const bad = [
      { templateId: "self-flow", picks: [3, 30], keep: { cardId: "major-99-nothing", orientation: "upright" } },
      { templateId: "self-flow", picks: [3, 30], keep: { cardId: KEEP.cardId, orientation: "sideways" } },
      { templateId: "self-flow", picks: [3, 30], keep: { cardId: KEEP.cardId } },
      { templateId: "self-flow", picks: [3, 30], keep: "major-17-star" },
      { templateId: "self-flow", picks: [3, 30, 60], keep: KEEP },
      { templateId: "self-flow", picks: [3], keep: KEEP },
      { templateId: "self-flow", picks: [3, 77], keep: KEEP },
      { templateId: "deep-tarot", picks: [0, 1, 2, 3, 4, 5, 6, 7, 8], keep: KEEP },
      { templateId: "daily", picks: [], keep: KEEP },
      { templateId: "match", picks: [0, 1, 2, 3], keep: KEEP },
    ];
    for (const body of bad) expect((await d.call(draw, body)).status, JSON.stringify(body)).toBe(400);
  });

  it("refuses keep while carry is off, and deals the plain draw as before", async () => {
    const beyond = SITE.features.beyond as { carry: boolean };
    beyond.carry = false;
    try {
      const d = await member();
      expect((await d.call(draw, { templateId: "self-flow", picks: [3, 30], keep: KEEP })).status).toBe(400);
      const plain = await d.call(draw, { templateId: "self-flow", picks: [3, 30, 60] });
      expect(plain.status).toBe(200);
      expect(plain.data.cards).toHaveLength(3);
    } finally {
      beyond.carry = true;
    }
  });
});
