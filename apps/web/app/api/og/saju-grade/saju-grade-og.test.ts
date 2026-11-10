import { solarTermsOfYear } from "@starlog/core";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GRADE_SLUGS } from "@/lib/sajuGrade";
import { GET } from "./[slug]/route";

/** /api/og/saju-grade/<year>-<grade> (spec 2026-11-11 C): next/og and the fonts are replaced, so the test reads the tree drawn. */
const { drawn, fonts } = vi.hoisted(() => ({ drawn: [] as ReactElement[], fonts: [] as Array<[string, string]> }));
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(element: ReactElement, init?: { width?: number; height?: number; headers?: Record<string, string> }) {
      super("png", { headers: { "content-type": "image/png", "x-size": `${init?.width}x${init?.height}`, ...init?.headers } });
      drawn.push(element);
    }
  },
}));
vi.mock("@/lib/og/googleFont", () => ({
  ogFonts: async (serif: string, sans: string) => {
    fonts.push([serif, sans]);
    return [];
  },
}));

type Props = { children?: ReactNode; src?: string };
function drawnParts(element: ReactElement): { text: string; images: string[] } {
  const text: string[] = [];
  const images: string[] = [];
  const walk = (node: ReactNode): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "string" || typeof node === "number") return void text.push(String(node));
    if (isValidElement(node)) {
      const props = (node as ReactElement<Props>).props;
      if (node.type === "img" && props.src) images.push(props.src);
      walk(props.children);
    }
  };
  walk(element);
  return { text: text.join(" "), images };
}

/** The owner's 사주주 as a PNG (a few bytes), or a refusal. */
function stubArt(ok: boolean): string[] {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(String(url));
    return ok ? new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { headers: { "content-type": "image/png" } }) : new Response("nope", { status: 404 });
  });
  return asked;
}

function stubEdgeCache(): string[] {
  const stored: string[] = [];
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async (request: Request) => void stored.push(request.url) } });
  return stored;
}

const get = (slug: string, query = "") => GET(new Request(`https://starlog.yeolmaeapps.kr/api/og/saju-grade/${slug}${query}`), { params: Promise.resolve({ slug }) });

