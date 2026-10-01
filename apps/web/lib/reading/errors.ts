import { CRISIS_LEAD } from "@/lib/crisis";
import type { ApiError } from "./api";

/**
 * What a screen shows for an API error: friendly Korean, never the code. `action` is the one way
 * forward the screen offers; null when there is nothing to do but wait (a limit).
 */

export type ErrorAction = "retry" | "redraw" | "edit" | "home";

export interface ErrorView {
  title: string;
  body?: string;
  action: ErrorAction | null;
  /** Crisis words: calm copy and the helplines (CrisisContacts), no reading. */
  care?: boolean;
}

export type ErrorContext = "reading" | "teaser" | "tarot-draw" | "followup" | "daily";

const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const kstDayNumber = (ms: number) => Math.floor((ms + KST_MS) / DAY_MS);

/** "내일 0시에 다시 열려요" for the usual next-KST-midnight reset; the time otherwise. */
export function resetLine(resetsAt: string | undefined, now: number = Date.now()): string {
  const at = resetsAt ? Date.parse(resetsAt) : Number.NaN;
  if (!Number.isFinite(at)) return "내일 0시에 다시 열려요";
  const kst = new Date(at + KST_MS);
  const hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();
  const time = minute ? `${hour}시 ${minute}분` : `${hour}시`;
  const days = kstDayNumber(at) - kstDayNumber(now);
  if (days <= 0) return `오늘 ${time}에 다시 열려요`;
  if (days === 1) return `내일 ${time}에 다시 열려요`;
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${time}에 다시 열려요`;
}

export function describeApiError(error: ApiError, context: ErrorContext = "reading", now: number = Date.now()): ErrorView {
  switch (error.code) {
    case "BETA_LIMIT":
      // The network's day count (shared by everyone on one Wi-Fi, office or school), whatever was asked for.
      if (error.scope === "network") {
        return { title: "같은 네트워크(와이파이·회사·학교)에서 오늘 열 수 있는 횟수를 다 썼어요", body: resetLine(error.resetsAt, now), action: null };
      }
      if (context === "followup" && error.scope === "chapter") return { title: "이 풀이에서 물어볼 수 있는 질문을 모두 썼어요", action: null };
      if (context === "followup") return { title: "오늘 물어볼 수 있는 질문을 모두 썼어요", body: resetLine(error.resetsAt, now), action: null };
      if (context === "daily") return { title: "오늘은 쪽지를 더 펼 수 없어요", body: resetLine(error.resetsAt, now), action: null };
      if (context === "teaser") return { title: "오늘 볼 수 있는 첫 장을 모두 봤어요", body: resetLine(error.resetsAt, now), action: null };
      return { title: "오늘 열 수 있는 풀이를 모두 열었어요", body: resetLine(error.resetsAt, now), action: null };
    case "RATE_LIMIT":
      return { title: "잠시 후 다시 해 주세요", body: "요청이 잠깐 몰렸어요.", action: "retry" };
    case "AI_UNAVAILABLE":
      return { title: "풀이를 준비하고 있어요", body: "조금 뒤에 다시 와 주세요.", action: "home" };
    case "REFUSED":
      if (error.care) return { title: "잠시 멈춰도 괜찮아요", body: error.message || CRISIS_LEAD, action: "edit", care: true };
      return { title: "이 내용으로는 풀이를 만들 수 없어요", body: "질문이나 메모를 바꿔 다시 시도해 주세요.", action: "edit" };
    case "QUALITY":
    case "UPSTREAM":
      if (context === "tarot-draw") return { title: "카드를 나누지 못했어요", body: "다시 시도해 주세요.", action: "retry" };
      return { title: "풀이를 다 적지 못했어요", body: "횟수는 그대로예요. 한 번 더 시도해 주세요.", action: "retry" };
    case "NETWORK":
      // Drawing cards costs nothing, so there is no count to reassure about.
      if (context === "tarot-draw") return { title: "연결이 잠시 끊겼어요", body: "다시 시도해 주세요.", action: "retry" };
      return { title: "연결이 잠시 끊겼어요", body: "횟수는 그대로예요. 다시 시도해 주세요.", action: "retry" };
    case "BAD_TOKEN":
      if (context === "followup") return { title: "이 풀이에는 더 물어볼 수 없어요", body: error.message, action: null };
      return { title: "카드 정보가 오래됐어요", body: "카드를 다시 뽑아 주세요.", action: "redraw" };
    case "BAD_REQUEST":
      if (error.field && error.message) return { title: error.message, action: "edit" };
      return { title: "요청을 읽지 못했어요", body: "처음부터 다시 시도해 주세요.", action: "edit" };
  }
}
