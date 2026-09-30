import { describe, expect, it } from "vitest";
import { SITE, footerNotice } from "./config";

describe("SITE", () => {
  it("holds the business details the footer must show (전자상거래법 사업자 정보)", () => {
    expect(SITE.business.address).toBe("부산광역시 영도구 동삼서로 51-7, 3층 302호(동삼동, 금관빌리지)");
    expect(SITE.business.mailOrderNo).toBe("2026-부산영도-0153");
    expect(SITE.business.email).toBe("studioyeolmae.com@gmail.com");
    expect(SITE.business.phone).toBe("010-8282-8837");
  });

  it("names the service and the production origin from one place", () => {
    expect(SITE.name).toBe("Starlog");
    expect(SITE.nameKo).toBe("스타로그");
    expect(SITE.url).toBe("https://starlog.yeolmaeapps.kr");
  });
});

describe("footerNotice", () => {
  it("renders the filled business fields in display order", () => {
    expect(footerNotice()).toEqual([
      "상호 열매스튜디오",
      "대표 최용우",
      "사업자등록번호 665-38-01736",
      "통신판매업 신고번호 2026-부산영도-0153",
      "사업장 주소 부산광역시 영도구 동삼서로 51-7, 3층 302호(동삼동, 금관빌리지)",
      "이메일 studioyeolmae.com@gmail.com",
      "전화 010-8282-8837",
    ]);
  });

  it("skips blank fields", () => {
    const notice = footerNotice({ ...SITE.business, address: " ", email: "  ", phone: "" });
    expect(notice.some((line) => line.startsWith("사업장 주소"))).toBe(false);
    expect(notice.some((line) => line.startsWith("이메일"))).toBe(false);
    expect(notice.some((line) => line.startsWith("전화"))).toBe(false);
    expect(notice).toContain("통신판매업 신고번호 2026-부산영도-0153");
  });
});
