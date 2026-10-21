import { describe, expect, it } from "vitest";
import { SITE } from "./config";
import { GA_REVISION_DATE, LEGAL_EFFECTIVE_DATE, LEGAL_LINKS, PRIVACY_REVISION_DATE, contactChannels, gaRevisionInForce, koreanDate, privacyEffectiveDate, privacyRevisionInForce } from "./legal";

describe("legal helpers", () => {
  it("takes effect on 2026-10-15", () => {
    expect(LEGAL_EFFECTIVE_DATE).toBe("2026-10-15");
    expect(koreanDate(LEGAL_EFFECTIVE_DATE)).toBe("2026년 10월 15일");
  });

  it("emphasizes only the privacy policy link", () => {
    expect(LEGAL_LINKS.filter((link) => "emphasis" in link).map((link) => link.href)).toEqual(["/privacy"]);
  });

  it("lists contact channels only once they are filled", () => {
    expect(contactChannels()).toEqual([["이메일", SITE.business.email], ["전화", SITE.business.phone]]);
    expect(contactChannels({ ...SITE.business, email: "  ", phone: "" })).toEqual([]);
    expect(contactChannels({ ...SITE.business, email: " hello@example.com ", phone: "" })).toEqual([["이메일", "hello@example.com"]]);
  });

  it("dates the Google Analytics revision 2026-10-30 00:00 KST, apart from the 10/28 one, and the privacy policy's 시행일 follows whichever is in force", () => {
    expect(PRIVACY_REVISION_DATE).toBe("2026-10-28");
    expect(GA_REVISION_DATE).toBe("2026-10-30");
    const at = Date.parse("2026-10-30T00:00:00+09:00");
    expect(gaRevisionInForce(at - 1)).toBe(false);
    expect(gaRevisionInForce(at)).toBe(true);
    // The 10/28 revision is in force two days before; its own switch is unchanged.
    expect(privacyRevisionInForce(at - 1)).toBe(true);
    expect(privacyRevisionInForce(Date.parse("2026-10-28T00:00:00+09:00") - 1)).toBe(false);
    expect(privacyEffectiveDate(Date.parse("2026-10-27T12:00:00+09:00"))).toBe("2026-10-20");
    expect(privacyEffectiveDate(Date.parse("2026-10-29T12:00:00+09:00"))).toBe("2026-10-28");
    expect(privacyEffectiveDate(at)).toBe("2026-10-30");
  });
});
