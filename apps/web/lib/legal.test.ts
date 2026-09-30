import { describe, expect, it } from "vitest";
import { SITE } from "./config";
import { LEGAL_EFFECTIVE_DATE, LEGAL_LINKS, contactChannels, koreanDate } from "./legal";

describe("legal helpers", () => {
  it("takes effect on 2026-10-01", () => {
    expect(LEGAL_EFFECTIVE_DATE).toBe("2026-10-01");
    expect(koreanDate(LEGAL_EFFECTIVE_DATE)).toBe("2026년 10월 1일");
  });

  it("emphasizes only the privacy policy link", () => {
    expect(LEGAL_LINKS.filter((link) => "emphasis" in link).map((link) => link.href)).toEqual(["/privacy"]);
  });

  it("lists contact channels only once they are filled", () => {
    expect(contactChannels()).toEqual([]);
    expect(contactChannels({ ...SITE.business, email: " hello@example.com ", phone: "" })).toEqual([["이메일", "hello@example.com"]]);
  });
});
