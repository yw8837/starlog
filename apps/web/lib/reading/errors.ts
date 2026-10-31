import { CARE_BODY, CARE_TITLE } from "@/lib/crisis";
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
  /** A stated thought of dying or self-harm (lib/crisis.ts active tier): the care copy and the helplines, no reading. */
  care?: boolean;
  /** With care: a plan or a means was named too, so the emergency lines lead. */
  urgent?: boolean;
}

export type ErrorContext = "reading" | "teaser" | "tarot-draw" | "followup" | "daily" | "paid" | "gift";

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

/**
 * A paid or gift reading that failed mid-way: nobody knows yet whether it was saved (M4). Shown
 * until the result page has checked the account (lib/storage/sync.ts checkDelivery).
 */
export const CREDIT_CHECKING: ErrorView = { title: "풀이가 열렸는지 확인하고 있어요", body: "잠시만 기다려 주세요.", action: null };

/**
 * The check found the purchase or the gift unused: only now may the page say so. A purchase left while
 * it was written comes back too but is no longer refundable (F1), so no refund is promised here.
 */
export function creditKept(context: "paid" | "gift"): ErrorView {
  return {
    title: "풀이를 다 적지 못했어요",
    body: context === "paid" ? "결제한 풀이는 그대로 남아 있어요. 다시 열어 끝까지 받을 수 있어요." : "가입 선물은 그대로예요. 한 번 더 시도해 주세요.",
    action: "retry",
  };
}

/** The check could not tell yet: point to where the answer will show, promise nothing unseen. */
export function creditUnknown(context: "paid" | "gift"): ErrorView {
  return {
    title: "풀이가 열렸는지 아직 확인하지 못했어요",
    body:
      context === "paid"
        ? "몇 분 안에 내 정보의 결제한 풀이나 기록에 나타나요. 열리지 않은 결제는 다시 열 수 있고, 환불할 수 있는 결제면 내 정보에 환불받기가 보여요."
        : "몇 분 안에 내 정보의 가입 선물이나 기록에서 확인할 수 있어요.",
    action: null,
  };
}

