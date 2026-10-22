import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BIRTH_CARDS } from "@/lib/birthCard";
import { GET } from "./[card]/route";

/** /api/og/birth-card/<slug>: next/og and the font download are replaced, so the test reads the element tree the route draws. */
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
/** Every text and image source in an element tree, as the renderer would draw them. */
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

/** The faces the route fetches: a few JPEG bytes for every URL, or a refusal. */
function stubFaces(ok: boolean): string[] {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(String(url));
    return ok ? new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "content-type": "image/jpeg" } }) : new Response("nope", { status: 404 });
  });
  return asked;
}

const get = (slug: string) => GET(new Request(`https://starlog.yeolmaeapps.kr/api/og/birth-card/${slug}`), { params: Promise.resolve({ card: slug }) });

/** A Workers edge cache that is always empty, recording what is stored in it. */
function stubEdgeCache(): string[] {
  const stored: string[] = [];
  vi.stubGlobal("caches", { default: { match: async () => undefined, put: async (request: Request) => void stored.push(request.url) } });
  return stored;
}

afterEach(() => {
  drawn.length = 0;
  fonts.length = 0;
  vi.unstubAllGlobals();
});

describe("/api/og/birth-card/[card]", () => {
  it.each(BIRTH_CARDS.map((card) => [card.slug, card] as const))("%s: a 1200×630 PNG with the Starlog face, the name and the test's name", async (slug, card) => {
    const asked = stubFaces(true);
    const res = await get(slug);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-size")).toBe("1200x630");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    // Always the Starlog deck's JPEG (satori cannot decode WebP), never the 1909 scans.
    expect(asked).toEqual([`https://starlog.yeolmaeapps.kr/cards/og/starlog/${card.cardId}.jpg`]);
    const { text, images } = drawnParts(drawn[0] as ReactElement);
    expect(images).toEqual(["data:image/jpeg;base64,/9j/2Q=="]);
    expect(text).toContain(card.name);
    expect(text).toContain("나를 닮은 타로 카드 · 스타로그");
    expect(text).toContain(card.traits[0]);
    expect(text).toContain("starlog.yeolmaeapps.kr");
    // Every drawn character is in the subsets asked for.
    const [serif, sans] = fonts[0]!;
    for (const ch of text.replace(/\s/g, "")) expect(serif + sans, ch).toContain(ch);
  });

  it("keeps a drawn preview at the edge for a day under the slug's address", async () => {
    stubFaces(true);
    const stored = stubEdgeCache();
    const res = await get("hermit");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(stored).toEqual(["https://starlog.yeolmaeapps.kr/api/og/birth-card/hermit"]);
  });

  it("draws a face it cannot read as a framed numeral, sent for five minutes and never kept at the edge, so the next request tries the face again", async () => {
    stubFaces(false);
    const stored = stubEdgeCache();
    const res = await get("hermit");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(stored).toEqual([]);
    const { text, images } = drawnParts(drawn[0] as ReactElement);
    expect(images).toEqual([]);
    expect(text).toContain("IX");
    expect(text).toContain("은둔자");
  });

  it("is a 404 for anything but the 22 slugs, with nothing fetched or drawn", async () => {
    const asked = stubFaces(true);
    for (const slug of ["major-09-hermit", "cups-03", "HERMIT", "constructor", "1990-05-15"]) expect((await get(slug)).status).toBe(404);
    expect(asked).toEqual([]);
    expect(drawn).toEqual([]);
  });
});
