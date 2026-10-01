import { afterEach, describe, expect, it, vi } from "vitest";
import { fontCssUrl, loadGoogleFont, ogFonts, uniqueChars } from "./googleFont";

const CSS = `@font-face {
  font-family: 'Gowun Batang';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/l/font?kit=abc&skey=1&v=v1) format('truetype');
}`;

describe("loadGoogleFont", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for a subset of the de-duplicated characters and returns the font binary", async () => {
    const font = new Uint8Array([0, 1, 0, 0, 9]).buffer;
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("https://fonts.googleapis.com/") ? new Response(CSS) : new Response(font),
    );
    vi.stubGlobal("fetch", fetchMock);
    const data = await loadGoogleFont("Gowun Batang", 700, "양자리 양자리 412점");
    expect(new Uint8Array(data)).toEqual(new Uint8Array(font));
    const cssUrl = new URL(fetchMock.mock.calls[0]![0]);
    expect(cssUrl.searchParams.get("family")).toBe("Gowun Batang:wght@700");
    expect(cssUrl.searchParams.get("text")).toBe(uniqueChars("양자리412점"));
    expect(Array.from(cssUrl.searchParams.get("text")!).filter((c) => c === "양")).toHaveLength(1);
    expect(fetchMock.mock.calls[1]![0]).toBe("https://fonts.gstatic.com/l/font?kit=abc&skey=1&v=v1");
  });

  it("throws on a non-200 answer, and ogFonts then falls back to no fonts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(loadGoogleFont("Noto Sans KR", 700, "가")).rejects.toThrow("500");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await ogFonts("가", "나")).toEqual([]);
  });

  it("builds the same URL for the same characters in any order", () => {
    expect(fontCssUrl("Noto Sans KR", 700, "나가")).toBe(fontCssUrl("Noto Sans KR", 700, "가 나 가"));
  });
});
