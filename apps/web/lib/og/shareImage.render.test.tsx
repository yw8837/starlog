import { ImageResponse } from "next/og";
import { describe, expect, it } from "vitest";
import { SHARE_OG, shareOgImage } from "./cardsImage";

/**
 * The share preview really drawn (the route's tests mock ImageResponse): an upright card face used to carry
 * `transform: undefined`, which satori refuses, so every shared reading with an upright card had no preview image and
 * Kakao sent text only (owner 2026-10-23 "결과공유하면 텍스트만 날라간다").
 */
const FACE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("the share preview image", () => {
  it.each([
    ["upright", false],
    ["reversed", true],
  ])("draws a %s card face", async (_name, reversed) => {
    const image = new ImageResponse(shareOgImage({ label: "STARLOG", headline: "STARLOG", cards: [{ cardId: "major-17-star", src: FACE, reversed }], host: "starlog.yeolmaeapps.kr" }), SHARE_OG);
    const bytes = new Uint8Array(await image.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
  });

  it("draws a constellation with the score big (별자리 인연)", async () => {
    const image = new ImageResponse(shareOgImage({ label: "STARLOG", headline: "STARLOG", big: "87", sign: "leo", lit: 3, host: "starlog.yeolmaeapps.kr" }), SHARE_OG);
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });
});

describe("the saju share preview", () => {
  it("draws the five 기운 motif beside the text", async () => {
    const image = new ImageResponse(shareOgImage({ label: "STARLOG", headline: "STARLOG", body: "STARLOG", elements: true, host: "starlog.yeolmaeapps.kr" }), SHARE_OG);
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });
});
