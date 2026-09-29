import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NightSky, makeStars } from "./NightSky";

describe("makeStars", () => {
  it("places the same stars for the same seed", () => {
    expect(makeStars(40, 7)).toEqual(makeStars(40, 7));
  });

  it("places different stars for a different seed", () => {
    expect(makeStars(40, 7)).not.toEqual(makeStars(40, 8));
  });

  it("twinkles one star in three", () => {
    const stars = makeStars(39, 7);
    expect(stars.filter((star) => star.twinkle)).toHaveLength(13);
  });

  it("keeps every star inside the sky", () => {
    for (const star of makeStars(200, 3)) {
      expect(star.left).toBeGreaterThanOrEqual(0);
      expect(star.left).toBeLessThanOrEqual(100);
      expect(star.top).toBeGreaterThanOrEqual(0);
      expect(star.top).toBeLessThanOrEqual(100);
    }
  });
});

describe("NightSky", () => {
  it("renders identical markup on every render, so server and client agree", () => {
    const first = renderToStaticMarkup(createElement(NightSky, { constellation: true }));
    const second = renderToStaticMarkup(createElement(NightSky, { constellation: true }));
    expect(first).toBe(second);
  });

  it("is decorative: hidden from assistive tech", () => {
    expect(renderToStaticMarkup(createElement(NightSky))).toContain('aria-hidden="true"');
  });
});
