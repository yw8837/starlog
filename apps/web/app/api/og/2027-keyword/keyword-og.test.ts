import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ILJU } from "@/lib/keyword2027";
import { contentOf } from "@/lib/keyword2027Content";
import { GET } from "./[ilju]/route";

/** /api/og/2027-keyword/<slug>: next/og and the fonts are replaced, so the test reads what the image draws. */
const { drawn } = vi.hoisted(() => ({ drawn: [] as Array<{ element: ReactElement; init: { width?: number; height?: number } }> }));
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(element: ReactElement, init: { width?: number; height?: number } = {}) {
      super("png", { headers: { "content-type": "image/png" } });
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

const get = (slug: string, query = "") =>
  GET(new Request(`https://starlog.yeolmaeapps.kr/api/og/2027-keyword/${slug}${query}`), { params: Promise.resolve({ ilju: slug }) });

beforeEach(() => {
  drawn.length = 0;
});

describe("the 일주's share image", () => {
  it("is a 1200×630 PNG with the keyword big, the 일주, \"2027년 나의 키워드 · 스타로그\" and the site's host", async () => {
    const res = await get("gap-ja");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/^public, max-age=\d+/);
    expect(drawn[0]!.init).toMatchObject({ width: 1200, height: 630 });
    const text = textOf(drawn[0]!.element);
    expect(text).toContain(contentOf(ILJU[0]!).keyword);
    expect(text).toContain("갑자일주의 2027년");
    expect(text).toContain("2027년 나의 키워드 · 스타로그");
    expect(text).toContain("starlog.yeolmaeapps.kr");
  });

  it("exists for each of the 60 and nothing else, and draws nothing from the address but the 일주", async () => {
    for (const ilju of ILJU) expect((await get(ilju.slug)).status, ilju.slug).toBe(200);
    expect(drawn).toHaveLength(60);
    expect((await get("gap-chuk")).status).toBe(404);
    expect((await get("1990-01-01")).status).toBe(404);
    expect(drawn).toHaveLength(60);
    const res = await get("eul-chuk", "?y=1990&m=1&d=1&birth=1990-01-01");
    expect(res.status).toBe(200);
    expect(textOf(drawn.at(-1)!.element)).not.toMatch(/1990/);
  });
});
