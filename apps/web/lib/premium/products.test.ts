import { describe, expect, it } from "vitest";
import { SITE } from "@/lib/config";
import { PREMIUM, PREMIUM_IDS, inWindow, isPremiumId, premiumBySlug, premiumPath } from "./products";

describe("premium products", () => {
  it("prices and names come from SITE", () => {
    for (const p of SITE.price.premium) expect(PREMIUM[p.id]).toMatchObject({ name: p.name, krw: p.krw, slug: p.slug });
    expect(PREMIUM_IDS).toEqual(["tarot-deep", "match", "newyear-2027"]);
    expect([PREMIUM["tarot-deep"].krw, PREMIUM.match.krw, PREMIUM["newyear-2027"].krw]).toEqual([7900, 7900, 14900]);
  });

  it("calls 궁합 프리미엄 궁합 everywhere (owner 2026-10-17): the name checkout, receipts and screens show is the entries' name", () => {
    expect(PREMIUM.match.name).toBe("프리미엄 궁합");
    expect(PREMIUM.match.entry).toBe(PREMIUM.match.name);
    expect(JSON.stringify(SITE.price.premium)).not.toContain("우리 사이");
  });

  it("maps slugs to products and paths", () => {
    expect(premiumBySlug("deep-tarot")?.id).toBe("tarot-deep");
    expect(premiumPath("newyear-2027")).toBe("/premium/newyear-2027");
    expect(isPremiumId("match")).toBe(true);
    expect(isPremiumId("tarot")).toBe(false);
  });

  it("holds five follow-ups and three scope lines each", () => {
    for (const id of PREMIUM_IDS) {
      expect(PREMIUM[id].followUps).toBe(5);
      expect(PREMIUM[id].scope).toHaveLength(3);
    }
    expect(PREMIUM["newyear-2027"].parts).toHaveLength(3);
    expect(PREMIUM["tarot-deep"].parts).toHaveLength(2);
  });

  it("opens 2027 신년운세 from 2026-11-15 00:00 to 2027-12-01 00:00 KST", () => {
    const ny = PREMIUM["newyear-2027"];
    expect(ny.opensAt).toBe(Date.parse("2026-11-15T00:00:00+09:00"));
    expect(inWindow(ny, Date.parse("2026-11-14T23:59:59+09:00"))).toBe(false);
    expect(inWindow(ny, Date.parse("2026-11-15T00:00:00+09:00"))).toBe(true);
    expect(inWindow(ny, Date.parse("2027-12-01T00:00:00+09:00"))).toBe(false);
    expect(inWindow(PREMIUM.match, 0)).toBe(true);
  });

  it("calls the ten-card spread 켈틱 크로스 on screens only (owner 2026-10-16): never in the name, scope or parts checkout and receipts show; never 베타", () => {
    expect([PREMIUM["tarot-deep"].entry, PREMIUM.match.entry, PREMIUM["newyear-2027"].entry]).toEqual(["켈틱 크로스 10장", "프리미엄 궁합", "2027 신년운세"]);
    const shown = PREMIUM_IDS.map((id) => {
      const { entry: _entry, ...rest } = PREMIUM[id];
      return rest;
    });
    expect(JSON.stringify(shown)).not.toMatch(/켈틱|셀틱|celtic/i);
    expect(JSON.stringify(PREMIUM)).not.toMatch(/베타/);
  });
});
