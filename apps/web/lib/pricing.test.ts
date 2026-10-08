import { describe, expect, it } from "vitest";
import { SITE } from "./config";
import { approxCharsText } from "./pricing";

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
