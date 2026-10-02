import { describe, expect, it } from "vitest";
import { meStatusMessage } from "./meStatus";

describe("내 정보 status line", () => {
  it("speaks for each way back to /me", () => {
    expect(meStatusMessage({ account: "deleted" })).toBe("탈퇴했어요. 그동안 고마웠어요.");
    expect(meStatusMessage({ delete: "failed" })).toBe("탈퇴를 마치지 못했어요. 다시 시도해 주세요.");
    expect(meStatusMessage({ delete: "mismatch" })).toBe("로그인한 카카오 계정과 달라요. 같은 계정으로 다시 시도해 주세요.");
    expect(meStatusMessage({ delete: "refund-failed" })).toBe("환불을 마치지 못해 탈퇴를 멈췄어요. 문의해 주세요.");
    expect(meStatusMessage({ delete: "pending" })).toBe("결제 확인이나 환불이 아직 진행 중이에요. 10분쯤 뒤에 다시 시도해 주세요.");
    expect(meStatusMessage({ delete: "in-use" })).toBe("지금 열고 있는 풀이가 있어요. 풀이가 끝난 뒤 다시 시도해 주세요.");
    expect(meStatusMessage({ delete: "cancel" })).toBe("탈퇴를 취소했어요");
    expect(meStatusMessage({ login: "cancel" })).toBe("로그인을 취소했어요");
    expect(meStatusMessage({})).toBeNull();
  });
});