afterEach(() => {
  drawn.length = 0;
  fonts.length = 0;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A fixed day well inside 2026's 세운 (the cache headers and keys depend on the year in force). */
const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

describe("/api/og/saju-grade/[slug]", () => {
  it.each(GRADE_SLUGS.map((slug) => [slug]))("%s: a 1200×630 PNG with the year, the grade, its nickname, 사주주 and the host", async (slug) => {
    at("2026-11-11T12:00:00+09:00");
    const asked = stubArt(true);
    const res = await get(slug);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-size")).toBe("1200x630");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(asked).toEqual(["https://starlog.yeolmaeapps.kr/characters/og/rabbit-hanbok.v2-600.png"]);
    const { text, images } = drawnParts(drawn[0] as ReactElement);
    expect(images).toEqual(["data:image/png;base64,iVBORw=="]);
    const [year, letter] = slug.split("-");
    expect(text).toContain(`${year} `);
    expect(text).toContain(letter!.toUpperCase());
    expect(text).toMatch(/보름달 사주주|차오르는 달 사주주|초승달 사주주|달빛 모으는 사주주/);
    expect(text).toContain("starlog.yeolmaeapps.kr");
    // no share, no score, no birth: the slug is all it knows
    expect(text).not.toMatch(/%|점수|순위|\d{4}년\s?\d{1,2}월/);
    const [serif, sans] = fonts[0]!;
    for (const ch of text.replace(/\s/g, "")) expect(serif + sans, ch).toContain(ch);
  });

  it("?size=story is the 1080×1920 story picture, kept under its own address (and this year's under its year)", async () => {
    at("2026-11-11T12:00:00+09:00");
    stubArt(true);
    const stored = stubEdgeCache();
    const res = await get("2026-s", "?size=story");
    expect(res.headers.get("x-size")).toBe("1080x1920");
    expect(stored).toEqual(["https://starlog.yeolmaeapps.kr/api/og/saju-grade/2026-s?size=story&now=2026"]);
    const plain = await get("2026-s", "?anything=1");
    expect(plain.headers.get("x-size")).toBe("1200x630");
    expect(stored.at(-1)).toBe("https://starlog.yeolmaeapps.kr/api/og/saju-grade/2026-s?now=2026");
    await get("2027-s", "?size=story");
    expect(stored.at(-1)).toBe("https://starlog.yeolmaeapps.kr/api/og/saju-grade/2027-s?size=story");
  });

  it("draws without the picture when it cannot be read, sent for five minutes and never kept", async () => {
    stubArt(false);
    const stored = stubEdgeCache();
    const res = await get("2027-c");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(stored).toEqual([]);
    expect(drawnParts(drawn[0] as ReactElement).images).toEqual([]);
  });

  it("from 입춘 2027 draws the last chip's card (2036-b), the year after the ten built ahead (fixed clock)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-02-05T12:00:00+09:00"));
    try {
      stubArt(true);
      const res = await get("2036-b");
      expect(res.status).toBe(200);
      const { text } = drawnParts(drawn[0] as ReactElement);
      expect(text).toContain("2036 병진년");
      expect(text).toContain("초승달 사주주");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never serves a kept '올해' picture after 입춘: the year being current is in the cache key, and it is kept no longer than to 입춘 (fixed clock)", async () => {
    // an edge cache that really keeps what is put, by key
    const kept = new Map<string, Response>();
    vi.stubGlobal("caches", {
      default: {
        match: async (request: Request) => kept.get(request.url)?.clone(),
        put: async (request: Request, response: Response) => void kept.set(request.url, response),
      },
    });
    stubArt(true);
    try {
      // the day before 입춘 2027 (2027-02-04 KST): 2026 is still this year
      at("2027-02-03T12:00:00+09:00");
      const before = await get("2026-s");
      expect(drawnParts(drawn.at(-1) as ReactElement).text).toContain("올해의 사주 등급");
      const maxAge = Number(/max-age=(\d+)/.exec(before.headers.get("cache-control") ?? "")![1]);
      const ipchun = Date.parse(solarTermsOfYear(2027).find((t) => t.name === "입춘")!.instantUTC);
      expect(maxAge).toBe(Math.ceil((ipchun - Date.parse("2027-02-03T12:00:00+09:00")) / 1000)); // to 입춘, not a full day past it
      expect(maxAge).toBeLessThan(24 * 60 * 60);
      expect([...kept.keys()]).toEqual(["https://starlog.yeolmaeapps.kr/api/og/saju-grade/2026-s?now=2026"]);

      // after 입춘: the kept picture is not this request's, so it is drawn again without 올해
      vi.setSystemTime(new Date("2027-02-05T12:00:00+09:00"));
      const drawnBefore = drawn.length;
      const after = await get("2026-s");
      expect(after.status).toBe(200);
      expect(drawn.length).toBe(drawnBefore + 1);
      const { text } = drawnParts(drawn.at(-1) as ReactElement);
      expect(text).not.toContain("올해");
      expect(text).toContain("2026 병오년 · 사주 등급");
      expect(after.headers.get("cache-control")).toBe("public, max-age=86400");
      expect(kept.has("https://starlog.yeolmaeapps.kr/api/og/saju-grade/2026-s")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is a 404 for anything else, before anything is fetched or drawn", async () => {
    const asked = stubArt(true);
    for (const slug of ["2025-s", "2086-a", "2026-d", "2026-S", "1995-06-01", "2026-s-1995", "constructor"]) expect((await get(slug)).status, slug).toBe(404);
    expect(asked).toEqual([]);
    expect(drawn).toEqual([]);
  });
});
