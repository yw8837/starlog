import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONSTELLATIONS } from "@starlog/core";
import { ConstellationBackdrop } from "./ConstellationBackdrop";

describe("ConstellationBackdrop", () => {
  it("draws every sign from its catalog stars and lines, hidden from assistive tech", () => {
    for (const c of CONSTELLATIONS) {
      const html = renderToStaticMarkup(<ConstellationBackdrop sign={c.id} />);
      expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
      expect(html.match(/<line /g)).toHaveLength(c.lines.length);
      // one glow and one core per star, at the catalog position
      for (const [x, y] of c.stars) expect(html.match(new RegExp(`cx="${x}" cy="${y}"`, "g"))).toHaveLength(2);
      // three stars may twinkle (only when motion is allowed, see the CSS)
      expect(html.match(/<g class="[^"]*twinkle/g)).toHaveLength(3);
    }
  });

  it("is the same on every render (no layout shift, no hydration mismatch)", () => {
    expect(renderToStaticMarkup(<ConstellationBackdrop sign="leo" />)).toBe(renderToStaticMarkup(<ConstellationBackdrop sign="leo" />));
  });
});