export function describeApiError(error: ApiError, context: ErrorContext = "reading", now: number = Date.now()): ErrorView {
  switch (error.code) {
    case "BETA_LIMIT":
      // The network's day count (shared by everyone on one Wi-Fi, office or school), whatever was asked for.
      if (error.scope === "network") {
        return { title: "같은 네트워크(와이파이·회사·학교)에서 오늘 열 수 있는 횟수를 다 썼어요", body: resetLine(error.resetsAt, now), action: null };
      }
      // 오픈 기념 무료 is used on this device: it does not come back, so no reset line.
      if (error.scope === "first") return { title: "오픈 기념 무료 풀이를 이미 열었어요", action: null };
      // 오픈 기념 무료 is once per account too (owner 2026-10-27): taken on another device, this one keeps its own.
      if (error.scope === "account") return { title: "이 계정으로는 오픈 기념 무료 풀이를 이미 받았어요", action: null };
      // A buyer's premium previews of the day (lib/premium/routes.ts): the purchase needs none (review 2026-10-20 A5).
      if (error.scope === "buyer") return { title: "오늘 볼 수 있는 미리보기를 모두 봤어요", body: "결제한 풀이는 바로 열 수 있어요.", action: null };
      if (context === "followup" && error.scope === "chapter") return { title: "이 풀이에서 물어볼 수 있는 질문을 모두 썼어요", action: null };
      if (context === "followup") return { title: "오늘 물어볼 수 있는 질문을 모두 썼어요", body: resetLine(error.resetsAt, now), action: null };
      if (context === "daily") return { title: "오늘의 운세를 더 적을 수 없어요", body: resetLine(error.resetsAt, now), action: null };
      if (context === "teaser") return { title: "오늘 볼 수 있는 첫 장을 모두 봤어요", body: resetLine(error.resetsAt, now), action: null };
      return { title: "오늘 열 수 있는 풀이를 모두 열었어요", body: resetLine(error.resetsAt, now), action: null };
    case "RATE_LIMIT":
      return { title: "잠시 후 다시 해 주세요", body: "요청이 잠깐 몰렸어요.", action: "retry" };
    case "AI_UNAVAILABLE":
      return { title: "풀이를 준비하고 있어요", body: "조금 뒤에 다시 와 주세요.", action: "home" };
    case "REFUSED":
      // Not an error (owner 2026-10-31): the feeling first, the reason in a line, the count kept, the way back open.
      if (error.care) return { title: CARE_TITLE, body: error.message || CARE_BODY, action: "edit", care: true, ...(error.urgent ? { urgent: true } : {}) };
      return { title: "이 내용으로는 풀이를 만들 수 없어요", body: "질문이나 메모를 바꿔 다시 시도해 주세요.", action: "edit" };
    case "QUALITY":
    case "UPSTREAM":
      if (context === "paid" || context === "gift") return CREDIT_CHECKING;
      if (context === "tarot-draw") return { title: "카드를 나누지 못했어요", body: "다시 시도해 주세요.", action: "retry" };
      return { title: "풀이를 다 적지 못했어요", body: "횟수는 그대로예요. 한 번 더 시도해 주세요.", action: "retry" };
    case "TIMEOUT":
      if (context === "paid" || context === "gift") return CREDIT_CHECKING;
      // Given up on the client: whether the server had counted it is not known, so no promise about the count.
      return { title: "답이 너무 오래 걸리고 있어요", body: "잠시 뒤 다시 시도해 주세요.", action: "retry" };
    case "INVALID":
      if (context === "paid" || context === "gift") return CREDIT_CHECKING;
      return { title: "풀이를 제대로 받지 못했어요", body: "다시 시도해 주세요.", action: "retry" };
    case "NETWORK":
      if (context === "paid" || context === "gift") return CREDIT_CHECKING;
      // Drawing cards costs nothing, so there is no count to reassure about.
      if (context === "tarot-draw") return { title: "연결이 잠시 끊겼어요", body: "다시 시도해 주세요.", action: "retry" };
      return { title: "연결이 잠시 끊겼어요", body: "횟수는 그대로예요. 다시 시도해 주세요.", action: "retry" };
    case "BAD_TOKEN":
      if (context === "followup") return { title: "이 풀이에는 더 물어볼 수 없어요", body: error.message, action: null };
      return { title: "카드 정보가 오래됐어요", body: "카드를 다시 뽑아 주세요.", action: "redraw" };
    case "BAD_REQUEST":
      if (error.field && error.message) return { title: error.message, action: "edit" };
      return { title: "요청을 읽지 못했어요", body: "처음부터 다시 시도해 주세요.", action: "edit" };
    case "LOGIN_REQUIRED":
      return { title: "로그인이 필요해요", body: "로그인하고 다시 열어 주세요.", action: null };
    case "PAYMENT_REQUIRED":
      return { title: "전체 풀이는 결제하고 열 수 있어요", action: null };
    case "NO_CREDIT":
      return { title: "열 수 있는 결제한 풀이가 없어요", body: "결제하고 열 수 있어요.", action: null };
    case "PAY_UNAVAILABLE":
      return { title: "지금은 결제를 쓸 수 없어요", body: "잠시 뒤에 다시 시도해 주세요.", action: "retry" };
    case "FORBIDDEN":
      return { title: "다시 시도해 주세요", body: "화면을 새로 고친 뒤 다시 눌러 주세요.", action: "retry" };
    case "NOT_AVAILABLE":
      // A 오픈 기념 무료 reading takes no follow-ups: the server says why.
      if (context === "followup") return { title: "이 풀이에는 더 물어볼 수 없어요", body: error.message, action: null };
      // 오픈 기념 무료's claim could not be checked (lib/api/unlock.ts): it fails closed for now.
      if (error.reason === "opening") return { title: "지금은 오픈 기념 무료를 열 수 없어요", body: "잠시 뒤에 다시 시도해 주세요.", action: "retry" };
      // Another tab or device of the account is opening it right now (lib/account/openingClaim.ts "busy").
      if (error.reason === "opening-busy") return { title: "다른 화면에서 오픈 기념 무료 풀이를 열고 있어요", body: "잠시 뒤에 다시 확인해 주세요.", action: "retry" };
      // L-1: a purchase whose reading kept failing opens no more; it was not used (lib/api/unlock.ts CAPPED_MESSAGE).
      if (error.reason === "capped") return { title: context === "gift" ? "이 가입 선물로는 더 열 수 없어요" : "이 결제로는 더 열 수 없어요", body: error.message, action: null };
      return { title: "지금은 열 수 없는 상품이에요", action: "home" };
    case "PAY_FAILED":
      return { title: "결제를 마치지 못했어요", body: error.message || "청구된 금액은 없어요.", action: "retry" };
    case "PAY_PENDING":
      return { title: "결제를 확인하고 있어요", body: "잠시 뒤에 다시 확인해 주세요.", action: "retry" };
    case "NOT_REFUNDABLE":
      return { title: "환불할 수 없는 결제예요", body: "이미 연 풀이이거나 환불을 처리하고 있어요.", action: null };
    case "REFUND_WINDOW_CLOSED":
      return { title: "환불 가능 기간이 지났어요", body: "문제가 있으면 문의해 주세요.", action: null };
    case "BOT_CHECK":
      // The Turnstile challenge could not be passed (script blocked, failed or timed out); a retry runs it again.
      return { title: "보안 확인을 마치지 못했어요", body: "다시 시도해 주세요.", action: "retry" };
  }
}
