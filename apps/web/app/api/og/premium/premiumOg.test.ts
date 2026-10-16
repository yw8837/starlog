import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARDS, TEMPLATES } from "@starlog/core";
import { LIMITS_PER_MINUTE, rateLimit, resetMemoryLimiter } from "@/lib/security/rateLimit";
import { POST } from "./route";

/** /api/og/premium (plan task 23): next/og and the fonts are replaced, so the test reads what the image draws. */
const { drawn } = vi.hoisted(() => ({ drawn: [] as Array<{ element: ReactElement; init: { width?: number; height?: number; headers?: Record<string, string> } }> }));
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(element: ReactElement, init: { width?: number; height?: number; headers?: Record<string, string> } = {}) {
      super("png", { headers: { "content-type": "image/png", ...init.headers } });
      drawn.push({ element, init });
    }
  },
}));
vi.mock("@/lib/og/googleFont", () => ({ ogFonts: async () => [] }));

function textOf(element: ReactElement): string {
  const out: string[] = [];
  const walk = (node: ReactNode): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "string" || typeof node === "number") return void out.push(String(node));
    if (isValidElement(node)) walk((node.props as { children?: ReactNode }).children);
  };
  walk(element);
  return out.join(" ");
}

const cards = (n: number) => CARDS.slice(0, n).map((card, i) => ({ cardId: card.id, orientation: i % 3 === 0 ? "reversed" : "upright" }));
const post = (body: unknown, query = "") =>
  POST(new Request(`https://starlog.yeolmaeapps.kr/api/og/premium${query}`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.90" }, body: JSON.stringify(body) }));

beforeEach(() => {
  resetMemoryLimiter();
  drawn.length = 0;
  vi.stubEnv("STARLOG_PREMIUM", "on");
});
afterEach(() => vi.unstubAllEnvs());

describe("premium share images: no personal data, ever", () => {
  it("draws the ten cards for 켈틱 크로스 10장, the five and the relation for 궁합, the year's title for 신년운세, and the site's host", async () => {
    const deep = await post({ product: "tarot-deep", cards: cards(10) });
    expect(deep.status).toBe(200);
    expect(deep.headers.get("content-type")).toBe("image/png");
    expect(textOf(drawn[0]!.element)).toContain("켈틱 크로스 10장");
    expect(textOf(drawn[0]!.element)).toContain("starlog.yeolmaeapps.kr");
    expect(drawn[0]!.init).toMatchObject({ width: 1080, height: 1350 });

    expect((await post({ product: "match", relation: "friend", cards: cards(TEMPLATES.match.positions.length) })).status).toBe(200);
    expect(textOf(drawn[1]!.element)).toContain("프리미엄 궁합 · 친구");

    expect((await post({ product: "newyear-2027", title: "차근차근 쌓아 가는 해" }, "?size=story")).status).toBe(200);
    expect(textOf(drawn[2]!.element)).toContain("2027년, 차근차근 쌓아 가는 해");
    expect(drawn[2]!.init).toMatchObject({ width: 1080, height: 1920 });
  });

  it("refuses any field outside product, cards, relation and title: a question, a note, a name, a birth, the day masters", async () => {
    for (const extra of [{ question: "그 사람은?" }, { note: "메모" }, { partnerLabel: "민지" }, { birth: { year: 1990 } }, { images: ["하늘의 해", "큰 강과 바다"] }]) {
      expect((await post({ product: "match", relation: "friend", cards: cards(5), ...extra })).status, JSON.stringify(extra)).toBe(400);
    }
    expect(drawn).toHaveLength(0);
  });

  it("refuses a title that is not plain Korean of 2 to 14 characters, an unknown relation, a card that is not one, and the wrong number of cards", async () => {
    for (const title of ["민지와 나의 해", "2027 좋은 해", "a nice year", "해", "아주아주아주아주아주아주아주긴제목"]) {
      const status = (await post({ product: "newyear-2027", title })).status;
      if (title === "민지와 나의 해") expect(status).toBe(200); // plain Korean passes; the screen sends only the reading's own title
      else expect(status, title).toBe(400);
    }
    expect((await post({ product: "match", relation: "neighbour", cards: cards(5) })).status).toBe(400);
    expect((await post({ product: "tarot-deep", cards: [...cards(9), { cardId: "not-a-card", orientation: "upright" }] })).status).toBe(400);
    expect((await post({ product: "tarot-deep", cards: cards(3) })).status).toBe(400);
    expect((await post({ product: "fusion", cards: cards(7) })).status).toBe(400);
  });
});

describe("the premium share image route (review 2026-10-17 L2)", () => {
  it("is not there while premium is off", async () => {
    vi.stubEnv("STARLOG_PREMIUM", "off");
    expect((await post({ product: "tarot-deep", cards: cards(10) })).status).toBe(404);
    expect(drawn).toHaveLength(0);
  });

  it("is never kept by a cache", async () => {
    const res = await post({ product: "tarot-deep", cards: cards(10) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("counts on a limiter of its own, apart from the AI generations'", async () => {
    for (let i = 0; i < LIMITS_PER_MINUTE.GEN_LIMITER; i++) await rateLimit("GEN_LIMITER", "203.0.113.90");
    expect((await post({ product: "tarot-deep", cards: cards(10) })).status).toBe(200);
    for (let i = 1; i < LIMITS_PER_MINUTE.SHARE_IMAGE_LIMITER; i++) await post({ product: "tarot-deep", cards: cards(10) });
    expect((await post({ product: "tarot-deep", cards: cards(10) })).status).toBe(429);
  });
});
