import { describe, expect, it } from "vitest";
import { SITE, won } from "./config";
import { approxCharsText, moonRefundKrw, packReadings, perReadingKrw, perReadingLabel } from "./pricing";

const units = SITE.price.unitsPerReading;

describe("per-reading price of a 달빛 pack", () => {
  it("is the pack price over the 달빛 received (bonus included) times 달빛 per reading, rounded", () => {
    for (const pack of SITE.moonPacks) {
      const exact = (pack.krw / (pack.units + pack.bonus)) * units;
      expect(perReadingKrw(pack).krw).toBe(Math.round(exact));
      expect(perReadingLabel(pack)).toBe(Number.isInteger(exact) ? won(exact) : `약 ${won(Math.round(exact))}`);
    }
  });

  it("marks rounded values with 약 and leaves exact ones plain", () => {
    expect(perReadingLabel({ units: 30, bonus: 0, krw: 8500 }, 10)).toBe("약 2,833원");
    expect(perReadingLabel({ units: 100, bonus: 20, krw: 27000 }, 10)).toBe("2,250원");
  });

  it("counts whole readings and the 달빛 left over", () => {
    expect(packReadings({ units: 60, bonus: 6, krw: 16900 }, 10)).toEqual({ readings: 6, leftover: 6 });
    for (const pack of SITE.moonPacks) {
      const { readings, leftover } = packReadings(pack);
      expect(readings * units + leftover).toBe(pack.units + pack.bonus);
    }
  });
});

describe("달빛 refund", () => {
  it("returns the whole payment when nothing was used", () => {
    for (const pack of SITE.moonPacks) expect(moonRefundKrw(pack, 0)).toBe(pack.krw);
  });

  it("spends bonus 달빛 first and refunds the purchased 달빛 left, with no fee", () => {
    const pack = { units: 60, bonus: 6, krw: 16900 } as const;
    // 10 used = 6 bonus + 4 purchased, so 56 of 60 purchased remain.
    expect(moonRefundKrw(pack, 10)).toBe(Math.round((16900 * 56) / 60));
    // Using only bonus 달빛 keeps the full refund.
    expect(moonRefundKrw(pack, 6)).toBe(16900);
    expect(moonRefundKrw(pack, 66)).toBe(0);
  });
});

describe("a reading's length before it is opened (owner 2026-10-08)", () => {
  it("is one number, or a range with ~ and no spaces, in ko-KR digits", () => {
    expect(approxCharsText({ min: 2000, max: 2000 })).toBe("2,000");
    expect(approxCharsText({ min: 2500, max: 3000 })).toBe("2,500~3,000");
  });

  it("says about 2,000 for tarot and 2,500~3,000 for saju (the new voice measured 2,545 on a real chapter)", () => {
    expect(approxCharsText(SITE.reading.approxChars.tarot)).toBe("2,000");
    expect(approxCharsText(SITE.reading.approxChars.saju)).toBe("2,500~3,000");
  });
});
