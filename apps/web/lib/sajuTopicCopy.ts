import type { SajuTopicsMode } from "@/lib/config";

/**
 * Copy that follows the flag (saju-topics spec §5.4, owner cut §0): the 운 wording appears from the `on`
 * build; `off` and `owner` builds keep today's public copy.
 */

/** 가격 안내: the saju reading's second line. */
export const sajuPricingLine = (mode: SajuTopicsMode): string =>
  mode === "on" ? "사주팔자·연애운·재회운·재물운·직장운 가운데 고른 풀이 하나" : "명식을 주제별로 읽은 풀이, 오행과 십신, 지금의 10년(대운)";

/** 가격 안내: what saju shows free (owner 2026-11-04: the 명식 without a login, the 맛보기 with one; no day count shown). */
export const sajuFreeLine = (mode: SajuTopicsMode): string =>
  mode === "on"
    ? "사주는 명식(네 기둥, 오행 분포, 일간)을 로그인 없이 무료로 볼 수 있어요. 사주팔자와 연애운, 재회운, 재물운, 직장운의 맛보기는 로그인하면 무료로 볼 수 있어요."
    : "사주는 명식(네 기둥, 오행 분포, 일간)을 로그인 없이 무료로 볼 수 있고, 맛보기는 로그인하면 무료로 볼 수 있어요.";

/** 개인정보처리방침: what a saju reading sends with the request (국외 이전 항목). */
export const sajuPrivacySent = (mode: SajuTopicsMode): string => (mode === "on" ? "고른 운과 요즘 상황(고른 칩)" : "요즘 상황(고른 칩)");

/** 개인정보처리방침: the saju line of 1. 처리하는 개인정보 항목. */
export const sajuPrivacyItem = (mode: SajuTopicsMode): string =>
  mode === "on" ? "고른 운(연애운·재회운·재물운·직장운)과 요즘 상황(연애·일 상태, 고른 경우)" : "요즘 상황(연애·일 상태, 고른 경우)";
