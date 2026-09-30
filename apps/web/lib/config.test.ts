import { describe, expect, it } from "vitest";
import { SITE, footerNotice } from "./config";

describe("SITE", () => {
  it("keeps the postal address, mail-order number and phone empty, and lists the contact email", () => {
    expect(SITE.business.address).toBe("");
    expect(SITE.business.mailOrderNo).toBe("");
    expect(SITE.business.email).toBe("studioyeolmae.com@gmail.com");
    expect(SITE.business.phone).toBe("");
  });

  it("names the service and the production origin from one place", () => {
    expect(SITE.name).toBe("Starlog");
    expect(SITE.nameKo).toBe("스타로그");
    expect(SITE.url).toBe("https://starlog.yeolmaeapps.kr");
  });
});

describe("footerNotice", () => {
  it("renders only the filled business fields", () => {
    expect(footerNotice()).toEqual([
      "상호 열매스튜디오",
      "대표 최용우",
      "사업자등록번호 665-38-01736",
    ]);
  });

  it("includes optional fields once they are filled, and skips blank ones", () => {
    const notice = footerNotice({
      ...SITE.business,
      mailOrderNo: "2026-서울-0001",
      email: "  ",
      phone: "02-000-0000",
    });
    expect(notice).toContain("통신판매업 신고번호 2026-서울-0001");
    expect(notice).toContain("전화 02-000-0000");
    expect(notice.some((line) => line.startsWith("이메일"))).toBe(false);
  });

  it("never renders an address, even if one were configured", () => {
    const notice = footerNotice({ ...SITE.business, address: "ADDRESS-SENTINEL" });
    expect(notice.some((line) => line.includes("ADDRESS-SENTINEL"))).toBe(false);
    expect(notice.some((line) => line.startsWith("주소"))).toBe(false);
  });
});
