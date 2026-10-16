import { describe, expect, it } from "vitest";
import { SITE } from "@/lib/config";
import { GIFT_DAYS, GIFT_PRODUCT, NEWYEAR_OPENS_AT, PRODUCTS, productById, sellable, standardProduct } from "./catalog";

const NOW = Date.parse("2026-10-01T12:00:00+09:00");

describe("catalog", () => {
  it("prices the standard readings from SITE", () => {
    expect(standardProduct("tarot")).toMatchObject({ id: "tarot", name: "타로 전체 풀이", krw: SITE.price.tarotStandardKrw, deliverable: true });
    expect(standardProduct("saju")).toMatchObject({ id: "saju", name: "사주 전체 풀이", krw: SITE.price.sajuStandardKrw, deliverable: true });
    expect(sellable(standardProduct("tarot"), NOW)).toBe(true);
  });

  it("sells every premium reading from SITE at its price within its window, one opening per purchase", () => {
    for (const premium of SITE.price.premium) {
      expect(productById(premium.id)).toMatchObject({ name: premium.name, krw: premium.krw, deliverable: true });
    }
    expect(sellable(productById("match")!, Date.parse("2026-10-20T00:00:00+09:00"))).toBe(true);
    expect(sellable(productById("newyear-2027")!, Date.parse("2027-12-01T00:00:00+09:00"))).toBe(false);
    expect([productById("tarot-deep")?.krw, productById("match")?.krw, productById("newyear-2027")?.krw]).toEqual([7900, 7900, 14900]);
  });

  it("opens 2027 신년운세 at 2026-11-15 00:00 KST", () => {
    expect(NEWYEAR_OPENS_AT).toBe(Date.parse("2026-11-15T00:00:00+09:00"));
    expect(productById("newyear-2027")?.opensAt).toBe(NEWYEAR_OPENS_AT);
    const opened = productById("newyear-2027")!;
    expect(sellable(opened, NEWYEAR_OPENS_AT - 1)).toBe(false);
    expect(sellable(opened, NEWYEAR_OPENS_AT)).toBe(true);
  });

  it("knows no other ids", () => {
    expect(productById("moon-30")).toBeNull();
    expect(productById("")).toBeNull();
  });

  it("names the premium readings as their screens do (owner 2026-10-17), never 셀틱 or Celtic", () => {
    expect(productById("tarot-deep")).toMatchObject({ name: "켈틱 크로스 10장", orderName: `${SITE.nameKo} 켈틱 크로스 10장` });
    expect(productById("match")).toMatchObject({ name: "프리미엄 궁합", orderName: `${SITE.nameKo} 프리미엄 궁합` });
    expect(JSON.stringify(PRODUCTS)).not.toMatch(/셀틱|celtic/i);
  });

  it("gives Toss an order name of 100 characters or fewer", () => {
    for (const product of PRODUCTS) expect(product.orderName.length).toBeLessThanOrEqual(100);
    expect(standardProduct("tarot").orderName).toBe(`${SITE.nameKo} 타로 전체 풀이`);
  });

  it("makes the signup gift one standard tarot reading, kept for 90 KST days (owner 2026-10-08)", () => {
    expect(GIFT_PRODUCT).toBe("tarot");
    expect(GIFT_DAYS).toBe(90);
  });

  it("holds no unit price: every purchase is one opening", () => {
    for (const product of PRODUCTS) expect(product).not.toHaveProperty("units");
  });
});
