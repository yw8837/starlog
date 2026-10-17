import { describe, expect, it } from "vitest";
import { SITE } from "@/lib/config";
import { PREMIUM, PREMIUM_IDS, inWindow, isPremiumId, premiumBySlug, premiumPath, premiumShareHref } from "./products";

describe("premium products", () => {
  it("prices and names come from SITE", () => {
    for (const p of SITE.price.premium) expect(PREMIUM[p.id]).toMatchObject({ name: p.name, krw: p.krw, slug: p.slug });
    expect(PREMIUM_IDS).toEqual(["tarot-deep", "match", "newyear-2027"]);
    expect([PREMIUM["tarot-deep"].krw, PREMIUM.match.krw, PREMIUM["newyear-2027"].krw]).toEqual([7900, 7900, 14900]);
  });

  it("calls 궁합 프리미엄 궁합 everywhere (owner 2026-10-17): the name checkout, receipts and screens show is the entries' name", () => {
    expect(PREMIUM.match.name).toBe("프리미엄 궁합");
    expect(JSON.stringify(SITE.price.premium)).not.toContain("우리 사이");
  });

  it("maps slugs to products and paths", () => {
    expect(premiumBySlug("deep-tarot")?.id).toBe("tarot-deep");
    expect(premiumPath("newyear-2027")).toBe("/premium/newyear-2027");
    // A shared record's link: its product page, which sends the recipient home while premium is hidden (review 2026-10-17 L5)
    expect(premiumShareHref("match")).toBe("/premium/match?from=share");
    expect(isPremiumId("match")).toBe(true);
    expect(isPremiumId("tarot")).toBe(false);
  });

  it("holds three follow-ups (owner 2026-10-17) and three scope lines each, the count in its line", () => {
    for (const id of PREMIUM_IDS) {
      expect(PREMIUM[id].followUps).toBe(3);
      expect(PREMIUM[id].scope).toHaveLength(3);
      expect(PREMIUM[id].scope[1]).toBe("이어서 물어보기 3번");
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
    // 켈틱 크로스 10장 and 프리미엄 궁합 go on sale with the premium clauses (owner 2026-10-17)
    expect(inWindow(PREMIUM.match, Date.parse("2026-10-24T00:00:00+09:00") - 1)).toBe(false);
    expect(inWindow(PREMIUM.match, Date.parse("2026-10-24T00:00:00+09:00"))).toBe(true);
  });

  it("has one name per product on every screen, checkout and receipt (owner 2026-10-17); never 셀틱, Celtic or 베타", () => {
    expect(PREMIUM_IDS.map((id) => PREMIUM[id].name)).toEqual(["켈틱 크로스 10장", "프리미엄 궁합", "2027 신년운세"]);
    for (const id of PREMIUM_IDS) expect(PREMIUM[id]).not.toHaveProperty("entry");
    expect(JSON.stringify(PREMIUM)).not.toMatch(/셀틱|celtic/i);
    expect(JSON.stringify(PREMIUM)).not.toMatch(/베타/);
  });
});
