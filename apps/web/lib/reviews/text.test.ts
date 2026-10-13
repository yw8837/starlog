import { describe, expect, it } from "vitest";
import { maskNickname, reviewProblem } from "./text";

describe("reviewProblem", () => {
  it("lets ordinary lines through, and an empty one (the stars alone are a review)", () => {
    for (const line of ["", "생각보다 구체적이라 놀랐어요.", "시발점이 어디인지 알게 됐어요", "3장 다 공감했어요 ㅎㅎ", "2027년 3월이 기대돼요"]) {
      expect(reviewProblem(line), line).toBeNull();
    }
  });

  it("holds the length to 5–200 characters", () => {
    expect(reviewProblem("좋아요")).toBe("한 줄 후기는 5자 이상 써 주세요.");
    expect(reviewProblem("가".repeat(201))).toBe("한 줄 후기는 200자까지 쓸 수 있어요.");
  });

  it("refuses contact details, identity numbers, links, invitations elsewhere, swearing and spam", () => {
    const cases: Array<[string, string]> = [
      ["연락 주세요 010-1234-5678", "전화번호"],
      ["연락 주세요 01012345678", "전화번호"],
      ["메일 star@example.com 으로", "이메일"],
      ["900101-1234567 이에요", "주민등록번호"],
      ["입금 110-123-456789 부탁", "계좌번호"],
      ["자세한 건 https://example.com 에서", "링크"],
      ["오픈채팅으로 오세요 상담해요", "연락처"],
      ["이거 완전 씨발 맞음 진짜로", "욕설"],
      ["ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ", "같은 글자"],
    ];
    for (const [line, word] of cases) expect(reviewProblem(line), line).toContain(word);
  });
});

describe("maskNickname", () => {
  it("shows the first and last characters only", () => {
    expect(maskNickname("별빛냥")).toBe("별*냥");
    expect(maskNickname("스타로그팬")).toBe("스***팬");
    expect(maskNickname("민지")).toBe("민*");
    expect(maskNickname("A")).toBe("*");
    expect(maskNickname(null)).toBe("스타로그 이용자");
    expect(maskNickname("  ")).toBe("스타로그 이용자");
  });
});
