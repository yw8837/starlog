import { describe, expect, it } from "vitest";
import { clockIn, formatIsoDate, formatKrw, formatKstMonthDay, formatNumber, nextKstMidnight } from "./intl";

describe("intl", () => {
  it("formats Korean money and dates exactly as before", () => {
    expect(formatKrw("ko", 2900)).toBe("2,900원");
    expect(formatIsoDate("ko", "2026-10-01")).toBe("2026년 10월 1일");
    expect(formatKstMonthDay("ko", Date.UTC(2026, 9, 1, 3))).toBe("10월 1일");
  });

  it("shows KRW with the won sign in the other locales, never a converted amount", () => {
    for (const locale of ["en", "ja", "zh-hant"] as const) {
      const text = formatKrw(locale, 2900);
      expect(text, locale).toMatch(/2,900/);
      expect(text, locale).toMatch(/[₩￦]|KRW/);
    }
  });

  it("writes dates the way each language does", () => {
    expect(formatIsoDate("en", "2026-10-01")).toBe("October 1, 2026");
    expect(formatIsoDate("ja", "2026-10-01")).toBe("2026年10月1日");
    expect(formatIsoDate("zh-hant", "2026-10-01")).toBe("2026年10月1日");
    expect(formatKstMonthDay("en", Date.UTC(2026, 8, 30, 16))).toBe("Oct 1");
    expect(formatNumber("en", 12345)).toBe("12,345");
  });

  it("tells when the next KST midnight falls on the reader's clock", () => {
    const now = Date.UTC(2026, 9, 1, 12);
    expect(nextKstMidnight(now)).toBe(Date.UTC(2026, 9, 1, 15));
    expect(clockIn("Asia/Tokyo", nextKstMidnight(now))).toBe("00:00");
    expect(clockIn("Asia/Taipei", nextKstMidnight(now))).toBe("23:00");
    expect(clockIn("America/New_York", nextKstMidnight(now))).toBe("11:00");
  });
});
