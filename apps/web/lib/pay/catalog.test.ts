import { describe, expect, it } from "vitest";
import { SITE } from "@/lib/config";
import { GIFT_DAYS, NEWYEAR_OPENS_AT, PRODUCTS, productById, sellable, standardProduct, unitsFor } from "./catalog";

const NOW = Date.parse("2026-10-01T12:00:00+09:00");

describe("catalog", () => {
  it("prices the standard readings from SITE and lets 별조각 open them", () => {
    expect(standardProduct("tarot")).toMatchObject({ id: "tarot", name: "타로 전체 풀이", krw: SITE.price.tarotStandardKrw, units: SITE.price.unitsPerReading, deliverable: true });
    expect(standardProduct("saju")).toMatchObject({ id: "saju", name: "사주 전체 풀이", krw: SITE.price.sajuStandardKrw, units: SITE.price.unitsPerReading, deliverable: true });
    expect(sellable(standardProduct("tarot"), NOW)).toBe(true);
  });

  it("lists every premium reading from SITE at its price, none sellable before its generator exists", () => {
    expect(SITE.price.premium.length).toBeGreaterThan(0);
    for (const premium of SITE.price.premium) {
      const product = productById(premium.id);
      expect(product).toMatchObject({ name: premium.name, krw: premium.krw, units: null, deliverable: false });
      expect(sellable(product!, Date.parse("2027-06-01T00:00:00+09:00"))).toBe(false);
    }
    expect([productById("tarot-deep")?.krw, productById("match")?.krw, productById("newyear-2027")?.krw]).toEqual([7900, 7900, 7900]);
  });

  it("opens 2027 신년운세 at 2026-11-15 00:00 KST", () => {
    expect(NEWYEAR_OPENS_AT).toBe(Date.parse("2026-11-15T00:00:00+09:00"));
    expect(productById("newyear-2027")?.opensAt).toBe(NEWYEAR_OPENS_AT);
    const opened = { ...productById("newyear-2027")!, deliverable: true };
    expect(sellable(opened, NEWYEAR_OPENS_AT - 1)).toBe(false);
    expect(sellable(opened, NEWYEAR_OPENS_AT)).toBe(true);
  });

  it("knows no other ids", () => {
    expect(productById("moon-30")).toBeNull();
    expect(productById("")).toBeNull();
  });

  it("never names the 10-card spread after its tradition", () => {
    expect(JSON.stringify(PRODUCTS)).not.toMatch(/켈틱|셀틱|celtic/i);
  });

  it("gives Toss an order name of 100 characters or fewer", () => {
    for (const product of PRODUCTS) expect(product.orderName.length).toBeLessThanOrEqual(100);
    expect(standardProduct("tarot").orderName).toBe(`${SITE.nameKo} 타로 전체 풀이`);
  });

  it("puts a standard reading's 별조각 price in a paid lot, one opening for premium", () => {
    expect(unitsFor(standardProduct("tarot"))).toBe(SITE.price.unitsPerReading);
    expect(unitsFor(productById("match")!)).toBe(1);
  });

  it("keeps 별조각 for 90 KST days", () => {
    expect(GIFT_DAYS).toBe(90);
  });
});
