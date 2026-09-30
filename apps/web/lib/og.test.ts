import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OG_TEXT } from "./og";

// Characters each offline subset covers (scripts/build-og-fonts.py).
const glyphs: Record<string, string> = JSON.parse(readFileSync(new URL("../assets/og/glyphs.json", import.meta.url), "utf8"));

describe("Open Graph text", () => {
  it("only uses characters both font subsets cover, so next/og never fetches a font", () => {
    expect(Object.keys(glyphs).sort()).toEqual(["NotoSansKR-Medium.og.ttf", "NotoSerifKR-Bold.og.ttf"]);
    const text = [...Object.values(OG_TEXT), "· "].join("");
    for (const [font, covered] of Object.entries(glyphs)) {
      const missing = [...new Set(text)].filter((ch) => !covered.includes(ch));
      expect(missing, font).toEqual([]);
    }
  });
});
