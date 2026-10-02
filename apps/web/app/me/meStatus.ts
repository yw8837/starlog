import { loginMessage } from "@/lib/account/client";

const DELETE_MESSAGES: Record<string, string> = {
  failed: "탈퇴를 마치지 못했어요. 다시 시도해 주세요.",
  mismatch: "로그인한 카카오 계정과 달라요. 같은 계정으로 다시 시도해 주세요.",
  "refund-failed": "환불을 마치지 못해 탈퇴를 멈췄어요. 문의해 주세요.",
  pending: "결제 확인이나 환불이 아직 진행 중이에요. 10분쯤 뒤에 다시 시도해 주세요.",
  "in-use": "지금 열고 있는 풀이가 있어요. 풀이가 끝난 뒤 다시 시도해 주세요.",
  cancel: "탈퇴를 취소했어요",
  unavailable: "지금은 탈퇴를 처리할 수 없어요. 잠시 뒤에 다시 시도해 주세요.",
};

/** The one line 내 정보 shows for ?account=, ?delete= or ?login=. */
export function meStatusMessage(query: { account?: string; delete?: string; login?: string }): string | null {
  if (query.account === "deleted") return "탈퇴했어요. 그동안 고마웠어요.";
  if (query.delete) return DELETE_MESSAGES[query.delete] ?? DELETE_MESSAGES.failed!;
  return loginMessage(query.login ?? null);
}
