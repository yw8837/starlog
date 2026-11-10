import { describe, expect, it } from "vitest";
import { META_REVISION_DATE } from "./legal";
import { metaPageAllowed, metaPixelOn } from "./metaPixel";

const IN_FORCE = Date.parse(`${META_REVISION_DATE}T00:00:00+09:00`);

describe("Meta pixel (sales 2026-11-10 item 7)", () => {
  it("is on only with a pixel id from the build and only once the privacy revision naming Meta is in force", () => {
    expect(metaPixelOn("", IN_FORCE)).toBe(false);
    expect(metaPixelOn("not-an-id", IN_FORCE)).toBe(false);
    expect(metaPixelOn("123456789012345", IN_FORCE - 1)).toBe(false);
    expect(metaPixelOn("123456789012345", IN_FORCE)).toBe(true);
  });

  it("counts a page only when its address holds nothing personal: no id pages, no /pay, no query but utm tags", () => {
    const o = "https://starlog.yeolmaeapps.kr";
    expect(metaPageAllowed(`${o}/`)).toBe(true);
    expect(metaPageAllowed(`${o}/premium/newyear-2027?utm_source=meta&utm_campaign=y`)).toBe(true);
    for (const path of ["/chapter/abc123", "/s/xyz", "/b/CODE", "/invite/tok", "/pay/success", "/pay/checkout?product=match", "/tarot/new?new=1", "/%63hapter/abc"]) {
      expect(metaPageAllowed(`${o}${path}`), path).toBe(false);
    }
  });
});
